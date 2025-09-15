import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import cron from "node-cron";
import Sentiment from "sentiment";

import Student from "./models/Student.js";
import Parent from "./models/Parent.js";
import Mentor from "./models/Mentor.js";
import Faq from "../models/Faq.js"; 
import Badge from "./models/Badge.js";
import BadgeMeta from "./models/BadgeMeta.js";
import Reminder from "./models/Reminder.js";
import ChatLog from "./models/ChatLog.js";

import { findBestFaq, refreshFaqCache } from "./utils/getFaqData.js";

dotenv.config();
const app = express();
app.use(bodyParser.json());
app.use(cors());

// ---------- Config ----------
const ADMIN_KEY = process.env.ADMIN_KEY || "admin-secret";
const PORT = process.env.PORT || 5000;
const AUTO_SEED = process.env.AUTO_SEED === "true";

// ---------- Health ----------
app.get("/", (req, res) => {
  res.send("✅ Student Support Backend running with FAQs + Affirmations!");
});

// ---------- DB ----------
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log("✅ MongoDB connected");
    try { await refreshFaqCache(); } catch (err) { console.warn("FAQ cache init failed:", err.message); }
  })
  .catch(err => console.error("❌ MongoDB error:", err));

const sentiment = new Sentiment();
const affirmations = [
  "🌟 You’re stronger than you think.",
  "💡 Every small step forward is progress.",
  "✨ Your efforts today build your future tomorrow.",
  "🌱 Growth takes time — and you’re on your way.",
  "🔥 Keep going, you’re doing amazing.",
  "☀️ Even the darkest night ends with sunrise.",
  "🎯 Stay focused, your dreams are valid.",
  "❤️ Asking for help is a sign of strength.",
];
function getAffirmation(name = null) {
  const a = affirmations[Math.floor(Math.random() * affirmations.length)];
  return name ? `Hey ${name.split(" ")[0]} — ${a}` : a;
}
function sendResponse(text) {
  return { fulfillmentText: text, fulfillmentMessages: [{ text: { text: [text] } }] };
}
async function logChat({ query, response, intent, matchedQuestion = null, matchSource = "none", similarity = 0, affirmation = null }) {
  try { await ChatLog.create({ query, response, intent, matchedQuestion, matchSource, similarity, affirmation }); }
  catch (err) { console.error("❌ ChatLog save error:", err.message); }
}

