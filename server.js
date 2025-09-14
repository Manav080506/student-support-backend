// server.js
import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import cron from "node-cron";
import Sentiment from "sentiment";
import stringSimilarity from "string-similarity";

import Faq from "./models/Faq.js";
import Badge from "./models/Badge.js";
import BadgeMeta from "./models/BadgeMeta.js";
import Reminder from "./models/Reminder.js";
import ChatLog from "./models/ChatLog.js";
import { getSheetData } from "./utils/sheets.js";

dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(cors());

// ---------- Config ----------
const ADMIN_KEY = process.env.ADMIN_KEY || "admin-secret";
const AUTO_SEED = process.env.AUTO_SEED === "true"; // set to true to auto-run seeders on start
const PORT = process.env.PORT || 5000;

// ---------- Basic health ----------
app.get("/", (req, res) => {
  res.send("✅ Student Support Backend is running with 💡 + 🌟 affirmations!");
});

// ---------- MongoDB ----------
mongoose
  .connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log("✅ MongoDB connected");
    if (AUTO_SEED) {
      // Run seeder once on startup (best-effort)
      (async () => {
        try {
          console.log("🔁 AUTO_SEED is enabled — seeding FAQs & badge meta...");
          await seedFaqs();
          await seedBadgeMeta();
          console.log("🔁 Auto-seed complete.");
        } catch (e) {
          console.warn("⚠️ Auto-seed failed:", e.message);
        }
      })();
    }
  })
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ---------- Dummy DB for personalization / demo ----------
const students = {
  STU001: { name: "Manav Runthala", feesPending: 5000, scholarships: ["Computer Science"] },
  STU002: { name: "Daksh Beniwal", feesPending: 3000, scholarships: ["Mechanical Engineering"] },
  STU003: { name: "Disha Binani", feesPending: 0, scholarships: ["Commerce"] },
};

const parents = {
  PARENT001: { child: "Manav Runthala", attendance: "85%", marks: "80%", feesPending: 5000 },
};

const mentors = {
  MENTOR001: { mentees: ["STU001", "STU002"] },
};

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

