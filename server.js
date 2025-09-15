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
    // optionally refresh FAQ cache on start (non-blocking)
    try { await refreshFaqCache(); } catch (e) { /* noop */ }

    if (AUTO_SEED) {
      try {
        console.log("🔁 AUTO_SEED enabled — seeding demo data...");
        await runAutoSeed();
        console.log("🔁 Auto-seed complete.");
      } catch (e) {
        console.warn("⚠️ Auto-seed failed:", e.message || e);
      }
    }
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
    await ChatLog.create({
      query,
      response,
      intent,
      matchedQuestion,
      matchSource,
      similarity,
      affirmation,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error("❌ ChatLog save error:", err.message || err);
  }
}

// ---------- Seeder (demo) ----------
async function runAutoSeed() {
  // Students
  const existingStudent = await Student.findOne({});
  if (!existingStudent) {
    await Student.insertMany([
      { studentId: "STU001", name: "Manav Runthala", feesPending: 5000, scholarships: ["Computer Science"], marks: 82, attendance: 88 },
      { studentId: "STU002", name: "Daksh Beniwal", feesPending: 3000, scholarships: ["Mechanical Engineering"], marks: 74, attendance: 79 },
      { studentId: "STU003", name: "Disha Binani", feesPending: 0, scholarships: ["Commerce"], marks: 91, attendance: 95 },
    ]);
    console.log(" seeded students");
  }

  // Parents
  const existingParent = await Parent.findOne({});
  if (!existingParent) {
    await Parent.create({ parentId: "PARENT001", name: "Mr. Runthala", relation: "Father", studentId: "STU001" });
    console.log(" seeded parents");
  }

  // Mentors
  const existingMentor = await Mentor.findOne({});
  if (!existingMentor) {
    await Mentor.create({ mentorId: "MENTOR001", name: "Prof. Sharma", field: "Computer Science", mentees: ["STU001", "STU002"] });
    console.log(" seeded mentors");
  }

  // FAQ + BadgeMeta if empty
  const faqCount = await Faq.countDocuments();
  if (!faqCount) {
    await Faq.insertMany([
      { category: "Finance", question: "What scholarships are available", answer: "🎓 Scholarships: merit and need-based. Check dashboard for eligibility." },
      { category: "Finance", question: "When is my fee due", answer: "Fee deadlines are posted on the finance dashboard. Contact finance for specifics." },
      { category: "Counseling", question: "I feel anxious", answer: "🧠 Try 4-4-4 breathing and reach out to a counselor if it persists." },
      { category: "Distress", question: "I feel depressed", answer: "🚨 If immediate danger, call local emergency services. Helpline: 1800-599-0019." },
      { category: "General", question: "Who are you", answer: "🤖 I am the Student Support Assistant — here to help with finance, mentorship, counseling and marketplace." },
    ]);
    console.log(" seeded faqs");
  }

  const metaCount = await BadgeMeta.countDocuments();
  if (!metaCount) {
    await BadgeMeta.insertMany([
      { badgeName: "Finance Explorer", description: "Checked finance summary", icon: "💰" },
      { badgeName: "Engaged Parent", description: "Viewed child dashboard", icon: "👨‍👩‍👦" },
      { badgeName: "Active Mentor", description: "Reviewed mentees", icon: "👨‍🏫" },
      { badgeName: "Marketplace Explorer", description: "Browsed marketplace", icon: "🛒" },
      { badgeName: "Wellbeing Seeker", description: "Asked for counseling", icon: "🧠" },
      { badgeName: "Consistency Badge", description: "Daily engagement", icon: "🎖️" },
    ]);
    console.log(" seeded badge meta");
  }
}

// ---------- Admin protection middleware ----------
function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-key"] || req.query.adminKey;
  if (!key || key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized - admin key required" });
  next();
}

