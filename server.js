// server.js  (simplified + cleaned)
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import Sentiment from "sentiment";
import fetch from "node-fetch";
import stringSimilarity from "string-similarity";

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
app.use(express.json());
app.use(cors());

// ---------- Config ----------
const PORT = Number(process.env.PORT || 5000);
const AUTO_SEED = process.env.AUTO_SEED === "true";
const FAQ_MIN_SCORE = Number(process.env.FAQ_MIN_SCORE || 0.6);
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const API_KEY = process.env.GOOGLE_API_KEY;

// ---------- Utilities ----------
const sentiment = new Sentiment();
const affirmations = [
  "🌟 You’re stronger than you think.",
  "💡 Every small step forward is progress.",
  "✨ Your efforts today build your future tomorrow.",
  "🔥 Keep going, you’re doing amazing.",
  "☀️ Even the darkest night ends with sunrise.",
  "🎯 Stay focused, your dreams are valid.",
];
const getAffirmation = (name) => {
  const a = affirmations[Math.floor(Math.random() * affirmations.length)];
  return name ? `Hey ${String(name).split(" ")[0]} — ${a}` : a;
};
const sendResponse = (text) => ({ fulfillmentText: text, fulfillmentMessages: [{ text: { text: [text] } }] });
async function logChat(details = {}) {
  try {
    await ChatLog.create({ ...details, createdAt: new Date() });
  } catch (err) {
    console.error("ChatLog save error:", err?.message || err);
  }
}

// ---------- Keyword FAQs (Sheets) ----------
let keywordFaqs = [];
async function loadKeywordFaqs() {
  if (!SHEET_ID || !API_KEY) {
    console.warn("⚠️ Missing GOOGLE_SHEET_ID or GOOGLE_API_KEY — keyword FAQs skipped.");
    return;
  }
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Keywords?key=${API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.values || data.values.length < 2) {
      console.warn("⚠️ No keyword rows in sheet.");
      return;
    }
    keywordFaqs = data.values.slice(1).map((r) => ({
      keywords: (r[0] || "").toLowerCase().split(",").map((k) => k.trim()).filter(Boolean),
      answer: r[1] || "",
      source: "sheets-keywords",
    }));
    console.log(`✅ Keyword FAQs loaded: ${keywordFaqs.length}`);
  } catch (err) {
    console.error("Failed loading keyword sheet:", err?.message || err);
  }
}

/** Find keyword FAQ:
 * 1) exact keyword inclusion
 * 2) fuzzy match (string-similarity) with threshold
 */
async function findKeywordFaq(query) {
  if (!query || !query.trim()) return null;
  if (!keywordFaqs.length) await loadKeywordFaqs();
  const lower = query.toLowerCase();

  // exact inclusion
  for (const item of keywordFaqs) {
    if (item.keywords.some((kw) => lower.includes(kw))) {
      return { ...item, matched: item.keywords, matchType: "exact" };
    }
  }

  // fuzzy
  let best = null;
  for (const item of keywordFaqs) {
    for (const kw of item.keywords) {
      const score = stringSimilarity.compareTwoStrings(lower, kw);
      if (!best || score > best.score) best = { item, kw, score };
    }
  }
  if (best && best.score >= 0.6) {
    return { answer: best.item.answer, matched: [best.kw], score: best.score, source: "sheets-fuzzy", matchType: "fuzzy" };
  }
  return null;
}

// ---------- Seeder (light) ----------
async function runAutoSeed() {
  try {
    if ((await Student.countDocuments()) === 0) {
      await Student.insertMany([
        { studentId: "STU001", name: "Manav Runthala", feesPending: 5000, scholarships: ["Computer Science"], marks: 82, attendance: 88 },
        { studentId: "STU002", name: "Daksh Beniwal", feesPending: 3000, scholarships: ["Mechanical Engineering"], marks: 74, attendance: 79 },
      ]);
      console.log("✅ Seeded students");
    }
  } catch (err) {
    console.warn("Seeder error:", err?.message || err);
  }
}