async function logChat({ query, response, intent, matchedQuestion = null, matchSource = "none", similarity = 0 }) {
  try {
    await ChatLog.create({
      query,
      response,
      intent,
      matchedQuestion,
      matchSource,
      similarity,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error("❌ ChatLog save error:", err.message);
  }
}

function fuzzyBestMatch(query, candidates) {
  if (!candidates || candidates.length === 0) return null;
  const scores = stringSimilarity.findBestMatch(query, candidates);
  if (!scores || !scores.bestMatch) return null;
  return { bestMatchText: scores.bestMatch.target, bestScore: scores.bestMatch.rating };
}

// ---------- Expanded synonyms ----------
const synonyms = {
  counseling: ["counsel", "counseling", "therapy", "therapist", "guidance", "help", "talk to someone", "talk", "counsellor"],
  distress: ["distress", "depressed", "depression", "anxious", "anxiety", "panic", "sad", "lonely", "overwhelmed", "suicidal", "suicide", "burnout", "stressed"],
};

// ---------- Webhook (Dialogflow) ----------
app.post("/webhook", async (req, res) => {
  const intent = req.body.queryResult?.intent?.displayName || "unknown";
  const params = req.body.queryResult?.parameters || {};
  const userQueryRaw = (req.body.queryResult?.queryText || "").trim();
  const userIDParam = params.studentId?.[0] || params.userID || (Array.isArray(params.userID) && params.userID[0]) || null;
  const studentProfile = userIDParam ? students[userIDParam] : null;

  try {
    // -------- FinanceIntent --------
    if (intent === "FinanceIntent") {
      const studentId = params.studentId?.[0] || userIDParam;
      if (!studentId) {
        const resp = "Please provide your Student ID (e.g., STU001).";
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "none" });
        return res.json(sendResponse(resp));
      }
      const student = students[studentId];
      if (!student) {
        const resp = "⚠️ I couldn’t find details for that student ID.";
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "none" });
        return res.json(sendResponse(resp));
      }
      // award badge (non-blocking)
      try {
        await Badge.create({ studentId, badgeName: "Finance Explorer", reason: "Checked finance summary" });
      } catch (e) {
        console.warn("⚠️ Badge create failed:", e.message);
      }
      const resp = `💰 *Finance Summary*\n- Student: ${student.name}\n- Pending Fees: ₹${student.feesPending}\n- Scholarships: ${student.scholarships.join(", ")}\n\n${getAffirmation(student.name)}\n\n👉 Options:\n1️⃣ Show Eligible Scholarships\n2️⃣ Show Fee Deadlines`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchedQuestion: "FinanceSummary", matchSource: "database", similarity: 1 });
      return res.json(sendResponse(resp));
    }

    // -------- ParentStatusIntent --------
    if (intent === "ParentStatusIntent") {
      const parentId = params.parentId?.[0];
      if (!parentId) {
        const resp = "Please provide your Parent ID (e.g., PARENT001).";
        await logChat({ query: userQueryRaw, response: resp, intent });
        return res.json(sendResponse(resp));
      }
      const parent = parents[parentId];
      if (!parent) {
        const resp = "⚠️ I couldn’t find details for that parent ID.";
        await logChat({ query: userQueryRaw, response: resp, intent });
        return res.json(sendResponse(resp));
      }
      try { await Badge.create({ studentId: parentId, badgeName: "Engaged Parent", reason: "Viewed child dashboard" }); } catch(e){ console.warn("badge failed", e.message); }
      const resp = `👨‍👩‍👦 *Parent Dashboard*\nParent ID: ${parentId}\nChild: ${parent.child}\n\n📊 Attendance: ${parent.attendance}\n📝 Marks: ${parent.marks}\n💰 Fees Pending: ₹${parent.feesPending}\n\n${getAffirmation(parent.child)}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchedQuestion: "ParentDashboard", matchSource: "database", similarity: 1 });
      return res.json(sendResponse(resp));
    }

    // -------- MentorStatusIntent --------
    if (intent === "MentorStatusIntent") {
      const mentorId = params.mentorId?.[0];
      if (!mentorId) {
        const resp = "Please provide your Mentor ID (e.g., MENTOR001).";
        await logChat({ query: userQueryRaw, response: resp, intent });
        return res.json(sendResponse(resp));
      }
      const mentor = mentors[mentorId];
      if (!mentor) {
        const resp = "⚠️ I couldn’t find details for that mentor ID.";
        await logChat({ query: userQueryRaw, response: resp, intent });
        return res.json(sendResponse(resp));
      }
      try { await Badge.create({ studentId: mentorId, badgeName: "Active Mentor", reason: "Reviewed mentees" }); } catch(e){ console.warn("badge failed", e.message); }
      const resp = `👨‍🏫 *Mentor Dashboard*\nMentor ID: ${mentorId}\n\n📋 Assigned Mentees:\n${mentor.mentees.join(", ")}\n\n${getAffirmation()}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchedQuestion: "MentorDashboard", matchSource: "database", similarity: 1 });
      return res.json(sendResponse(resp));
    }

    // -------- CounselingIntent --------
    if (intent === "CounselingIntent") {
      try { await Badge.create({ studentId: studentProfile ? userIDParam : "GENERIC", badgeName: "Wellbeing Seeker", reason: "Asked for counseling" }); } catch(e){ /* noop */ }
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
      try { await Badge.create({ studentId: studentProfile ? userIDParam : "GENERIC", badgeName: "Marketplace Explorer", reason: "Browsed marketplace" }); } catch(e){ /* noop */ }
      const resp = `🛒 *Marketplace Listings*\n- 📚 Used Textbooks\n- 🧮 Calculators\n- 🛏 Hostel Essentials\n- 💻 Laptops\n\n${getAffirmation(studentProfile?.name)}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchedQuestion: "Marketplace", matchSource: "database", similarity: 1 });
      return res.json(sendResponse(resp));
    }

    // -------- MentorshipIntent --------
    if (intent === "MentorshipIntent") {
      try { await Badge.create({ studentId: studentProfile ? userIDParam : "GENERIC", badgeName: "Mentorship Seeker", reason: "Requested mentor" }); } catch(e){ /* noop */ }
      const resp = `👨‍🏫 *Mentorship Available*\nWe have mentors in: Computer Science, Mechanical, Commerce, AI/DS.\n\n${getAffirmation(studentProfile?.name)}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchedQuestion: "Mentorship", matchSource: "database", similarity: 1 });
      return res.json(sendResponse(resp));
    }

    // -------- ReminderIntent --------
    if (intent === "ReminderIntent") {
      const userId = params.studentId?.[0] || params.parentId?.[0] || params.mentorId?.[0] || userIDParam || "GENERIC";
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

      // Sentiment detection first
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
        console.warn("⚠️ Sentiment analysis failed:", err.message);
      }

      // 1) direct/regex FAQ lookup
      try {
        const faq = await Faq.findOne({ question: new RegExp(userQueryRaw, "i") });
        if (faq) {
          const resp = `${faq.answer}\n\n${getAffirmation(studentProfile?.name)}`;
          await logChat({ query: userQueryRaw, response: resp, intent, matchedQuestion: faq.question, matchSource: "faq", similarity: 1 });
          return res.json(sendResponse(resp));
        }

        // fuzzy search in FAQ
        const allFaqs = await Faq.find({}, { question: 1, answer: 1 }).lean();
        if (allFaqs?.length) {
          const questions = allFaqs.map((f) => f.question);
          const match = fuzzyBestMatch(userQueryRaw, questions);
          if (match && match.bestScore >= 0.6) {
            const matchedFaq = allFaqs.find((f) => f.question === match.bestMatchText);
            const resp = `${matchedFaq?.answer || "Sorry, couldn't fetch the answer."}\n\n${getAffirmation(studentProfile?.name)}`;
            await logChat({ query: userQueryRaw, response: resp, intent, matchedQuestion: matchedFaq?.question, matchSource: "faq-fuzzy", similarity: match.bestScore });
            return res.json(sendResponse(resp));
          }
        }
      } catch (err) {
        console.warn("⚠️ FAQ lookup failed:", err.message);
      }

      // 2) Google Sheets fuzzy lookup
      try {
        const sheetData = await getSheetData(); // expected [{ Question, Answer }]
        if (sheetData?.length) {
          const qs = sheetData.filter((r) => r.Question).map((r) => r.Question);
          const match = fuzzyBestMatch(userQueryRaw, qs);
          if (match && match.bestScore >= 0.6) {
            const row = sheetData.find((r) => r.Question === match.bestMatchText);
            const resp = `${row?.Answer || row?.answer || "Sorry, couldn't fetch sheet answer."}\n\n${getAffirmation(studentProfile?.name)}`;
            await logChat({ query: userQueryRaw, response: resp, intent, matchedQuestion: row?.Question, matchSource: "sheet-fuzzy", similarity: match.bestScore });
            return res.json(sendResponse(resp));
          }
        }
      } catch (err) {
        console.warn("⚠️ Google Sheets lookup failed:", err.message);
      }

      // 3) hardcoded map (direct + fuzzy)
      const hardcodedFaqs = {
        "what is sih": "💡 SIH (Smart India Hackathon) is a nationwide initiative by MHRD to provide students a platform to solve pressing problems.",
        "who are you": "🤖 I am your Student Support Assistant, here to guide you in Finance, Mentorship, Counseling, and Marketplace.",
      };
      const lowerQ = userQueryRaw.toLowerCase();
      if (hardcodedFaqs[lowerQ]) {
        const resp = `${hardcodedFaqs[lowerQ]}\n\n${getAffirmation(studentProfile?.name)}`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchedQuestion: lowerQ, matchSource: "hardcoded", similarity: 1 });
        return res.json(sendResponse(resp));
      }
      const hcMatch = fuzzyBestMatch(lowerQ, Object.keys(hardcodedFaqs));
      if (hcMatch && hcMatch.bestScore >= 0.6) {
        const resp = `${hardcodedFaqs[hcMatch.bestMatchText]}\n\n${getAffirmation(studentProfile?.name)}`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchedQuestion: hcMatch.bestMatchText, matchSource: "hardcoded-fuzzy", similarity: hcMatch.bestScore });
        return res.json(sendResponse(resp));
      }

      // 4) synonyms for Counseling/Distress
      const lower = lowerQ;
      if (synonyms.counseling.some((w) => lower.includes(w))) {
        const resp = `🧠 It looks like you'd like counseling. I can connect you to a counselor. ${getAffirmation(studentProfile?.name)}`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "synonym", matchedQuestion: "counseling_synonym", similarity: 1 });
        return res.json(sendResponse(resp));
      }
      if (synonyms.distress.some((w) => lower.includes(w))) {
        const resp = `🚨 I sense distress. If you are in immediate danger call local emergency services. Helpline: 📞 1800-599-0019. ${getAffirmation(studentProfile?.name)}`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "synonym", matchedQuestion: "distress_synonym", similarity: 1 });
        return res.json(sendResponse(resp));
      }

      // final fallback
      const finalResp = `🙏 Sorry, I couldn’t find an exact answer. But I can guide you in Finance, Mentorship, Counseling, or Marketplace.\n\n${getAffirmation(studentProfile?.name)}`;
      await logChat({ query: userQueryRaw, response: finalResp, intent, matchSource: "none", similarity: 0 });
      return res.json(sendResponse(finalResp));
    }

    // Unhandled intent
    const unknownResp = `I can guide you in Finance, Mentorship, Counseling, or Marketplace. ${getAffirmation(studentProfile?.name)}`;
    await logChat({ query: userQueryRaw, response: unknownResp, intent, matchSource: "none", similarity: 0 });
    return res.json(sendResponse(unknownResp));
  } catch (err) {
    console.error("❌ Webhook error:", err);
    const resp = `⚠️ Something went wrong while processing your request. ${getAffirmation()}`;
    await logChat({ query: userQueryRaw, response: resp, intent: req.body.queryResult?.intent?.displayName || "unknown", matchSource: "error", similarity: 0 });
    return res.json(sendResponse(resp));
  }
});