// ---------- Webhook ----------
app.post("/webhook", async (req, res) => {
  const intent = req.body.queryResult?.intent?.displayName || "unknown";
  const params = req.body.queryResult?.parameters || {};
  const queryText = (req.body.queryResult?.queryText || "").trim();

  const studentId = params.studentId || params.userID || null;
  const parentId = params.parentId || null;
  const mentorId = params.mentorId || null;
  const studentProfile = studentId ? await Student.findOne({ studentId }).lean() : null;

  try {
    // Finance
    if (intent === "FinanceIntent") {
      if (!studentId) return res.json(sendResponse("Please provide your Student ID (e.g., STU001)."));
      const student = await Student.findOne({ studentId });
      if (!student) return res.json(sendResponse("⚠️ No student found for that ID."));
      try { await Badge.create({ studentId, badgeName: "Finance Explorer", reason: "Checked finance summary" }); } catch {}
      const resp = `💰 *Finance Summary*\nStudent: ${student.name}\nPending Fees: ₹${student.feesPending}\nScholarships: ${student.scholarships.join(", ")}\n\n${getAffirmation(student.name)}`;
      await logChat({ query: queryText, response: resp, intent, matchedQuestion: "FinanceSummary", matchSource: "db", similarity: 1 });
      return res.json(sendResponse(resp));
    }

    // Parent
    if (intent === "ParentStatusIntent") {
      if (!parentId) return res.json(sendResponse("Please provide your Parent ID (e.g., PARENT001)."));
      const parent = await Parent.findOne({ parentId });
      if (!parent) return res.json(sendResponse("⚠️ No parent found for that ID."));
      const child = await Student.findOne({ studentId: parent.studentId });
      const resp = `👨‍👩‍👦 *Parent Dashboard*\nChild: ${child?.name || parent.studentId}\nAttendance: ${child?.attendance}\nMarks: ${child?.marks}\nFees Pending: ₹${child?.feesPending}`;
      return res.json(sendResponse(resp));
    }

    // Mentor
    if (intent === "MentorStatusIntent") {
      if (!mentorId) return res.json(sendResponse("Please provide your Mentor ID (e.g., MENTOR001)."));
      const mentor = await Mentor.findOne({ mentorId });
      if (!mentor) return res.json(sendResponse("⚠️ No mentor found for that ID."));
      const resp = `👨‍🏫 *Mentor Dashboard*\nMentees: ${mentor.mentees.join(", ")}\n\n${getAffirmation()}`;
      return res.json(sendResponse(resp));
    }

    // Counseling
    if (intent === "CounselingIntent") {
      const resp = `🧠 *Counseling Support*\nA counselor will contact you soon.\n${getAffirmation(studentProfile?.name)}`;
      return res.json(sendResponse(resp));
    }

    // Distress
    if (intent === "DistressIntent") {
      const resp = `🚨 *Distress Alert*\nYou’re not alone. A counselor will be notified.\nCall 📞 1800-599-0019 if urgent.\n${getAffirmation(studentProfile?.name)}`;
      return res.json(sendResponse(resp));
    }

    // Marketplace
    if (intent === "MarketplaceIntent") {
      const resp = `🛒 *Marketplace Listings*\n- Books\n- Calculators\n- Hostel Essentials\n- Laptops\n${getAffirmation(studentProfile?.name)}`;
      return res.json(sendResponse(resp));
    }

    // Mentorship
    if (intent === "MentorshipIntent") {
      const resp = `👨‍🏫 *Mentorship Available*\nMentors in CS, Mechanical, Commerce, AI/DS.\n${getAffirmation(studentProfile?.name)}`;
      return res.json(sendResponse(resp));
    }

    // Reminders
    if (intent === "ReminderIntent") {
      const userId = studentId || parentId || mentorId || "GENERIC";
      const reminders = await Reminder.find({ targetId: { $in: [userId, "GENERIC"] } }).sort({ createdAt: -1 }).limit(5);
      const resp = reminders.length
        ? `📌 Reminders:\n${reminders.map((r, i) => `${i + 1}. ${r.message}`).join("\n")}`
        : "📭 No reminders right now.";
      return res.json(sendResponse(`${resp}\n\n${getAffirmation(studentProfile?.name)}`));
    }

    // Default Fallback
    if (intent === "Default Fallback Intent") {
      const sentimentResult = sentiment.analyze(queryText);
      if (sentimentResult.score <= -3) return res.json(sendResponse(`😔 You seem low. Want me to connect you to a counselor?\n${getAffirmation(studentProfile?.name)}`));
      if (sentimentResult.score >= 3) return res.json(sendResponse(`😊 Glad you’re doing well! Need study tips?\n${getAffirmation(studentProfile?.name)}`));

      const best = await findBestFaq(queryText);
      if (best) return res.json(sendResponse(`${best.answer}\n\n${getAffirmation(studentProfile?.name)}`));

      return res.json(sendResponse(`🙏 Sorry, I couldn’t find an exact answer. I can help in Finance, Mentorship, Counseling, or Marketplace.\n${getAffirmation(studentProfile?.name)}`));
    }

    return res.json(sendResponse(`I can guide you in Finance, Mentorship, Counseling, or Marketplace. ${getAffirmation(studentProfile?.name)}`));
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    return res.json(sendResponse(`⚠️ Something went wrong. ${getAffirmation()}`));
  }
});

// ---------- Start ----------
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
