// server.js
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

// ---------- Config ----------
const ADMIN_KEY = process.env.ADMIN_KEY || "admin-secret";
const AUTO_SEED = process.env.AUTO_SEED === "true";
const PORT = process.env.PORT || 5000;

// ---------- Basic health ----------
app.get("/", (req, res) => {
  res.send("✅ Student Support Backend is running with 💡 + 🌟 affirmations!");
});

// ---------- MongoDB ----------
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/student-support", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log("✅ MongoDB connected");
    try {
      await refreshFaqCache();
    } catch (e) {
      console.warn("FAQ cache init failed:", e.message);
    }
    if (AUTO_SEED) await runAutoSeed();
  })
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ---------- Sentiment ----------
const sentiment = new Sentiment();

// ---------- Affirmations ----------
const affirmations = [
  "🌟 You’re stronger than you think.",
  "💡 Every small step forward is progress.",
  "✨ Your efforts today build your future tomorrow.",
  "🌱 Growth takes time — and you’re on your way.",
  "🔥 Keep going, you’re doing amazing.",
  "☀️ Even the darkest night ends with sunrise.",
  "🎯 Stay focused, your dreams are valid.",
  "❤️ Remember, asking for help is a sign of strength.",
];
function getAffirmation(name = null) {
  const a = affirmations[Math.floor(Math.random() * affirmations.length)];
  return name ? `Hey ${name.split(" ")[0]} — ${a}` : a;
}

// ---------- Helpers ----------
function sendResponse(text) {
  return { fulfillmentText: text, fulfillmentMessages: [{ text: { text: [text] } }] };
}
async function logChat({ query, response, intent, matchedQuestion = null, matchSource = "none", similarity = 0, affirmation = null }) {
  try {
    await ChatLog.create({ query, response, intent, matchedQuestion, matchSource, similarity, affirmation, createdAt: new Date() });
  } catch (err) {
    console.error("❌ ChatLog save error:", err.message || err);
  }
}

// ---------- Seeder ----------
async function runAutoSeed() {
  if (!(await Student.countDocuments())) {
    await Student.insertMany([
      { studentId: "STU001", name: "Manav Runthala", feesPending: 5000, scholarships: ["Computer Science"], marks: 82, attendance: 88 },
      { studentId: "STU002", name: "Daksh Beniwal", feesPending: 3000, scholarships: ["Mechanical Engineering"], marks: 74, attendance: 79 },
      { studentId: "STU003", name: "Disha Binani", feesPending: 0, scholarships: ["Commerce"], marks: 91, attendance: 95 },
    ]);
  }
  if (!(await Parent.countDocuments())) {
    await Parent.create({ parentId: "PARENT001", name: "Mr. Runthala", relation: "Father", studentId: "STU001" });
  }
  if (!(await Mentor.countDocuments())) {
    await Mentor.create({ mentorId: "MENTOR001", name: "Prof. Sharma", field: "Computer Science", mentees: ["STU001", "STU002"] });
  }
  if (!(await Faq.countDocuments())) {
    await Faq.insertMany([
      { category: "Finance", question: "What scholarships are available", answer: "🎓 Scholarships: merit and need-based. Check dashboard for eligibility." },
      { category: "Finance", question: "When is my fee due", answer: "Fee deadlines are posted on the finance dashboard. Contact finance for specifics." },
      { category: "Counseling", question: "I feel anxious", answer: "🧠 Try 4-4-4 breathing and reach out to a counselor if it persists." },
      { category: "Distress", question: "I feel depressed", answer: "🚨 If immediate danger, call local emergency services. Helpline: 1800-599-0019." },
      { category: "General", question: "Who are you", answer: "🤖 I am the Student Support Assistant — here to help with finance, mentorship, counseling and marketplace." },
    ]);
  }
  if (!(await BadgeMeta.countDocuments())) {
    await BadgeMeta.insertMany([
      { badgeName: "Finance Explorer", description: "Checked finance summary", icon: "💰" },
      { badgeName: "Engaged Parent", description: "Viewed child dashboard", icon: "👨‍👩‍👦" },
      { badgeName: "Active Mentor", description: "Reviewed mentees", icon: "👨‍🏫" },
      { badgeName: "Marketplace Explorer", description: "Browsed marketplace", icon: "🛒" },
      { badgeName: "Wellbeing Seeker", description: "Asked for counseling", icon: "🧠" },
      { badgeName: "Consistency Badge", description: "Daily engagement", icon: "🎖️" },
    ]);
  }
}