// ---------- Seeder helpers (exposed + used on startup) ----------
async function seedFaqs() {
  const faqs = [
    { category: "General", question: "What is SIH", answer: "💡 SIH (Smart India Hackathon) is a nationwide initiative by MHRD to provide students a platform to solve pressing problems." },
    { category: "General", question: "Who are you", answer: "🤖 I am your Student Support Assistant, here to guide you with Finance, Mentorship, Counseling, and Marketplace queries." },
    { category: "Finance", question: "What scholarships are available", answer: "🎓 Scholarships are available for Computer Science, Mechanical, and Commerce students." },
    { category: "Counseling", question: "I feel anxious about exams", answer: "🧠 Exam anxiety is common. Try 4-4-4 breathing, short breaks, and reach out if it's overwhelming." },
    { category: "Distress", question: "I feel depressed", answer: "🚨 You are not alone. If you are in immediate danger, call local emergency services. Helpline: 📞 1800-599-0019." },
  ];
  await Faq.deleteMany({});
  await Faq.insertMany(faqs);
  return { message: "✅ FAQs seeded successfully!", faqs };
}

async function seedBadgeMeta() {
  const metas = [
    { badgeName: "Finance Explorer", description: "Checked your finance summary", icon: "💰" },
    { badgeName: "Engaged Parent", description: "Viewed child’s dashboard", icon: "👨‍👩‍👦" },
    { badgeName: "Active Mentor", description: "Reviewed mentees", icon: "👨‍🏫" },
    { badgeName: "Marketplace Explorer", description: "Browsed the marketplace", icon: "🛒" },
    { badgeName: "Mentorship Seeker", description: "Requested a mentor", icon: "🎓" },
    { badgeName: "Wellbeing Seeker", description: "Asked for counseling", icon: "🧠" },
    { badgeName: "Consistency Badge", description: "Stayed active regularly", icon: "🎖️" },
  ];
  await BadgeMeta.deleteMany({});
  await BadgeMeta.insertMany(metas);
  return { message: "✅ Badge metadata seeded successfully!", metas };
}

