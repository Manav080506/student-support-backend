// server.js
import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import Sentiment from "sentiment";

import Student from "./models/Student.js";
import Parent from "./models/Parent.js";
import Mentor from "./models/Mentor.js";
import Faq from "./models/Faq.js";
import Badge from "./models/Badge.js";
import BadgeMeta from "./models/BadgeMeta.js";
import Reminder from "./models/Reminder.js";
import ChatLog from "./models/ChatLog.js";

import { findBestFaq, refreshFaqCache } from "./utils/getFaqData.js";

dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(cors());

const PORT = process.env.PORT || 5000;
const sentiment = new Sentiment();

// --- Affirmations ---
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

// --- Helpers ---
function sendResponse(text) {
  return { fulfillmentText: text, fulfillmentMessages: [{ text: { text: [text] } }] };
}

// --- DB Connection ---
mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/student-support", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(async () => {
  console.log("✅ MongoDB connected");
  try { await refreshFaqCache(); } catch (err) { console.warn("FAQ cache init failed:", err.message); }
}).catch(err => console.error("❌ MongoDB error:", err));

// --- Webhook ---
app.post("/webhook", async (req, res) => {
  const intent = req.body.queryResult?.intent?.displayName || "unknown";
  const params = req.body.queryResult?.parameters || {};
  const userQueryRaw = (req.body.queryResult?.queryText || "").trim();

  const studentId = params.studentId || params.userID || null;
  const parentId = params.parentId || null;
  const mentorId = params.mentorId || null;

  const studentProfile = studentId ? await Student.findOne({ studentId }).lean() : null;

  try {
    // --- FinanceIntent ---
    if (intent === "FinanceIntent") {
      if (!studentId) return res.json(sendResponse("Please provide your Student ID (e.g., STU001)."));
      const student = await Student.findOne({ studentId });
      if (!student) return res.json(sendResponse("⚠️ No details found for that student ID."));
      try { await Badge.create({ studentId, badgeName: "Finance Explorer", reason: "Checked finance summary" }); } catch {}
      const resp = `💰 *Finance Summary*\n- Student: ${student.name}\n- Pending Fees: ₹${student.feesPending}\n- Scholarships: ${student.scholarships.join(", ")}\n\n${getAffirmation(student.name)}`;
      return res.json(sendResponse(resp));
    }

    // --- ParentStatusIntent ---
    if (intent === "ParentStatusIntent") {
      if (!parentId) return res.json(sendResponse("Please provide your Parent ID (e.g., PARENT001)."));
      const parent = await Parent.findOne({ parentId });
      if (!parent) return res.json(sendResponse("⚠️ No details found for that parent ID."));
      try { await Badge.create({ studentId: parentId, badgeName: "Engaged Parent", reason: "Viewed child dashboard" }); } catch {}
      const child = await Student.findOne({ studentId: parent.studentId });
      const resp = `👨‍👩‍👦 *Parent Dashboard*\nChild: ${child?.name || parent.studentId}\nAttendance: ${child?.attendance}\nMarks: ${child?.marks}\nFees Pending: ₹${child?.feesPending}\n\n${getAffirmation(child?.name)}`;
      return res.json(sendResponse(resp));
    }

    // --- MentorStatusIntent ---
    if (intent === "MentorStatusIntent") {
      if (!mentorId) return res.json(sendResponse("Please provide your Mentor ID (e.g., MENTOR001)."));
      const mentor = await Mentor.findOne({ mentorId });
      if (!mentor) return res.json(sendResponse("⚠️ No details found for that mentor ID."));
      try { await Badge.create({ studentId: mentorId, badgeName: "Active Mentor", reason: "Reviewed mentees" }); } catch {}
      const resp = `👨‍🏫 *Mentor Dashboard*\nMentees: ${mentor.mentees.join(", ")}\n\n${getAffirmation()}`;
      return res.json(sendResponse(resp));
    }

    // --- CounselingIntent ---
    if (intent === "CounselingIntent") {
      try { await Badge.create({ studentId: studentProfile?.studentId || "GENERIC", badgeName: "Wellbeing Seeker", reason: "Asked for counseling" }); } catch {}
      const resp = `🧠 *Counseling Support*\nA counselor will contact you soon.\nMeanwhile, try deep breathing.\n\n${getAffirmation(studentProfile?.name)}`;
      return res.json(sendResponse(resp));
    }

    // --- DistressIntent ---
    if (intent === "DistressIntent") {
      const resp = `🚨 *Distress Alert*\nYou are not alone. A counselor will be notified.\nUrgent? Call 📞 1800-599-0019\n\n${getAffirmation(studentProfile?.name)}`;
      return res.json(sendResponse(resp));
    }

    // --- MarketplaceIntent ---
    if (intent === "MarketplaceIntent") {
      const resp = `🛒 *Marketplace Listings*\n- 📚 Used Textbooks\n- 🧮 Calculators\n- 🛏 Hostel Essentials\n- 💻 Laptops\n\n${getAffirmation(studentProfile?.name)}`;
      return res.json(sendResponse(resp));
    }

    // --- MentorshipIntent ---
    if (intent === "MentorshipIntent") {
      const resp = `👨‍🏫 *Mentorship Available*\nMentors in CS, Mechanical, Commerce, AI/DS.\n\n${getAffirmation(studentProfile?.name)}`;
      return res.json(sendResponse(resp));
    }

    // --- ReminderIntent ---
    if (intent === "ReminderIntent") {
      const userId = studentId || parentId || mentorId || "GENERIC";
      const reminders = await Reminder.find({ targetId: { $in: [userId, "GENERIC"] } }).sort({ createdAt: -1 }).limit(5).lean();
      const resp = reminders.length
        ? `📌 Reminders:\n${reminders.map((r, i) => `${i + 1}. ${r.message}`).join("\n")}\n\n${getAffirmation(studentProfile?.name)}`
        : `📭 No reminders.\n\n${getAffirmation(studentProfile?.name)}`;
      return res.json(sendResponse(resp));
    }

    // --- Default Fallback ---
    if (intent === "Default Fallback Intent") {
      // Sentiment check
      const sentimentResult = sentiment.analyze(userQueryRaw);
      if (sentimentResult.score <= -3) {
        return res.json(sendResponse(`😔 You seem low. Want me to connect you to a counselor?\nCall 📞 1800-599-0019\n\n${getAffirmation(studentProfile?.name)}`));
      }
      if (sentimentResult.score >= 3) {
        return res.json(sendResponse(`😊 Glad you’re doing well! Need study tips?\n\n${getAffirmation(studentProfile?.name)}`));
      }

      // FAQ lookup
      const best = await findBestFaq(userQueryRaw);
      if (best) {
        return res.json(sendResponse(`${best.answer}\n\n${getAffirmation(studentProfile?.name)}`));
      }

      // --- Synonym Safety Net ---
      const lowerQ = userQueryRaw.toLowerCase();
      if (["fees", "fee", "scholarship", "finance", "dues"].some(w => lowerQ.includes(w))) {
        return res.json(sendResponse("💰 It looks like you want finance help. Please provide your Student ID (e.g., STU001)."));
      }
      if (["mentor", "mentorship", "senior", "guide", "career"].some(w => lowerQ.includes(w))) {
        return res.json(sendResponse("👨‍🏫 It looks like you want a mentor. We have mentors in CS, Mechanical, Commerce, AI/DS."));
      }
      if (["sell", "buy", "marketplace", "books", "calculator", "essentials"].some(w => lowerQ.includes(w))) {
        return res.json(sendResponse("🛒 Looking for marketplace items? You can buy/sell books, calculators, and hostel essentials here."));
      }
      if (["counselor", "counseling", "anxious", "depressed", "help"].some(w => lowerQ.includes(w))) {
        return res.json(sendResponse("🧠 It seems you may need counseling support. A counselor can be notified to assist you."));
      }

      // Final fallback
      return res.json(sendResponse(`🙏 Sorry, I couldn’t find an exact answer. I can help in Finance, Mentorship, Counseling, or Marketplace.\n\n${getAffirmation(studentProfile?.name)}`));
    }

    return res.json(sendResponse(`I can guide you in Finance, Mentorship, Counseling, or Marketplace. ${getAffirmation(studentProfile?.name)}`));
  } catch (err) {
    console.error("❌ Webhook error:", err.message || err);
    return res.json(sendResponse(`⚠️ Something went wrong. ${getAffirmation()}`));
  }
});

// --- Start ---
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
