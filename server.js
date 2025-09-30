// ---------- Imports ----------
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import Sentiment from "sentiment";
import fetch from "node-fetch";
import stringSimilarity from "string-similarity";

// ---------- Models / Utilities ----------
import Student from "./models/Student.js";
import ChatLog from "./models/ChatLog.js";
import { findBestFaq, refreshFaqCache } from "./utils/getFaqData.js";

// ---------- Bootstrap ----------
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// ---------- Config ----------
const PORT = Number(process.env.PORT ?? 5000);
const AUTO_SEED = (process.env.AUTO_SEED ?? "false") === "true";
const FAQ_MIN_SCORE = Number(process.env.FAQ_MIN_SCORE ?? 0.6);
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const API_KEY = process.env.GOOGLE_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/student-support";

// ---------- Guards for critical env (non-fatal if missing where optional) ----------
function logOptionalEnvWarnings() {
  if (!SHEET_ID || !API_KEY) {
    console.warn("⚠️ GOOGLE_SHEET_ID or GOOGLE_API_KEY missing. Keyword FAQ from Sheets will be disabled.");
  }
}
logOptionalEnvWarnings();

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

/** @param {string|undefined|null} name */
function getAffirmation(name) {
  const a = affirmations[Math.floor(Math.random() * affirmations.length)];
  return name ? `Hey ${String(name).split(" ")[0]} — ${a}` : a;
}

/** @param {string} text */
function sendResponse(text) {
  return {
    fulfillmentText: text,
    fulfillmentMessages: [{ text: { text: [text] } }],
  };
}

/** @param {{[key: string]: any}} details */
async function logChat(details = {}) {
  try {
    await ChatLog.create({ ...details, createdAt: new Date() });
  } catch (err) {
    console.error("❌ ChatLog save error:", err?.message || err);
  }
}

// ---------- Keyword FAQ (Google Sheets; with Fuzzy Matching) ----------
/** @type {Array<{ keywords: string[], answer: string, source: string }>} */
let keywordFaqs = [];