// ---------- Admin protection middleware ----------
function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-key"] || req.query.adminKey;
  if (!key || key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized - admin key required" });
  next();
}

// ---------- Admin endpoints ----------
app.post("/admin/seed-faqs", requireAdmin, async (req, res) => {
  try {
    const result = await seedFaqs();
    res.json(result);
  } catch (err) {
    console.error("❌ /admin/seed-faqs error:", err);
    res.status(500).json({ error: "Seeder failed" });
  }
});

app.post("/admin/seed-badge-meta", requireAdmin, async (req, res) => {
  try {
    const result = await seedBadgeMeta();
    res.json(result);
  } catch (err) {
    console.error("❌ /admin/seed-badge-meta error:", err);
    res.status(500).json({ error: "Seeder failed" });
  }
});

// CRUD for FAQs
app.get("/admin/faqs", requireAdmin, async (req, res) => {
  const faqs = await Faq.find({}).lean();
  res.json({ faqs });
});
app.post("/admin/faqs", requireAdmin, async (req, res) => {
  const { question, answer, category } = req.body;
  if (!question || !answer) return res.status(400).json({ error: "question & answer required" });
  const f = await Faq.create({ question, answer, category });
  res.json({ message: "created", faq: f });
});
app.delete("/admin/faqs/:id", requireAdmin, async (req, res) => {
  await Faq.findByIdAndDelete(req.params.id);
  res.json({ message: "deleted" });
});

