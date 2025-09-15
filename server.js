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
      console.warn("⚠️ FAQ cache init failed:", e.message);
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

// ---------- Admin protection ----------
function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-key"] || req.query.adminKey;
  if (!key || key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized - admin key required" });
  next();
}

// ---------- Webhook ----------
app.post("/webhook", async (req, res) => {
  const intent = req.body.queryResult?.intent?.displayName || "unknown";
  const params = req.body.queryResult?.parameters || {};
  const userQueryRaw = (req.body.queryResult?.queryText || "").trim();

  const studentIdParam = params.studentId || params.userID || null;
  const parentIdParam = params.parentId || null;
  const mentorIdParam = params.mentorId || null;

  const studentProfile = studentIdParam ? await Student.findOne({ studentId: studentIdParam }).lean() : null;

  try {
    // --- FinanceIntent ---
    if (intent === "FinanceIntent") {
      if (!studentIdParam) return res.json(sendResponse("Please provide your Student ID (e.g., STU001)."));
      const student = await Student.findOne({ studentId: studentIdParam });
      if (!student) return res.json(sendResponse("⚠️ I couldn’t find details for that student ID."));
      await Badge.create({ studentId: studentIdParam, badgeName: "Finance Explorer", reason: "Checked finance summary" }).catch(() => {});
      const resp = `💰 *Finance Summary*\n- Student: ${student.name}\n- Pending Fees: ₹${student.feesPending}\n- Scholarships: ${student.scholarships.join(", ")}\n\n${getAffirmation(student.name)}`;
      return res.json(sendResponse(resp));
    }

    // --- ParentStatusIntent ---
    if (intent === "ParentStatusIntent") {
      if (!parentIdParam) return res.json(sendResponse("Please provide your Parent ID (e.g., PARENT001)."));
      const parent = await Parent.findOne({ parentId: parentIdParam });
      if (!parent) return res.json(sendResponse("⚠️ I couldn’t find details for that parent ID."));
      await Badge.create({ studentId: parentIdParam, badgeName: "Engaged Parent", reason: "Viewed child dashboard" }).catch(() => {});
      const child = await Student.findOne({ studentId: parent.studentId });
      const resp = `👨‍👩‍👦 *Parent Dashboard*\nChild: ${child?.name || parent.studentId}\nAttendance: ${child?.attendance}\nMarks: ${child?.marks}\nFees Pending: ₹${child?.feesPending}`;
      return res.json(sendResponse(resp));
    }

    // --- MentorStatusIntent ---
    if (intent === "MentorStatusIntent") {
      if (!mentorIdParam) return res.json(sendResponse("Please provide your Mentor ID (e.g., MENTOR001)."));
      const mentor = await Mentor.findOne({ mentorId: mentorIdParam });
      if (!mentor) return res.json(sendResponse("⚠️ I couldn’t find details for that mentor ID."));
      await Badge.create({ studentId: mentorIdParam, badgeName: "Active Mentor", reason: "Reviewed mentees" }).catch(() => {});
      const resp = `👨‍🏫 *Mentor Dashboard*\nMentees: ${mentor.mentees.join(", ")}\n\n${getAffirmation()}`;
      return res.json(sendResponse(resp));
    }

    // --- CounselingIntent ---
    if (intent === "CounselingIntent") {
      await Badge.create({ studentId: studentProfile?.studentId || "GENERIC", badgeName: "Wellbeing Seeker", reason: "Asked for counseling" }).catch(() => {});
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
      const userId = studentIdParam || parentIdParam || mentorIdParam || "GENERIC";
      const reminders = await Reminder.find({ targetId: { $in: [userId, "GENERIC"] } }).sort({ createdAt: -1 }).limit(5).lean();
      const resp = reminders.length
        ? `📌 Reminders:\n${reminders.map((r, i) => `${i + 1}. ${r.message}`).join("\n")}\n\n${getAffirmation(studentProfile?.name)}`
        : `📭 No reminders.\n\n${getAffirmation(studentProfile?.name)}`;
      return res.json(sendResponse(resp));
    }

    // --- Default Fallback ---
    if (intent === "Default Fallback Intent") {
      const sentimentResult = sentiment.analyze(userQueryRaw);
      if (sentimentResult.score <= -3) {
        return res.json(sendResponse(`😔 You seem low. Want me to connect you to a counselor?\nCall 📞 1800-599-0019\n\n${getAffirmation(studentProfile?.name)}`));
      }
      if (sentimentResult.score >= 3) {
        return res.json(sendResponse(`😊 Glad you’re doing well! Need study tips?\n\n${getAffirmation(studentProfile?.name)}`));
      }

      const best = await findBestFaq(userQueryRaw);
      if (best) return res.json(sendResponse(`${best.answer}\n\n${getAffirmation(studentProfile?.name)}`));

      return res.json(sendResponse(`🙏 Sorry, I couldn’t find an exact answer. But I can help in Finance, Mentorship, Counseling, or Marketplace.\n\n${getAffirmation(studentProfile?.name)}`));
    }

    return res.json(sendResponse(`I can guide you in Finance, Mentorship, Counseling, or Marketplace. ${getAffirmation(studentProfile?.name)}`));
  } catch (err) {
    console.error("❌ Webhook error:", err.message || err);
    return res.json(sendResponse(`⚠️ Something went wrong. ${getAffirmation()}`));
  }
});

// ---------- Start ----------
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