// ---------- Webhook (Dialogflow) ----------
app.post("/webhook", async (req, res) => {
  const intent = req.body.queryResult?.intent?.displayName || "unknown";
  const params = req.body.queryResult?.parameters || {};
  const userQueryRaw = (req.body.queryResult?.queryText || "").trim();

  // prefer explicit param names (Dialogflow entity slots)
  const studentIdParam = Array.isArray(params.studentId) ? params.studentId[0] : params.studentId || params.userID || (Array.isArray(params.userID) ? params.userID[0] : null);
  const parentIdParam = Array.isArray(params.parentId) ? params.parentId[0] : params.parentId;
  const mentorIdParam = Array.isArray(params.mentorId) ? params.mentorId[0] : params.mentorId;

  // get student profile if provided
  const studentProfile = studentIdParam ? await Student.findOne({ studentId: studentIdParam }).lean() : null;

  try {
    // -------- FinanceIntent --------
    if (intent === "FinanceIntent") {
      const studentId = studentIdParam;
      if (!studentId) {
        const resp = "Please provide your Student ID (e.g., STU001).";
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "none" });
        return res.json(sendResponse(resp));
      }
      const student = await Student.findOne({ studentId });
      if (!student) {
        const resp = "⚠️ I couldn’t find details for that student ID.";
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "none" });
        return res.json(sendResponse(resp));
      }
      // award badge (non-blocking)
      try {
        await Badge.create({ studentId, badgeName: "Finance Explorer", reason: "Checked finance summary" });
      } catch (e) {
        console.warn("⚠️ Badge create failed:", e.message || e);
      }
      const resp = `💰 *Finance Summary*\n- Student: ${student.name}\n- Pending Fees: ₹${student.feesPending}\n- Scholarships: ${Array.isArray(student.scholarships) ? student.scholarships.join(", ") : ""}\n\n${getAffirmation(student.name)}\n\n👉 Options:\n1️⃣ Show Eligible Scholarships\n2️⃣ Show Fee Deadlines`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchedQuestion: "FinanceSummary", matchSource: "database", similarity: 1, affirmation: getAffirmation(student.name) });
      return res.json(sendResponse(resp));
    }

    // -------- ParentStatusIntent --------
    if (intent === "ParentStatusIntent") {
      const parentId = parentIdParam;
      if (!parentId) {
        const resp = "Please provide your Parent ID (e.g., PARENT001).";
        await logChat({ query: userQueryRaw, response: resp, intent });
        return res.json(sendResponse(resp));
      }
      const parent = await Parent.findOne({ parentId });
      if (!parent) {
        const resp = "⚠️ I couldn’t find details for that parent ID.";
        await logChat({ query: userQueryRaw, response: resp, intent });
        return res.json(sendResponse(resp));
      }
      try { await Badge.create({ studentId: parentId, badgeName: "Engaged Parent", reason: "Viewed child dashboard" }); } catch (e) { /* noop */ }
      // pull student details for affirmation
      const child = await Student.findOne({ studentId: parent.studentId });
      const resp = `👨‍👩‍👦 *Parent Dashboard*\nParent ID: ${parentId}\nChild: ${child ? child.name : parent.studentId}\n\n📊 Attendance: ${parent.attendance}\n📝 Marks: ${parent.marks}\n💰 Fees Pending: ₹${parent.feesPending}\n\n${getAffirmation(child ? child.name : null)}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchedQuestion: "ParentDashboard", matchSource: "database", similarity: 1 });
      return res.json(sendResponse(resp));
    }

    // -------- MentorStatusIntent --------
    if (intent === "MentorStatusIntent") {
      const mentorId = mentorIdParam;
      if (!mentorId) {
        const resp = "Please provide your Mentor ID (e.g., MENTOR001).";
        await logChat({ query: userQueryRaw, response: resp, intent });
        return res.json(sendResponse(resp));
      }
      const mentor = await Mentor.findOne({ mentorId });
      if (!mentor) {
        const resp = "⚠️ I couldn’t find details for that mentor ID.";
        await logChat({ query: userQueryRaw, response: resp, intent });
        return res.json(sendResponse(resp));
      }
      try { await Badge.create({ studentId: mentorId, badgeName: "Active Mentor", reason: "Reviewed mentees" }); } catch (e) { console.warn("badge failed", e.message || e); }
      const resp = `👨‍🏫 *Mentor Dashboard*\nMentor ID: ${mentorId}\n\n📋 Assigned Mentees:\n${Array.isArray(mentor.mentees) ? mentor.mentees.join(", ") : ""}\n\n${getAffirmation()}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchedQuestion: "MentorDashboard", matchSource: "database", similarity: 1 });
      return res.json(sendResponse(resp));
    }

    // -------- CounselingIntent --------
    if (intent === "CounselingIntent") {
      try { await Badge.create({ studentId: studentProfile ? studentProfile.studentId : "GENERIC", badgeName: "Wellbeing Seeker", reason: "Asked for counseling" }); } catch (e) { /* noop */ }
      const resp = `🧠 *Counseling Support*\nI understand you’re seeking guidance.\n✔ A counselor will be notified to contact you.\n✔ Meanwhile, try breathing exercises and short breaks.\n\n${getAffirmation(studentProfile?.name)}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchedQuestion: "Counseling", matchSource: "database", similarity: 1 });
      return res.json(sendResponse(resp));
    }

    // -------- DistressIntent --------
    if (intent === "DistressIntent") {
      const resp = `🚨 *Distress Alert*\nI sense you’re in distress. You are not alone.\n✔ A counselor has been notified to contact you immediately.\n✔ If it’s urgent, please call the helpline: 📞 1800-599-0019\n\n${getAffirmation(studentProfile?.name)}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchedQuestion: "Distress", matchSource: "database", similarity: 1 });
      return res.json(sendResponse(resp));
    }

    // -------- MarketplaceIntent --------
    if (intent === "MarketplaceIntent") {
      try { await Badge.create({ studentId: studentProfile ? studentProfile.studentId : "GENERIC", badgeName: "Marketplace Explorer", reason: "Browsed marketplace" }); } catch (e) { /* noop */ }
      const resp = `🛒 *Marketplace Listings*\n- 📚 Used Textbooks\n- 🧮 Calculators\n- 🛏 Hostel Essentials\n- 💻 Laptops\n\n${getAffirmation(studentProfile?.name)}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchedQuestion: "Marketplace", matchSource: "database", similarity: 1 });
      return res.json(sendResponse(resp));
    }

    // -------- MentorshipIntent --------
    if (intent === "MentorshipIntent") {
      try { await Badge.create({ studentId: studentProfile ? studentProfile.studentId : "GENERIC", badgeName: "Mentorship Seeker", reason: "Requested mentor" }); } catch (e) { /* noop */ }
      const resp = `👨‍🏫 *Mentorship Available*\nWe have mentors in: Computer Science, Mechanical, Commerce, AI/DS.\n\n${getAffirmation(studentProfile?.name)}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchedQuestion: "Mentorship", matchSource: "database", similarity: 1 });
      return res.json(sendResponse(resp));
    }

    // -------- ReminderIntent --------
    if (intent === "ReminderIntent") {
      const userId = studentIdParam || parentIdParam || mentorIdParam || "GENERIC";
      const reminders = await Reminder.find({ targetId: { $in: [userId, "GENERIC"] } }).sort({ createdAt: -1 }).limit(5).lean();
      const resp = reminders.length
        ? `📌 *Your Latest Reminders:*\n${reminders.map((r, i) => `${i + 1}. ${r.message}`).join("\n")}\n\n${getAffirmation(studentProfile?.name)}`
        : `📭 You have no reminders at the moment.\n\n${getAffirmation(studentProfile?.name)}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchSource: reminders.length ? "database" : "none", matchedQuestion: "Reminders", similarity: reminders.length ? 1 : 0 });
      return res.json(sendResponse(resp));
    }

    // -------- Default Fallback (multi-layer) --------
    if (intent === "Default Fallback Intent") {
      if (!userQueryRaw) {
        const resp = `I didn't get that. Can you say it again? ${getAffirmation(studentProfile?.name)}`;
        await logChat({ query: "", response: resp, intent, matchSource: "none" });
        return res.json(sendResponse(resp));
      }

      // Sentiment detection for distress
      try {
        const sentimentResult = sentiment.analyze(userQueryRaw);
        if (sentimentResult.score <= -3) {
          const resp = `😔 I sense you’re feeling low. Would you like me to connect you to a counselor? If it's urgent, call 📞 1800-599-0019.\n\n${getAffirmation(studentProfile?.name)}`;
          await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "sentiment", matchedQuestion: "sentiment_alert", similarity: Math.min(Math.abs(sentimentResult.score) / 5, 1) });
          return res.json(sendResponse(resp));
        }
        if (sentimentResult.score >= 3) {
          const resp = `😊 I'm glad you're feeling good! Want study tips or a quick productivity suggestion? ${getAffirmation(studentProfile?.name)}`;
          await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "sentiment", matchedQuestion: "sentiment_positive", similarity: Math.min(sentimentResult.score / 5, 1) });
          return res.json(sendResponse(resp));
        }
      } catch (err) {
        console.warn("⚠️ Sentiment analysis failed:", err.message || err);
      }

      // 1) Smart FAQ (getFaqData)
      try {
        const best = await findBestFaq(userQueryRaw);
        if (best) {
          const resp = `${best.answer}\n\n${getAffirmation(studentProfile?.name)}`;
          await logChat({ query: userQueryRaw, response: resp, intent, matchedQuestion: best.question, matchSource: best.source, similarity: best.score });
          return res.json(sendResponse(resp));
        }
      } catch (err) {
        console.warn("⚠️ findBestFaq failed:", err.message || err);
      }

      // 2) synonyms quick checks
      const lowerQ = userQueryRaw.toLowerCase();
      if (["fees", "fee", "scholarship", "scholarships", "finance", "financial aid", "dues", "pending payment"].some((w) => lowerQ.includes(w))) {
        const resp = `💰 It looks like you want finance help. Please provide your Student ID (e.g., STU001).`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "synonym", matchedQuestion: "finance_synonym", similarity: 1 });
        return res.json(sendResponse(resp));
      }
      if (["mentor", "mentorship", "senior", "guide", "career"].some((w) => lowerQ.includes(w))) {
        const resp = `👨‍🏫 It looks like you want a mentor. We have mentors in CS, Mechanical, Commerce, AI/DS.`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "synonym", matchedQuestion: "mentorship_synonym", similarity: 1 });
        return res.json(sendResponse(resp));
      }
      if (["sell", "buy", "marketplace", "books", "notes", "calculator", "essentials", "for sale"].some((w) => lowerQ.includes(w))) {
        const resp = `🛒 It looks like you're looking for marketplace items. You can buy/sell books, calculators, and hostel essentials here.`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "synonym", matchedQuestion: "marketplace_synonym", similarity: 1 });
        return res.json(sendResponse(resp));
      }

      // final fallback
      const finalResp = `🙏 Sorry, I couldn’t find an exact answer. But I can guide you in Finance, Mentorship, Counseling, or Marketplace.\n\n${getAffirmation(studentProfile?.name)}`;
      await logChat({ query: userQueryRaw, response: finalResp, intent, matchSource: "none", similarity: 0 });
      return res.json(sendResponse(finalResp));
    }

    // Unhandled fallback
    const unknownResp = `I can guide you in Finance, Mentorship, Counseling, or Marketplace. ${getAffirmation(studentProfile?.name)}`;
    await logChat({ query: userQueryRaw, response: unknownResp, intent, matchSource: "none", similarity: 0 });
    return res.json(sendResponse(unknownResp));
  } catch (err) {
    console.error("❌ Webhook error:", err.message || err);
    const resp = `⚠️ Something went wrong while processing your request. ${getAffirmation()}`;
    await logChat({ query: userQueryRaw, response: resp, intent: req.body.queryResult?.intent?.displayName || "unknown", matchSource: "error", similarity: 0 });
    return res.json(sendResponse(resp));
  }
});