// CRUD for BadgeMeta
app.get("/admin/badge-meta", requireAdmin, async (req, res) => {
  const metas = await BadgeMeta.find({}).lean();
  res.json({ metas });
});
app.post("/admin/badge-meta", requireAdmin, async (req, res) => {
  const { badgeName, description, icon } = req.body;
  if (!badgeName) return res.status(400).json({ error: "badgeName required" });
  const b = await BadgeMeta.create({ badgeName, description, icon });
  res.json({ message: "created", badgeMeta: b });
});
app.delete("/admin/badge-meta/:id", requireAdmin, async (req, res) => {
  await BadgeMeta.findByIdAndDelete(req.params.id);
  res.json({ message: "deleted" });
});

// View / delete reminders
app.get("/admin/reminders", requireAdmin, async (req, res) => {
  const reminders = await Reminder.find({}).sort({ createdAt: -1 }).limit(200).lean();
  res.json({ reminders });
});
app.delete("/admin/reminders/:id", requireAdmin, async (req, res) => {
  await Reminder.findByIdAndDelete(req.params.id);
  res.json({ message: "deleted" });
});

// Award badge (admin)
app.post("/admin/award-badge", requireAdmin, async (req, res) => {
  const { studentId, badgeName, reason } = req.body;
  if (!studentId || !badgeName) return res.status(400).json({ error: "studentId & badgeName required" });
  const badge = await Badge.create({ studentId, badgeName, reason });
  res.json({ message: "✅ Badge awarded", badge });
});

// Push reminder / affirmation manually
app.post("/admin/push-reminder", requireAdmin, async (req, res) => {
  const { targetId = "GENERIC", message } = req.body;
  if (!message) return res.status(400).json({ error: "message required" });
  const r = await Reminder.create({ type: "manual", message, targetId, createdAt: new Date() });
  res.json({ message: "pushed", reminder: r });
});
app.post("/admin/push-affirmation", requireAdmin, async (req, res) => {
  const { studentId } = req.body;
  const name = studentId ? (students[studentId]?.name || null) : null;
  const aff = getAffirmation(name);
  res.json({ affirmation: aff });
});

