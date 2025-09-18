// server.js
import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import Sentiment from "sentiment";
import fetch from "node-fetch";

// Models
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
const PORT = process.env.PORT || 5000;
const AUTO_SEED = process.env.AUTO_SEED === "true";
const FAQ_MIN_SCORE = Number(process.env.FAQ_MIN_SCORE || 0.6);

// Google Sheets (Keyword FAQs)
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const API_KEY = process.env.GOOGLE_API_KEY;

// ---------- Health ----------
app.get("/", (req, res) => {
  res.send("✅ Student Support Backend is running — intents + keyword FAQs + sheets + DB.");
});

// ---------- MongoDB ----------
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/student-support", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log("✅ MongoDB connected");
    await refreshFaqCache().catch(() => {});
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
  "🔥 Keep going, you’re doing amazing.",
  "☀️ Even the darkest night ends with sunrise.",
  "🎯 Stay focused, your dreams are valid.",
];
function getAffirmation(name = null) {
  const a = affirmations[Math.floor(Math.random() * affirmations.length)];
  return name ? `Hey ${String(name).split(" ")[0]} — ${a}` : a;
}

// ---------- Helpers ----------
function sendResponse(text) {
  return { fulfillmentText: text, fulfillmentMessages: [{ text: { text: [text] } }] };
}
async function logChat(details) {
  try {
    await ChatLog.create({ ...details, createdAt: new Date() });
  } catch (err) {
    console.error("❌ ChatLog save error:", err?.message || err);
  }
}

// ---------- Keyword FAQs from Google Sheets ----------
let keywordFaqs = [];
async function loadKeywordFaqs() {
  if (!SHEET_ID || !API_KEY) {
    console.warn("⚠️ Missing GOOGLE_SHEET_ID or GOOGLE_API_KEY — skipping keyword FAQs.");
    return [];
  }
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Keywords?key=${API_KEY}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (!data.values || data.values.length < 2) {
      console.warn("⚠️ No keyword FAQs found in sheet.");
      return [];
    }
    keywordFaqs = data.values.slice(1).map((row) => ({
      keywords: (row[0] || "").toLowerCase().split(",").map((k) => k.trim()),
      answer: row[1] || "",
      source: "sheets-keywords",
    }));
    console.log(`✅ Keyword FAQs loaded: ${keywordFaqs.length}`);
    return keywordFaqs;
  } catch (err) {
    console.error("❌ Failed to load keyword FAQs:", err.message);
    return [];
  }
}
async function findKeywordFaq(query) {
  if (!query || !query.trim()) return null;
  if (!keywordFaqs.length) await loadKeywordFaqs();
  const lower = query.toLowerCase();
  for (const item of keywordFaqs) {
    if (item.keywords.some((kw) => lower.includes(kw))) {
      return { answer: item.answer, matched: item.keywords, source: item.source };
    }
  }
  return null;
}

// ---------- Seeder ----------
async function runAutoSeed() {
  if (!(await Student.countDocuments())) {
    await Student.insertMany([
      { studentId: "STU001", name: "Manav Runthala", feesPending: 5000, scholarships: ["Computer Science"], marks: 82, attendance: 88 },
      { studentId: "STU002", name: "Daksh Beniwal", feesPending: 3000, scholarships: ["Mechanical Engineering"], marks: 74, attendance: 79 },
    ]);
    console.log("Seeded students");
  }
  if (!(await Mentor.countDocuments())) {
    await Mentor.create({ mentorId: "MENTOR001", name: "Prof. Sharma", field: "Computer Science", mentees: ["STU001", "STU002"] });
  }
  if (!(await Parent.countDocuments())) {
    await Parent.create({ parentId: "PARENT001", name: "Mr. Runthala", relation: "Father", studentId: "STU001" });
  }
}