// ---------- Admin endpoints ----------
app.post("/admin/seed-all", requireAdmin, async (req, res) => {
  try {
    await runAutoSeed();
    res.json({ message: "Seeded demo data" });
  } catch (err) {
    console.error("❌ /admin/seed-all error:", err.message || err);
    res.status(500).json({ error: "Seeder failed" });
  }
});

app.get("/admin/faqs", requireAdmin, async (req, res) => { res.json({ faqs: await Faq.find({}).lean() }); });
app.post("/admin/faqs", requireAdmin, async (req, res) => { const { question, answer, category } = req.body; if (!question || !answer) return res.status(400).json({ error: "question & answer required" }); const f = await Faq.create({ question, answer, category }); res.json({ message: "created", faq: f }); });
app.delete("/admin/faqs/:id", requireAdmin, async (req, res) => { await Faq.findByIdAndDelete(req.params.id); res.json({ message: "deleted" }); });

app.get("/admin/badge-meta", requireAdmin, async (req, res) => { res.json({ metas: await BadgeMeta.find({}).lean() }); });
app.post("/admin/badge-meta", requireAdmin, async (req, res) => { const { badgeName, description, icon } = req.body; if (!badgeName) return res.status(400).json({ error: "badgeName required" }); const b = await BadgeMeta.create({ badgeName, description, icon }); res.json({ message: "created", badgeMeta: b }); });
app.delete("/admin/badge-meta/:id", requireAdmin, async (req, res) => { await BadgeMeta.findByIdAndDelete(req.params.id); res.json({ message: "deleted" }); });