// ---------- Webhook ----------
app.post("/webhook", async (req, res) => {
  let intent = req.body.queryResult?.intent?.displayName || "unknown";
  const params = req.body.queryResult?.parameters || {};
  const userQueryRaw = (req.body.queryResult?.queryText || "").trim();

  const studentIdParam = Array.isArray(params.studentId) ? params.studentId[0] : params.studentId || params.userID || null;
  const parentIdParam = Array.isArray(params.parentId) ? params.parentId[0] : params.parentId;
  const mentorIdParam = Array.isArray(params.mentorId) ? params.mentorId[0] : params.mentorId;

  const studentProfile = studentIdParam ? await Student.findOne({ studentId: studentIdParam }).lean() : null;

  // ---------- Intent Overrides ----------
  const lowerQ = userQueryRaw.toLowerCase();
  let overrideApplied = null;

  if (intent === "ReminderIntent" || intent === "Default Fallback Intent") {
    if (lowerQ.includes("finance") || lowerQ.includes("fee") || lowerQ.includes("scholarship")) {
      intent = "FinanceIntent";
      overrideApplied = "FinanceIntent";
    }
    if (lowerQ.includes("parent") || lowerQ.includes("child") || lowerQ.includes("progress")) {
      intent = "ParentStatusIntent";
      overrideApplied = "ParentStatusIntent";
    }
    if (lowerQ.includes("mentor") || lowerQ.includes("mentee") || lowerQ.includes("students")) {
      intent = "MentorStatusIntent";
      overrideApplied = "MentorStatusIntent";
    }
    if (["counsel", "counseling", "therapist", "guidance", "advice"].some((w) => lowerQ.includes(w))) {
      intent = "CounselingIntent";
      overrideApplied = "CounselingIntent";
    }
    if (["distress", "depress", "sad", "anxious", "suicide", "panic"].some((w) => lowerQ.includes(w))) {
      intent = "DistressIntent";
      overrideApplied = "DistressIntent";
    }
  }

  try {
    let resp = "";

    // --- FinanceIntent ---
    if (intent === "FinanceIntent") {
      if (!studentIdParam) resp = "Please provide your Student ID (e.g., STU001).";
      else {
        const student = await Student.findOne({ studentId: studentIdParam });
        if (!student) resp = "⚠️ I couldn’t find details for that student ID.";
        else {
          try {
            await Badge.create({ studentId: studentIdParam, badgeName: "Finance Explorer", reason: "Checked finance summary" });
          } catch {}
          resp = `💰 *Finance Summary*\n- Student: ${student.name}\n- Pending Fees: ₹${student.feesPending}\n- Scholarships: ${student.scholarships.join(", ")}\n\n${getAffirmation(student.name)}`;
        }
      }
    }

    // --- ParentStatusIntent ---
    else if (intent === "ParentStatusIntent") {
      if (!parentIdParam) resp = "Please provide your Parent ID (e.g., PARENT001).";
      else {
        const parent = await Parent.findOne({ parentId: parentIdParam });
        if (!parent) resp = "⚠️ I couldn’t find details for that parent ID.";
        else {
          try {
            await Badge.create({ studentId: parentIdParam, badgeName: "Engaged Parent", reason: "Viewed child dashboard" });
          } catch {}
          const child = await Student.findOne({ studentId: parent.studentId });
          resp = `👨‍👩‍👦 *Parent Dashboard*\nChild: ${child?.name || parent.studentId}\nAttendance: ${child?.attendance}\nMarks: ${child?.marks}\nFees Pending: ₹${child?.feesPending}`;
        }
      }
    }

    // --- MentorStatusIntent ---
    else if (intent === "MentorStatusIntent") {
      if (!mentorIdParam) resp = "Please provide your Mentor ID (e.g., MENTOR001).";
      else {
        const mentor = await Mentor.findOne({ mentorId: mentorIdParam });
        if (!mentor) resp = "⚠️ I couldn’t find details for that mentor ID.";
        else {
          try {
            await Badge.create({ studentId: mentorIdParam, badgeName: "Active Mentor", reason: "Reviewed mentees" });
          } catch {}
          resp = `👨‍🏫 *Mentor Dashboard*\nMentees: ${mentor.mentees.join(", ")}\n\n${getAffirmation()}`;
        }
      }
    }

    // --- CounselingIntent ---
    else if (intent === "CounselingIntent") {
      try {
        await Badge.create({ studentId: studentProfile?.studentId || "GENERIC", badgeName: "Wellbeing Seeker", reason: "Asked for counseling" });
      } catch {}
      resp = `🧠 *Counseling Support*\nA counselor will contact you soon.\nMeanwhile, try deep breathing.\n\n${getAffirmation(studentProfile?.name)}`;
    }

    // --- DistressIntent ---
    else if (intent === "DistressIntent") {
      resp = `🚨 *Distress Alert*\nYou are not alone. A counselor will be notified.\nUrgent? Call 📞 1800-599-0019\n\n${getAffirmation(studentProfile?.name)}`;
    }

    // --- MarketplaceIntent ---
    else if (intent === "MarketplaceIntent") {
      resp = `🛒 *Marketplace Listings*\n- 📚 Used Textbooks\n- 🧮 Calculators\n- 🛏 Hostel Essentials\n- 💻 Laptops\n\n${getAffirmation(studentProfile?.name)}`;
    }

    // --- MentorshipIntent ---
    else if (intent === "MentorshipIntent") {
      resp = `👨‍🏫 *Mentorship Available*\nMentors in CS, Mechanical, Commerce, AI/DS.\n\n${getAffirmation(studentProfile?.name)}`;
    }

    // --- ReminderIntent ---
    else if (intent === "ReminderIntent") {
      const userId = studentIdParam || parentIdParam || mentorIdParam || "GENERIC";
      const reminders = await Reminder.find({ targetId: { $in: [userId, "GENERIC"] } }).sort({ createdAt: -1 }).limit(5).lean();
      resp = reminders.length
        ? `📌 Reminders:\n${reminders.map((r, i) => `${i + 1}. ${r.message}`).join("\n")}\n\n${getAffirmation(studentProfile?.name)}`
        : `📭 No reminders.\n\n${getAffirmation(studentProfile?.name)}`;
    }

    // --- Default Fallback ---
    else if (intent === "Default Fallback Intent") {
      const sentimentResult = sentiment.analyze(userQueryRaw);
      if (sentimentResult.score <= -3) {
        resp = `😔 You seem low. Want me to connect you to a counselor?\nCall 📞 1800-599-0019\n\n${getAffirmation(studentProfile?.name)}`;
      } else if (sentimentResult.score >= 3) {
        resp = `😊 Glad you’re doing well! Need study tips?\n\n${getAffirmation(studentProfile?.name)}`;
      } else {
        const best = await findBestFaq(userQueryRaw);
        resp = best
          ? `${best.answer}\n\n${getAffirmation(studentProfile?.name)}`
          : `🙏 Sorry, I couldn’t find an exact answer. But I can help in Finance, Mentorship, Counseling, or Marketplace.\n\n${getAffirmation(studentProfile?.name)}`;
      }
    }

    // Fallback catch-all
    else {
      resp = `I can guide you in Finance, Mentorship, Counseling, or Marketplace. ${getAffirmation(studentProfile?.name)}`;
    }

    // ---------- Log chat (with override info) ----------
    await logChat({
      query: userQueryRaw,
      response: resp,
      intent,
      matchedQuestion: overrideApplied ? "override_applied" : null,
      matchSource: overrideApplied ? `override:${overrideApplied}` : "normal",
      similarity: overrideApplied ? 1 : 0,
      affirmation: getAffirmation(studentProfile?.name),
    });

    return res.json(sendResponse(resp));
  } catch (err) {
    console.error("❌ Webhook error:", err.message || err);
    return res.json(sendResponse(`⚠️ Something went wrong. ${getAffirmation()}`));
  }
});

// ---------- Start ----------
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