// ---------- Webhook ----------
app.post("/webhook", async (req, res) => {
  try {
    console.log("🔍 Incoming webhook:", JSON.stringify(req.body, null, 2));

    const intent = req.body.queryResult?.intent?.displayName || "unknown";
    const params = req.body.queryResult?.parameters || {};
    const userQueryRaw = (req.body.queryResult?.queryText || "").trim();

    const studentIdParam = params.studentId || null;
    const parentIdParam = params.parentId || null;
    const mentorIdParam = params.mentorId || null;

    const studentProfile = studentIdParam ? await Student.findOne({ studentId: studentIdParam }).lean() : null;

    // ---------- Intent handlers ----------
    if (intent === "FinanceIntent") {
      if (!studentIdParam) return res.json(sendResponse("Please provide your Student ID (e.g., STU001)."));
      const student = await Student.findOne({ studentId: studentIdParam });
      if (!student) return res.json(sendResponse("⚠️ No student found with that ID."));
      const resp = `💰 *Finance Summary*\n- Student: ${student.name}\n- Pending Fees: ₹${student.feesPending}\n- Scholarships: ${student.scholarships.join(", ")}\n\n${getAffirmation(student.name)}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "db" });
      return res.json(sendResponse(resp));
    }

    if (intent === "ParentStatusIntent") {
      if (!parentIdParam) return res.json(sendResponse("Please provide your Parent ID (e.g., PARENT001)."));
      const parent = await Parent.findOne({ parentId: parentIdParam });
      if (!parent) return res.json(sendResponse("⚠️ No parent found."));
      const child = await Student.findOne({ studentId: parent.studentId });
      const resp = `👨‍👩‍👦 *Parent Dashboard*\nChild: ${child?.name || parent.studentId}\nAttendance: ${child?.attendance}\nMarks: ${child?.marks}\nFees Pending: ₹${child?.feesPending}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "db" });
      return res.json(sendResponse(resp));
    }

    if (intent === "MentorStatusIntent") {
      if (!mentorIdParam) return res.json(sendResponse("Please provide your Mentor ID (e.g., MENTOR001)."));
      const mentor = await Mentor.findOne({ mentorId: mentorIdParam });
      if (!mentor) return res.json(sendResponse("⚠️ No mentor found."));
      const resp = `👨‍🏫 *Mentor Dashboard*\nMentees: ${mentor.mentees.join(", ")}\n\n${getAffirmation()}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "db" });
      return res.json(sendResponse(resp));
    }

    if (intent === "CounselingIntent") {
      const resp = `🧠 Counseling services are available. A counselor will contact you shortly.\n\n${getAffirmation(studentProfile?.name)}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "rule" });
      return res.json(sendResponse(resp));
    }

    if (intent === "DistressIntent") {
      const resp = `🚨 *Distress Alert*\nYou’re not alone. A counselor will be notified.\nUrgent? Call 📞 1800-599-0019\n\n${getAffirmation(studentProfile?.name)}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "rule" });
      return res.json(sendResponse(resp));
    }

    if (intent === "MarketplaceIntent") {
      const resp = `🛒 *Marketplace Listings*\n- 📚 Used Textbooks\n- 🧮 Calculators\n- 🛏 Hostel Essentials\n- 💻 Laptops\n\n${getAffirmation()}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "static" });
      return res.json(sendResponse(resp));
    }

    if (intent === "MentorshipIntent") {
      const resp = `👨‍🏫 *Mentorship Available*\nMentors in CS, Mechanical, Commerce, AI/DS.\n\n${getAffirmation()}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "static" });
      return res.json(sendResponse(resp));
    }

    if (intent === "ReminderIntent") {
      const userId = studentIdParam || parentIdParam || mentorIdParam || "GENERIC";
      const reminders = await Reminder.find({ targetId: { $in: [userId, "GENERIC"] } }).sort({ createdAt: -1 }).limit(5).lean();
      const resp = reminders.length
        ? `📌 Reminders:\n${reminders.map((r, i) => `${i + 1}. ${r.message}`).join("\n")}\n\n${getAffirmation()}`
        : `📭 No reminders.\n\n${getAffirmation()}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchSource: reminders.length ? "db" : "none" });
      return res.json(sendResponse(resp));
    }

    // ---------- Default Fallback ----------
    if (intent === "Default Fallback Intent") {
      const sres = sentiment.analyze(userQueryRaw);
      if (sres.score <= -3) {
        const resp = `😔 You seem low. Want me to connect you to a counselor? 📞 1800-599-0019\n\n${getAffirmation()}`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "sentiment" });
        return res.json(sendResponse(resp));
      }
      if (sres.score >= 3) {
        const resp = `😊 Glad you’re doing well! Need study tips?\n\n${getAffirmation()}`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "sentiment" });
        return res.json(sendResponse(resp));
      }

      const kw = await findKeywordFaq(userQueryRaw);
      if (kw) {
        const resp = `${kw.answer}\n\n${getAffirmation()}`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchedQuestion: kw.matched, matchSource: kw.source });
        return res.json(sendResponse(resp));
      }

      const best = await findBestFaq(userQueryRaw);
      if (best && best.score >= FAQ_MIN_SCORE) {
        const resp = `${best.answer}\n\n${getAffirmation()}`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchedQuestion: best.question, matchSource: best.source, similarity: best.score });
        return res.json(sendResponse(resp));
      }

      const resp = `🙏 Sorry, I couldn’t find an exact answer. I can guide you in Finance, Mentorship, Counseling, or Marketplace.\n\n${getAffirmation()}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "none" });
      return res.json(sendResponse(resp));
    }

    // Fallback for undefined intents
    return res.json(sendResponse(`I can guide you in Finance, Mentorship, Counseling, or Marketplace. ${getAffirmation()}`));
  } catch (err) {
    console.error("❌ Webhook error:", err?.message || err);
    return res.json(sendResponse(`⚠️ Something went wrong. ${getAffirmation()}`));
  }
});

// ---------- Start ----------
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await loadKeywordFaqs();
});