app.get("/admin/reminders", requireAdmin, async (req, res) => { const reminders = await Reminder.find({}).sort({ createdAt: -1 }).limit(200).lean(); res.json({ reminders }); });
app.delete("/admin/reminders/:id", requireAdmin, async (req, res) => { await Reminder.findByIdAndDelete(req.params.id); res.json({ message: "deleted" }); });

app.post("/admin/award-badge", requireAdmin, async (req, res) => { const { studentId, badgeName, reason } = req.body; if (!studentId || !badgeName) return res.status(400).json({ error: "studentId & badgeName required" }); const badge = await Badge.create({ studentId, badgeName, reason }); res.json({ message: "✅ Badge awarded", badge }); });

app.post("/admin/push-reminder", requireAdmin, async (req, res) => {
  const { targetId = "GENERIC", message } = req.body;
  if (!message) return res.status(400).json({ error: "message required" });
  const r = await Reminder.create({ type: "manual", message, targetId, createdAt: new Date() });
  res.json({ message: "pushed", reminder: r });
});
app.post("/admin/push-affirmation", requireAdmin, async (req, res) => {
  const { studentId } = req.body;
  const s = studentId ? await Student.findOne({ studentId }) : null;
  res.json({ affirmation: getAffirmation(s?.name) });
});