// Chatlogs view & delete
app.get("/admin/chatlogs", requireAdmin, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "50", 10), 500);
  const logs = await ChatLog.find({}).sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ logs });
});
app.delete("/admin/chatlogs/:id", requireAdmin, async (req, res) => {
  await ChatLog.findByIdAndDelete(req.params.id);
  res.json({ message: "deleted" });
});

// Simple dashboard: totals
app.get("/admin/dashboard", requireAdmin, async (req, res) => {
  try {
    const [faqCount, badgeCount, reminderCount, chatlogCount, badgeMetaCount] = await Promise.all([
      Faq.countDocuments(),
      Badge.countDocuments(),
      Reminder.countDocuments(),
      ChatLog.countDocuments(),
      BadgeMeta.countDocuments(),
    ]);
    res.json({ faqCount, badgeCount, reminderCount, chatlogCount, badgeMetaCount });
  } catch (err) {
    res.status(500).json({ error: "Failed to compute dashboard" });
  }
});

// ---------- Public endpoints: badges & reminders ----------
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
    console.error("❌ Get badges error:", err.message);
    res.status(500).json({ error: "Failed to fetch badges" });
  }
});

app.get("/reminders/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const reminders = await Reminder.find({ targetId: { $in: [id, "GENERIC"] } }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ reminders });
  } catch (err) {
    console.error("❌ Get reminders error:", err.message);
    res.status(500).json({ error: "Failed to fetch reminders" });
  }
});

// ---------- Cron jobs (same as before) ----------
// Daily finance reminders at 9 AM
cron.schedule("0 9 * * *", async () => {
  try {
    console.log("🔔 Cron: Checking finance reminders...");
    for (const [id, student] of Object.entries(students)) {
      if (student.feesPending > 0) {
        const message = `⚠️ Reminder: ${student.name} has pending fees of ₹${student.feesPending}`;
        await Reminder.create({ type: "finance", message, targetId: id, createdAt: new Date() });
        console.log(message);
      }
    }
  } catch (err) {
    console.error("❌ Cron (finance) error:", err.message);
  }
});

// Weekly mentorship nudges every Monday at 10 AM
cron.schedule("0 10 * * 1", async () => {
  try {
    console.log("📅 Cron: Weekly mentorship nudges...");
    for (const [id, mentor] of Object.entries(mentors)) {
      const message = `👨‍🏫 Mentor ${id} has ${mentor.mentees.length} mentees. Check progress!`;
      await Reminder.create({ type: "mentorship", message, targetId: id, createdAt: new Date() });
      console.log(message);
    }
  } catch (err) {
    console.error("❌ Cron (mentorship) error:", err.message);
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
    console.error("❌ Cron (badge) error:", err.message);
  }
});

// Parent weekly report every Sunday at 8 PM
cron.schedule("0 20 * * 0", async () => {
  try {
    console.log("👨‍👩‍👦 Cron: Sending parent weekly report...");
    for (const [id, parent] of Object.entries(parents)) {
      const message = `📊 Weekly Report - Child: ${parent.child}, Attendance: ${parent.attendance}, Marks: ${parent.marks}`;
      await Reminder.create({ type: "parent", message, targetId: id, createdAt: new Date() });
      console.log(message);
    }
  } catch (err) {
    console.error("❌ Cron (parent report) error:", err.message);
  }
});

// Health check every 30 minutes
cron.schedule("*/30 * * * *", async () => {
  try {
    const message = "✅ Server is alive & running...";
    await Reminder.create({ type: "health", message, targetId: "SYSTEM", createdAt: new Date() });
    console.log(message);
  } catch (err) {
    console.error("❌ Cron (health) error:", err.message);
  }
});

// ---------- Start ----------
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
