// server.js
import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import cron from "node-cron";
import Sentiment from "sentiment";

// Models
import Student from "./models/Student.js";
import Parent from "./models/Parent.js";
import Mentor from "./models/Mentor.js";
import Faq from "./models/Faq.js";
import Badge from "./models/Badge.js";
import BadgeMeta from "./models/BadgeMeta.js";
import Reminder from "./models/Reminder.js";
import ChatLog from "./models/ChatLog.js";

// Utils
import { findBestFaq, refreshFaqCache } from "./utils/getFaqData.js";

// Cron services
import syncCache from "./cron/syncCache.js";
import runReminders from "./cron/reminders.js";
import runBadges from "./cron/badges.js";

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
    // (… your intent handlers stay the same …)

    // --- Default Fallback Intent ---
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

// ---------- CRON JOBS ----------

// Sync FAQ cache immediately at startup
syncCache();

// Every 6 hours → sync FAQ cache
cron.schedule("0 */6 * * *", () => {
  console.log("⏳ Running FAQ cache sync...");
  syncCache();
});

// Daily reminders (9 AM)
cron.schedule("0 9 * * *", () => {
  console.log("⏳ Running daily reminders...");
  runReminders();
});

// Weekly badges (Monday midnight)
cron.schedule("0 0 * * MON", () => {
  console.log("⏳ Running weekly badge updates...");
  runBadges();
});

// ---------- Start ----------
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
