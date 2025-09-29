// ---------- Imports ----------
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import Sentiment from "sentiment";
import fetch from "node-fetch";
import stringSimilarity from "string-similarity";

// ---------- Models ----------
import Student from "./models/Student.js";
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

// ---------- Sentiment + Affirmations ----------
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
const sendResponse = (text) => ({
  fulfillmentText: text,
  fulfillmentMessages: [{ text: { text: [text] } }],
});
async function logChat(details = {}) {
  try {
    await ChatLog.create({ ...details, createdAt: new Date() });
  } catch (err) {
    console.error("❌ ChatLog save error:", err?.message || err);
  }
}

// ---------- Keyword FAQ (with Fuzzy Matching) ----------
let keywordFaqs = [];
async function loadKeywordFaqs() {
  if (!SHEET_ID || !API_KEY) return [];
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Keywords?key=${API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.values || data.values.length < 2) return [];

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

  // Exact match
  for (const item of keywordFaqs) {
    if (item.keywords.some((kw) => lower.includes(kw))) {
      return { ...item, matched: item.keywords, matchType: "exact" };
    }
  }

  // Fuzzy match
  let best = null;
  for (const item of keywordFaqs) {
    for (const kw of item.keywords) {
      const score = stringSimilarity.compareTwoStrings(lower, kw);
      if (!best || score > best.score) best = { item, kw, score };
    }
  }
  if (best && best.score >= 0.6) {
    console.log(`🔍 Fuzzy match: "${best.kw}" (score: ${best.score})`);
    return { answer: best.item.answer, matched: [best.kw], score: best.score, source: "sheets-fuzzy" };
  }
  return null;
}

// ---------- Seeder ----------
async function runAutoSeed() {
  if ((await Student.countDocuments()) === 0) {
    await Student.insertMany([
      { studentId: "STU001", name: "Manav Runthala", feesPending: 5000, scholarships: ["Computer Science"], marks: 82, attendance: 88 },
      { studentId: "STU002", name: "Daksh Beniwal", feesPending: 3000, scholarships: ["Mechanical Engineering"], marks: 74, attendance: 79 },
    ]);
    console.log("✅ Seeded students");
  }
}

// ---------- Webhook ----------
app.post("/webhook", async (req, res) => {
  const intent = req.body?.queryResult?.intent?.displayName || "unknown";
  const userQueryRaw = String(req.body?.queryResult?.queryText || "").trim();
  console.log(`👉 Query: "${userQueryRaw}" | Intent: ${intent}`);

  try {
    // Distress
    if (intent === "DistressIntent") {
      const resp = `🚨 Urgent: call 📞 1800-599-0019. A counselor will be notified.\n\n${getAffirmation()}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "distress" });
      return res.json(sendResponse(resp));
    }

    // Counseling
    if (intent === "CounselingIntent") {
      const resp = `🧠 Counseling services are available. A counselor will contact you shortly.\n\n${getAffirmation()}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "counseling" });
      return res.json(sendResponse(resp));
    }

    // Finance
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

    // Default Fallback
    if (intent === "Default Fallback Intent") {
      // Keyword (fuzzy)
      const kw = await findKeywordFaq(userQueryRaw);
      if (kw) {
        const resp = `${kw.answer}\n\n${getAffirmation()}`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: kw.source, matchedQuestion: kw.matched.join(",") });
        return res.json(sendResponse(resp));
      }

      // Smart FAQ
      const best = await findBestFaq(userQueryRaw);
      if (best && best.score >= FAQ_MIN_SCORE) {
        const resp = `${best.answer}\n\n${getAffirmation()}`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: best.source, similarity: best.score });
        return res.json(sendResponse(resp));
      }

      // Sentiment
      const s = sentiment.analyze(userQueryRaw);
      if (s.score <= -3) {
        const resp = `😔 You seem low. Call 📞 1800-599-0019.\n\n${getAffirmation()}`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "sentiment-negative" });
        return res.json(sendResponse(resp));
      }
      if (s.score >= 3) {
        const resp = `😊 Glad you’re doing well!\n\n${getAffirmation()}`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "sentiment-positive" });
        return res.json(sendResponse(resp));
      }

      // Final fallback
      const resp = `🙏 Sorry, I couldn’t find an exact answer. I can guide you in Finance, Mentorship, Counseling, or Marketplace.\n\n${getAffirmation()}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "none" });
      return res.json(sendResponse(resp));
    }

    // Catch-all
    const resp = `I can guide you in Finance, Mentorship, Counseling, or Marketplace. ${getAffirmation()}`;
    await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "catchall" });
    return res.json(sendResponse(resp));
  } catch (err) {
    console.error("❌ Webhook error:", err?.message || err);
    return res.json(sendResponse(`⚠️ Something went wrong. ${getAffirmation()}`));
  }
});

// ---------- Startup ----------
(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/student-support");
    console.log("✅ MongoDB connected");
    await refreshFaqCache();
    await loadKeywordFaqs();
    if (AUTO_SEED) await runAutoSeed();
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  } catch (err) {
    console.error("❌ Startup failed:", err?.message || err);
    process.exit(1);
  }
})();
