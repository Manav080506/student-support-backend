// server.js
import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import Sentiment from "sentiment";
import cron from "node-cron";

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

// Cron jobs
import syncCache from "./cron/syncCache.js";
import runReminders from "./cron/reminders.js";
import runBadges from "./cron/badges.js";

// Admin routes
import adminRoutes from "./routes/admin.js";

dotenv.config();
const app = express();
app.use(bodyParser.json());
app.use(cors());

// ---------- Config ----------
const ADMIN_KEY = process.env.ADMIN_KEY || "admin-secret";
const AUTO_SEED = process.env.AUTO_SEED === "true";
const PORT = process.env.PORT || 5000;
const WEBHOOK_TIMEOUT_MS = Number(process.env.WEBHOOK_TIMEOUT_MS || 2500);

// ---------- Basic health ----------
app.get("/", (req, res) => {
  res.send("✅ Student Support Backend is running — safe & monitored!");
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
  return name ? `Hey ${String(name).split(" ")[0]} — ${a}` : a;
}

// ---------- Helpers ----------
function sendResponse(text) {
  return { fulfillmentText: text, fulfillmentMessages: [{ text: { text: [text] } }] };
}

async function logChat({
  query,
  response,
  intent,
  matchedQuestion = null,
  matchSource = "none",
  similarity = 0,
  affirmation = null,
  latencyMs = null,
  isOffline = false,
  error = null,
}) {
  try {
    await ChatLog.create({
      query,
      response,
      intent,
      matchedQuestion,
      matchSource,
      similarity,
      affirmation,
      latencyMs,
      isOffline,
      error,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error("❌ ChatLog save error:", err.message || err);
  }
}

// timeout wrapper
async function withTimeout(promiseFn, ms = WEBHOOK_TIMEOUT_MS, fallbackText = null) {
  let timedOut = false;
  const timeout = new Promise((resolve) => {
    const t = setTimeout(() => {
      timedOut = true;
      resolve(fallbackText ?? `⚠️ Sorry — response timed out after ${ms}ms.`);
    }, ms);
    timeout.clear = () => clearTimeout(t);
  });
  try {
    const result = await Promise.race([promiseFn(), timeout]);
    if (timeout.clear) timeout.clear();
    return result;
  } catch (err) {
    if (timeout.clear) timeout.clear();
    return fallbackText ?? `⚠️ Error while processing request.`;
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
      { category: "General", question: "Who are you", answer: "🤖 I am the Student Support Assistant — here to help." },
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

// ---------- Routes ----------
app.use("/admin", adminRoutes);

// ---------- Webhook ----------
app.post("/webhook", async (req, res) => {
  try {
    const intent = req.body.queryResult?.intent?.displayName || "unknown";
    const params = req.body.queryResult?.parameters || {};
    const userQueryRaw = (req.body.queryResult?.queryText || "").trim();

    const studentIdParam = Array.isArray(params.studentId) ? params.studentId[0] : params.studentId || params.userID || null;
    const parentIdParam = Array.isArray(params.parentId) ? params.parentId[0] : params.parentId || null;
    const mentorIdParam = Array.isArray(params.mentorId) ? params.mentorId[0] : params.mentorId || null;

    const studentProfile = await withTimeout(async () => {
      if (!studentIdParam) return null;
      return await Student.findOne({ studentId: studentIdParam }).lean();
    }, 800, null);

    const start = Date.now();

    // ---------- Finance Intent ----------
    if (intent === "FinanceIntent") {
      const result = await withTimeout(async () => {
        if (!studentIdParam) return "Please provide your Student ID (e.g., STU001).";
        const student = await Student.findOne({ studentId: studentIdParam }).lean();
        if (!student) return "⚠️ I couldn’t find details for that student ID.";
        try { await Badge.create({ studentId: studentIdParam, badgeName: "Finance Explorer", reason: "Checked finance summary" }); } catch {}
        return `💰 *Finance Summary*\n- Student: ${student.name}\n- Pending Fees: ₹${student.feesPending}\n- Scholarships: ${student.scholarships.join(", ")}\n\n${getAffirmation(student.name)}`;
      }, WEBHOOK_TIMEOUT_MS, "⚠️ Could not fetch finance details right now.");
      const latency = Date.now() - start;
      await logChat({ query: userQueryRaw, response: result, intent, latencyMs: latency, matchSource: "database" });
      return res.json(sendResponse(result));
    }

    // ---------- Parent Status Intent ----------
    if (intent === "ParentStatusIntent") {
      const result = await withTimeout(async () => {
        if (!parentIdParam) return "Please provide your Parent ID (e.g., PARENT001).";
        const parent = await Parent.findOne({ parentId: parentIdParam }).lean();
        if (!parent) return "⚠️ I couldn’t find details for that parent ID.";
        try { await Badge.create({ studentId: parentIdParam, badgeName: "Engaged Parent", reason: "Viewed child dashboard" }); } catch {}
        const child = await Student.findOne({ studentId: parent.studentId }).lean();
        return `👨‍👩‍👦 *Parent Dashboard*\nChild: ${child?.name || parent.studentId}\nAttendance: ${child?.attendance}\nMarks: ${child?.marks}\nFees Pending: ₹${child?.feesPending}`;
      }, WEBHOOK_TIMEOUT_MS, "⚠️ Could not fetch parent dashboard right now.");
      const latency = Date.now() - start;
      await logChat({ query: userQueryRaw, response: result, intent, latencyMs: latency, matchSource: "database" });
      return res.json(sendResponse(result));
    }

    // ---------- Mentor Status Intent ----------
    if (intent === "MentorStatusIntent") {
      const result = await withTimeout(async () => {
        if (!mentorIdParam) return "Please provide your Mentor ID (e.g., MENTOR001).";
        const mentor = await Mentor.findOne({ mentorId: mentorIdParam }).lean();
        if (!mentor) return "⚠️ I couldn’t find details for that mentor ID.";
        try { await Badge.create({ studentId: mentorIdParam, badgeName: "Active Mentor", reason: "Reviewed mentees" }); } catch {}
        return `👨‍🏫 *Mentor Dashboard*\nMentees: ${mentor.mentees.join(", ")}\n\n${getAffirmation()}`;
      }, WEBHOOK_TIMEOUT_MS, "⚠️ Could not fetch mentor dashboard right now.");
      const latency = Date.now() - start;
      await logChat({ query: userQueryRaw, response: result, intent, latencyMs: latency, matchSource: "database" });
      return res.json(sendResponse(result));
    }

    // ---------- Counseling Intent ----------
    if (intent === "CounselingIntent") {
      const result = await withTimeout(async () => {
        try { await Badge.create({ studentId: studentProfile?.studentId || "GENERIC", badgeName: "Wellbeing Seeker", reason: "Asked for counseling" }); } catch {}
        return `🧠 *Counseling Support*\nA counselor will contact you soon.\nMeanwhile, try deep breathing.\n\n${getAffirmation(studentProfile?.name)}`;
      }, WEBHOOK_TIMEOUT_MS, "⚠️ Could not schedule counseling right now.");
      const latency = Date.now() - start;
      await logChat({ query: userQueryRaw, response: result, intent, latencyMs: latency });
      return res.json(sendResponse(result));
    }

    // ---------- Distress Intent ----------
    if (intent === "DistressIntent") {
      const resp = `🚨 *Distress Alert*\nYou are not alone. A counselor will be notified.\nUrgent? Call 📞 1800-599-0019\n\n${getAffirmation(studentProfile?.name)}`;
      await logChat({ query: userQueryRaw, response: resp, intent, latencyMs: Date.now() - start, matchSource: "rule" });
      return res.json(sendResponse(resp));
    }

    // ---------- Marketplace Intent ----------
    if (intent === "MarketplaceIntent") {
      const resp = `🛒 *Marketplace Listings*\n- 📚 Used Textbooks\n- 🧮 Calculators\n- 🛏 Hostel Essentials\n- 💻 Laptops\n\n${getAffirmation(studentProfile?.name)}`;
      await logChat({ query: userQueryRaw, response: resp, intent, latencyMs: Date.now() - start, matchSource: "hardcoded" });
      return res.json(sendResponse(resp));
    }

    // ---------- Mentorship Intent ----------
    if (intent === "MentorshipIntent") {
      const resp = `👨‍🏫 *Mentorship Available*\nMentors in CS, Mechanical, Commerce, AI/DS.\n\n${getAffirmation(studentProfile?.name)}`;
      await logChat({ query: userQueryRaw, response: resp, intent, latencyMs: Date.now() - start, matchSource: "hardcoded" });
      return res.json(sendResponse(resp));
    }

    // ---------- Reminder Intent ----------
    if (intent === "ReminderIntent") {
      const result = await withTimeout(async () => {
        const userId = studentIdParam || parentIdParam || mentorIdParam || "GENERIC";
        const reminders = await Reminder.find({ targetId: { $in: [userId, "GENERIC"] } }).sort({ createdAt: -1 }).limit(5).lean();
        return reminders.length
          ? `📌 Reminders:\n${reminders.map((r, i) => `${i + 1}. ${r.message}`).join("\n")}\n\n${getAffirmation(studentProfile?.name)}`
          : `📭 No reminders.\n\n${getAffirmation(studentProfile?.name)}`;
      }, WEBHOOK_TIMEOUT_MS, "⚠️ Could not fetch reminders right now.");
      const latency = Date.now() - start;
      await logChat({ query: userQueryRaw, response: result, intent, latencyMs: latency, matchSource: "database" });
      return res.json(sendResponse(result));
    }

    // ---------- Default Fallback Intent ----------
    if (intent === "Default Fallback Intent") {
      const sres = sentiment.analyze(userQueryRaw);
      if (sres.score <= -3) {
        const resp = `😔 You seem low. Want me to connect you to a counselor? Call 📞 1800-599-0019\n\n${getAffirmation(studentProfile?.name)}`;
        await logChat({ query: userQueryRaw, response: resp, intent, latencyMs: Date.now() - start, matchSource: "sentiment" });
        return res.json(sendResponse(resp));
      }
      if (sres.score >= 3) {
        const resp = `😊 Glad you’re doing well! Need study tips?\n\n${getAffirmation(studentProfile?.name)}`;
        await logChat({ query: userQueryRaw, response: resp, intent, latencyMs: Date.now() - start, matchSource: "sentiment" });
        return res.json(sendResponse(resp));
      }

      const best = await withTimeout(() => findBestFaq(userQueryRaw), WEBHOOK_TIMEOUT_MS, null);
      const latency = Date.now() - start;

      if (best) {
        const resp = `${best.answer}\n\n${best.source === "local" ? "⚠️ *Offline mode active*" : ""}\n${getAffirmation(studentProfile?.name)}`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchedQuestion: best.question, matchSource: best.source, similarity: best.score, latencyMs: latency, isOffline: best.source === "local" });
        return res.json(sendResponse(resp));
      }

      const resp = `🙏 Sorry, I couldn’t find an exact answer. I can help in Finance, Mentorship, Counseling, or Marketplace.\n\n${getAffirmation(studentProfile?.name)}`;
      await logChat({ query: userQueryRaw, response: resp, intent, latencyMs });
      return res.json(sendResponse(resp));
    }

    // ---------- Unhandled intents ----------
    const resp = `I can guide you in Finance, Mentorship, Counseling, or Marketplace. ${getAffirmation(studentProfile?.name)}`;
    await logChat({ query: userQueryRaw, response: resp, intent, latencyMs: Date.now() - start });
    return res.json(sendResponse(resp));
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    const resp = `⚠️ Something went wrong. ${getAffirmation()}`;
    await logChat({ query: req.body?.queryResult?.queryText || "", response: resp, intent: req.body?.queryResult?.intent?.displayName || "unknown", matchSource: "error", error: err.message });
    return res.json(sendResponse(resp));
  }
});

// ---------- CRON JOBS ----------
syncCache();
cron.schedule("0 */6 * * *", () => syncCache());
cron.schedule("0 9 * * *", () => runReminders());
cron.schedule("0 0 * * MON", () => runBadges());

// ---------- Start ----------
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
