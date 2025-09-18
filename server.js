// server.js
import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import Sentiment from "sentiment";
import fetch from "node-fetch";

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

// Google Sheets for keyword FAQs
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const API_KEY = process.env.GOOGLE_API_KEY;

// ---------- Health ----------
app.get("/", (req, res) => {
  res.send("✅ Student Support Backend is running — with MongoDB + Keyword FAQs.");
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
      console.warn("⚠️ refreshFaqCache failed:", e?.message || e);
    }
    if (AUTO_SEED) {
      try {
        await runAutoSeed();
        console.log("🔁 Auto-seed complete.");
      } catch (e) {
        console.warn("⚠️ Auto-seed failed:", e?.message || e);
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
    await ChatLog.create({
      ...details,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error("❌ ChatLog save error:", err?.message || err);
  }
}

// ---------- Keyword FAQ Loader (Sheets API Key) ----------
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

// ---------- Seeder (demo) ----------
async function runAutoSeed() {
  if (!(await Student.countDocuments())) {
    await Student.insertMany([
      { studentId: "STU001", name: "Manav Runthala", feesPending: 5000, scholarships: ["Computer Science"], marks: 82, attendance: 88 },
      { studentId: "STU002", name: "Daksh Beniwal", feesPending: 3000, scholarships: ["Mechanical Engineering"], marks: 74, attendance: 79 },
    ]);
    console.log("✅ Seeded students");
  }
}

// ---------- Webhook ----------
app.post("/webhook", async (req, res) => {
  try {
    const intent = req.body.queryResult?.intent?.displayName || "unknown";
    const userQueryRaw = (req.body.queryResult?.queryText || "").trim();

    // --- DistressIntent ---
    if (intent === "DistressIntent") {
      const resp = `🚨 I sense you’re in distress. You’re not alone.\nIf urgent, please call 📞 1800-599-0019.\nA counselor will be notified.\n\n${getAffirmation()}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "distress" });
      return res.json(sendResponse(resp));
    }

    // --- CounselingIntent ---
    if (intent === "CounselingIntent") {
      const resp = `🧠 Counseling services are available. A counselor will contact you shortly.\n\n${getAffirmation()}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "counseling" });
      return res.json(sendResponse(resp));
    }

    // --- FinanceIntent ---
    if (intent === "FinanceIntent") {
      const studentId = req.body.queryResult?.parameters?.studentId || null;
      if (!studentId) {
        const resp = "Please provide your Student ID (e.g., STU001).";
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "param-missing" });
        return res.json(sendResponse(resp));
      }

      try {
        const student = await Student.findOne({ studentId }).lean();
        if (!student) {
          const resp = "⚠️ I couldn’t find details for that student ID.";
          await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "not-found" });
          return res.json(sendResponse(resp));
        }

        const resp = `💰 Finance Summary\n- Student: ${student.name}\n- Pending Fees: ₹${student.feesPending}\n- Scholarships: ${student.scholarships.join(", ") || "N/A"}\n\n${getAffirmation(student.name)}`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "database" });
        return res.json(sendResponse(resp));
      } catch (err) {
        console.error("❌ FinanceIntent error:", err.message);
        return res.json(sendResponse("⚠️ Could not fetch finance details. Please try again later."));
      }
    }

    // --- Default Fallback Intent ---
    if (intent === "Default Fallback Intent") {
      // 1. Keyword FAQ first
      const kw = await findKeywordFaq(userQueryRaw);
      if (kw) {
        const resp = `${kw.answer}\n\n${getAffirmation()}`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: kw.source, matchedQuestion: kw.matched.join(",") });
        return res.json(sendResponse(resp));
      }

      // 2. Smart FAQ (DB/Sheets)
      const best = await findBestFaq(userQueryRaw);
      if (best && best.score >= FAQ_MIN_SCORE) {
        const resp = `${best.answer}\n\n${getAffirmation()}`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: best.source, similarity: best.score });
        return res.json(sendResponse(resp));
      }

      // 3. Sentiment (last)
      const sres = sentiment.analyze(userQueryRaw);
      if (sres.score <= -3) {
        const resp = `😔 You seem low. Want me to connect you to a counselor?\nCall 📞 1800-599-0019\n\n${getAffirmation()}`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "sentiment" });
        return res.json(sendResponse(resp));
      }
      if (sres.score >= 3) {
        const resp = `😊 Glad you’re doing well! Need study tips?\n\n${getAffirmation()}`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "sentiment" });
        return res.json(sendResponse(resp));
      }

      // 4. Final fallback
      const resp = `🙏 Sorry, I couldn’t find an exact answer. I can guide you in Finance, Mentorship, Counseling, or Marketplace.\n\n${getAffirmation()}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "none" });
      return res.json(sendResponse(resp));
    }

    // --- Default catch for other intents ---
    const resp = `I can guide you in Finance, Mentorship, Counseling, or Marketplace. ${getAffirmation()}`;
    await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "catchall" });
    return res.json(sendResponse(resp));
  } catch (err) {
    console.error("❌ Webhook top-level error:", err?.message || err);
    const resp = `⚠️ Something went wrong. ${getAffirmation()}`;
    return res.json(sendResponse(resp));
  }
});

// ---------- Start ----------
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await loadKeywordFaqs();
});