// ---------- Mongo + Startup ----------
async function startup() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/student-support");
    console.log("✅ MongoDB connected");
    // refresh FAQ cache (from utils/getFaqData.js)
    try { await refreshFaqCache(); } catch (e) { console.warn("refreshFaqCache failed:", e?.message || e); }
    await loadKeywordFaqs();
    if (AUTO_SEED) await runAutoSeed();
  } catch (err) {
    console.error("Mongo connection failed:", err?.message || err);
    process.exit(1);
  }
}

// ---------- Webhook Handler ----------
app.post("/webhook", async (req, res) => {
  const intent = req.body?.queryResult?.intent?.displayName || "unknown";
  const userQueryRaw = String(req.body?.queryResult?.queryText || "").trim();
  console.log(`👉 Query: "${userQueryRaw}" Intent: ${intent}`);

  try {
    // Distress high-priority
    if (intent === "DistressIntent") {
      const resp = `🚨 If you are in immediate danger call 📞 1800-599-0019. A counselor will be notified.\n\n${getAffirmation()}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "distress" });
      return res.json(sendResponse(resp));
    }

    // CounselingIntent
    if (intent === "CounselingIntent") {
      const resp = `🧠 Counseling services are available. A counselor will contact you shortly.\n\n${getAffirmation()}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "counseling" });
      return res.json(sendResponse(resp));
    }

    // FinanceIntent (parameter-based)
    if (intent === "FinanceIntent") {
      const studentId = req.body?.queryResult?.parameters?.studentId || null;
      if (!studentId) {
        const resp = "Please provide your Student ID (e.g., STU001).";
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "param-missing" });
        return res.json(sendResponse(resp));
      }
      const student = await Student.findOne({ studentId }).lean();
      if (!student) {
        const resp = "⚠️ I couldn’t find details for that student ID.";
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "not-found" });
        return res.json(sendResponse(resp));
      }
      const resp = `💰 Finance Summary\n- Student: ${student.name}\n- Pending Fees: ₹${student.feesPending}\n- Scholarships: ${student.scholarships.join(", ") || "N/A"}\n\n${getAffirmation(student.name)}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "database" });
      return res.json(sendResponse(resp));
    }

    // Default fallback: 1) keyword, 2) smart FAQ, 3) sentiment, 4) final fallback
    if (intent === "Default Fallback Intent") {
      // 1) keyword (includes fuzzy)
      const kw = await findKeywordFaq(userQueryRaw);
      if (kw) {
        const resp = `${kw.answer}\n\n${getAffirmation()}`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: kw.source || "keyword", matchedQuestion: kw.matched?.join(",") || "" });
        return res.json(sendResponse(resp));
      }

      // 2) smart DB/Sheets FAQ
      const best = await findBestFaq(userQueryRaw);
      if (best && best.score >= FAQ_MIN_SCORE) {
        const resp = `${best.answer}\n\n${getAffirmation()}`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: best.source, similarity: best.score });
        return res.json(sendResponse(resp));
      }

      // 3) sentiment fallback
      const s = sentiment.analyze(userQueryRaw);
      if (s.score <= -3) {
        const resp = `😔 You seem low. Want me to connect you to a counselor? 📞 1800-599-0019\n\n${getAffirmation()}`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "sentiment-negative" });
        return res.json(sendResponse(resp));
      } else if (s.score >= 3) {
        const resp = `😊 Glad you’re doing well! Need study tips?\n\n${getAffirmation()}`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "sentiment-positive" });
        return res.json(sendResponse(resp));
      }

      // 4) final fallback
      const resp = `🙏 Sorry, I couldn’t find an exact answer. I can guide you in Finance, Mentorship, Counseling, or Marketplace.\n\n${getAffirmation()}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "none" });
      return res.json(sendResponse(resp));
    }

    // catch-all for any other known intents not handled above
    const fallback = `I can guide you in Finance, Mentorship, Counseling, or Marketplace. ${getAffirmation()}`;
    await logChat({ query: userQueryRaw, response: fallback, intent, matchSource: "catchall" });
    return res.json(sendResponse(fallback));
  } catch (err) {
    console.error("Webhook error:", err?.message || err);
    const r = `⚠️ Something went wrong. ${getAffirmation()}`;
    return res.json(sendResponse(r));
  }
});

// ---------- Start server ----------
(async () => {
  await startup();
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
})();