app.get("/admin/chatlogs", requireAdmin, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "50", 10), 500);
  const logs = await ChatLog.find({}).sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ logs });
});
app.delete("/admin/chatlogs/:id", requireAdmin, async (req, res) => { await ChatLog.findByIdAndDelete(req.params.id); res.json({ message: "deleted" }); });

app.get("/admin/dashboard", requireAdmin, async (req, res) => {
  try {
    const [faqCount, badgeCount, reminderCount, chatlogCount, badgeMetaCount, studentCount] = await Promise.all([
      Faq.countDocuments(), Badge.countDocuments(), Reminder.countDocuments(), ChatLog.countDocuments(), BadgeMeta.countDocuments(), Student.countDocuments()
    ]);
    res.json({ faqCount, badgeCount, reminderCount, chatlogCount, badgeMetaCount, studentCount });
  } catch (err) {
    res.status(500).json({ error: "Failed to compute dashboard" });
  }
});

// ---------- Public endpoints ----------
app.get("/badges/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const badges = await Badge.find({ studentId: id }).sort({ awardedAt: -1 }).lean();
    const metas = await BadgeMeta.find({}).lean();
    const metaMap = {};
    metas.forEach((m) => (metaMap[m.badgeName] = m));
    const enriched = badges.map((b) => ({
      ...b,
      description: metaMap[b.badgeName]?.description || "",
      icon: metaMap[b.badgeName]?.icon || "🏅",
    }));
    res.json({ badges: enriched });
  } catch (err) {
    console.error("❌ Get badges error:", err.message || err);
    res.status(500).json({ error: "Failed to fetch badges" });
  }
});