async function loadKeywordFaqs() {
  if (!SHEET_ID || !API_KEY) {
    keywordFaqs = [];
    return [];
  }

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Keywords?key=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Sheets API responded ${res.status}`);
    }
    const data = await res.json();
    if (!data.values || data.values.length < 2) {
      keywordFaqs = [];
      return [];
    }

    keywordFaqs = data.values.slice(1).map((row) => ({
      keywords: String(row[0] ?? "")
        .toLowerCase()
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
      answer: String(row[1] ?? ""),
      source: "sheets-keywords",
    }));

    console.log(`✅ Keyword FAQs loaded: ${keywordFaqs.length}`);
    return keywordFaqs;
  } catch (err) {
    console.error("❌ Failed to load keyword FAQs:", err?.message || err);
    keywordFaqs = [];
    return [];
  }
}

/** @param {string} query */
async function findKeywordFaq(query) {
  const normalized = String(query ?? "").trim().toLowerCase();
  if (!normalized) return null;

  if (!keywordFaqs.length) {
    await loadKeywordFaqs();
  }

  // Exact keyword presence in query
  for (const item of keywordFaqs) {
    if (item.keywords.some((kw) => normalized.includes(kw))) {
      return { ...item, matched: item.keywords, matchType: "exact" };
    }
  }

  // Fuzzy match single keyword vs full query
  let best = null;
  for (const item of keywordFaqs) {
    for (const kw of item.keywords) {
      const score = stringSimilarity.compareTwoStrings(normalized, kw);
      if (!best || score > best.score) best = { item, kw, score };
    }
  }

  if (best && best.score >= 0.6) {
    console.log(`🔍 Fuzzy match: "${best.kw}" (score: ${best.score.toFixed(2)})`);
    return {
      answer: best.item.answer,
      matched: [best.kw],
      score: best.score,
      source: "sheets-fuzzy",
    };
  }

  return null;
}

// ---------- Seeder ----------
async function runAutoSeed() {
  const total = await Student.countDocuments();
  if (total > 0) return;

  await Student.insertMany([
    {
      studentId: "STU001",
      name: "Manav Runthala",
      feesPending: 5000,
      scholarships: ["Computer Science"],
      marks: 82,
      attendance: 88,
    },
    {
      studentId: "STU002",
      name: "Daksh Beniwal",
      feesPending: 3000,
      scholarships: ["Mechanical Engineering"],
      marks: 74,
      attendance: 79,
    },
  ]);
  console.log("✅ Seeded students");
}

// ---------- Helpers for intents ----------
/** @param {string} userQueryRaw */
async function handleDistress(userQueryRaw) {
  const resp = `🚨 Urgent: call 📞 1800-599-0019. A counselor will be notified.\n\n${getAffirmation()}`;
  await logChat({ query: userQueryRaw, response: resp, intent: "DistressIntent", matchSource: "distress" });
  return sendResponse(resp);
}

/** @param {string} userQueryRaw */
async function handleCounseling(userQueryRaw) {
  const resp = `🧠 Counseling services are available. A counselor will contact you shortly.\n\n${getAffirmation()}`;
  await logChat({ query: userQueryRaw, response: resp, intent: "CounselingIntent", matchSource: "counseling" });
  return sendResponse(resp);
}

/** @param {string} userQueryRaw @param {string|null|undefined} studentId */
async function handleFinance(userQueryRaw, studentId) {
  if (!studentId) {
    const resp = "Please provide your Student ID (e.g., STU001).";
    await logChat({ query: userQueryRaw, response: resp, intent: "FinanceIntent", matchSource: "param-missing" });
    return sendResponse(resp);
  }

  const student = await Student.findOne({ studentId }).lean();
  if (!student) {
    const resp = "⚠️ I couldn’t find details for that student ID.";
    await logChat({ query: userQueryRaw, response: resp, intent: "FinanceIntent", matchSource: "not-found" });
    return sendResponse(resp);
  }

  const resp =
    `💰 Finance Summary` +
    `\n- Student: ${student.name}` +
    `\n- Pending Fees: ₹${student.feesPending}` +
    `\n- Scholarships: ${student.scholarships.join(", ") || "N/A"}` +
    `\n\n${getAffirmation(student.name)}`;

  await logChat({ query: userQueryRaw, response: resp, intent: "FinanceIntent", matchSource: "database" });
  return sendResponse(resp);
}

/** @param {string} userQueryRaw */
async function handleFallback(userQueryRaw) {
  // 1) Keyword FAQ (exact/fuzzy from Sheets)
  const kw = await findKeywordFaq(userQueryRaw);
  if (kw) {
    const resp = `${kw.answer}\n\n${getAffirmation()}`;
    await logChat({
      query: userQueryRaw,
      response: resp,
      intent: "Default Fallback Intent",
      matchSource: kw.source,
      matchedQuestion: Array.isArray(kw.matched) ? kw.matched.join(",") : undefined,
      similarity: kw.score,
    });
    return sendResponse(resp);
  }

  // 2) Smart FAQ (app-specific)
  const best = await findBestFaq(userQueryRaw);
  if (best && best.score >= FAQ_MIN_SCORE) {
    const resp = `${best.answer}\n\n${getAffirmation()}`;
    await logChat({
      query: userQueryRaw,
      response: resp,
      intent: "Default Fallback Intent",
      matchSource: best.source,
      similarity: best.score,
    });
    return sendResponse(resp);
  }

  // 3) Sentiment-based guidance
  const s = sentiment.analyze(userQueryRaw);
  if (s.score <= -3) {
    const resp = `😔 You seem low. Call 📞 1800-599-0019.\n\n${getAffirmation()}`;
    await logChat({ query: userQueryRaw, response: resp, intent: "Default Fallback Intent", matchSource: "sentiment-negative" });
    return sendResponse(resp);
  }
  if (s.score >= 3) {
    const resp = `😊 Glad you’re doing well!\n\n${getAffirmation()}`;
    await logChat({ query: userQueryRaw, response: resp, intent: "Default Fallback Intent", matchSource: "sentiment-positive" });
    return sendResponse(resp);
  }

  // 4) Final fallback
  const resp = `🙏 Sorry, I couldn’t find an exact answer. I can guide you in Finance, Mentorship, Counseling, or Marketplace.\n\n${getAffirmation()}`;
  await logChat({ query: userQueryRaw, response: resp, intent: "Default Fallback Intent", matchSource: "none" });
  return sendResponse(resp);
}

// ---------- Routes ----------
app.post("/webhook", async (req, res) => {
  const intent = req.body?.queryResult?.intent?.displayName ?? "unknown";
  const userQueryRaw = String(req.body?.queryResult?.queryText ?? "").trim();
  console.log(`👉 Query: "${userQueryRaw}" | Intent: ${intent}`);

  try {
    switch (intent) {
      case "DistressIntent":
        return res.json(await handleDistress(userQueryRaw));
      case "CounselingIntent":
        return res.json(await handleCounseling(userQueryRaw));
      case "FinanceIntent": {
        const studentId = req.body?.queryResult?.parameters?.studentId ?? null;
        return res.json(await handleFinance(userQueryRaw, studentId));
      }
      case "Default Fallback Intent":
        return res.json(await handleFallback(userQueryRaw));
      default: {
        const resp = `I can guide you in Finance, Mentorship, Counseling, or Marketplace. ${getAffirmation()}`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "catchall" });
        return res.json(sendResponse(resp));
      }
    }
  } catch (err) {
    console.error("❌ Webhook error:", err?.message || err);
    return res.json(sendResponse(`⚠️ Something went wrong. ${getAffirmation()}`));
  }
});

// ---------- Startup ----------
(async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ MongoDB connected");

    await Promise.all([refreshFaqCache(), loadKeywordFaqs()]);
    if (AUTO_SEED) await runAutoSeed();

    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  } catch (err) {
    console.error("❌ Startup failed:", err?.message || err);
    process.exit(1);
  }
})();