app.get("/reminders/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const reminders = await Reminder.find({ targetId: { $in: [id, "GENERIC"] } }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ reminders });
  } catch (err) {
    console.error("❌ Get reminders error:", err.message || err);
    res.status(500).json({ error: "Failed to fetch reminders" });
  }
});

// ---------- Cron jobs ----------
// Daily finance reminders at 9 AM
cron.schedule("0 9 * * *", async () => {
  try {
    console.log("🔔 Cron: Checking finance reminders...");
    const studs = await Student.find({ feesPending: { $gt: 0 } }).lean();
    for (const s of studs) {
      const message = `⚠️ Reminder: ${s.name} has pending fees of ₹${s.feesPending}`;
      await Reminder.create({ type: "finance", message, targetId: s.studentId, createdAt: new Date() });
      console.log(message);
    }
  } catch (err) {
    console.error("❌ Cron (finance) error:", err.message || err);
  }
});

// Weekly mentorship nudges every Monday at 10 AM
cron.schedule("0 10 * * 1", async () => {
  try {
    console.log("📅 Cron: Weekly mentorship nudges...");
    const mentors = await Mentor.find({}).lean();
    for (const m of mentors) {
      const message = `👨‍🏫 Mentor ${m.mentorId} has ${Array.isArray(m.mentees) ? m.mentees.length : 0} mentees. Check progress!`;
      await Reminder.create({ type: "mentorship", message, targetId: m.mentorId, createdAt: new Date() });
      console.log(message);
    }
  } catch (err) {
    console.error("❌ Cron (mentorship) error:", err.message || err);
  }
});

// Daily consistency badge check at midnight
cron.schedule("0 0 * * *", async () => {
  try {
    console.log("🎖️ Cron: Awarding consistency badges...");
    const message = "🎖️ Consistency Badge awarded for daily engagement!";
    await Reminder.create({ type: "badge", message, targetId: "GENERIC", createdAt: new Date() });
    await Badge.create({ studentId: "GENERIC", badgeName: "Consistency Badge", reason: "Daily engagement" });
    console.log(message);
  } catch (err) {
    console.error("❌ Cron (badge) error:", err.message || err);
  }
});

// Parent weekly report every Sunday at 8 PM
cron.schedule("0 20 * * 0", async () => {
  try {
    console.log("👨‍👩‍👦 Cron: Sending parent weekly report...");
    const parents = await Parent.find({}).lean();
    for (const p of parents) {
      const child = await Student.findOne({ studentId: p.studentId });
      const message = `📊 Weekly Report - Child: ${child ? child.name : p.studentId}, Attendance: ${child?.attendance ?? "N/A"}, Marks: ${child?.marks ?? "N/A"}`;
      await Reminder.create({ type: "parent", message, targetId: p.parentId, createdAt: new Date() });
      console.log(message);
    }
  } catch (err) {
    console.error("❌ Cron (parent report) error:", err.message || err);
  }
});

// Health check every 30 minutes
cron.schedule("*/30 * * * *", async () => {
  try {
    const message = "✅ Server is alive & running...";
    await Reminder.create({ type: "health", message, targetId: "SYSTEM", createdAt: new Date() });
    console.log(message);
  } catch (err) {
    console.error("❌ Cron (health) error:", err.message || err);
  }
});

// ---------- Start ----------
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
