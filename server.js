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
import { findKeywordFaq, loadKeywordFaqs } from "./utils/getKeywordFaq.js";

dotenv.config();
const app = express();
app.use(bodyParser.json());
app.use(cors());

// ---------- Config ----------
const ADMIN_KEY = process.env.ADMIN_KEY || "admin-secret";
const AUTO_SEED = process.env.AUTO_SEED === "true";
const PORT = process.env.PORT || 5000;
const WEBHOOK_TIMEOUT_MS = Number(process.env.WEBHOOK_TIMEOUT_MS || 2500);

// ---------- Health check ----------
app.get("/", (req, res) => {
  res.send("✅ Student Support Backend is running with Keywords + Fuzzy FAQs!");
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
      await loadKeywordFaqs();
    } catch (e) {
      console.warn("⚠️ FAQ/Keyword cache init failed:", e.message);
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

// ---------- Webhook ----------
app.post("/webhook", async (req, res) => {
  const intent = req.body.queryResult?.intent?.displayName || "unknown";
  const userQueryRaw = (req.body.queryResult?.queryText || "").trim();
  const params = req.body.queryResult?.parameters || {};

  try {
    // --- Default Fallback Intent (with keyword lookup first) ---
    if (intent === "Default Fallback Intent") {
      // 1) Keyword FAQ quick match
      const keywordHit = await findKeywordFaq(userQueryRaw);
      if (keywordHit) {
        const resp = `${keywordHit.answer}\n\n${getAffirmation()}`;
        await logChat({
          query: userQueryRaw,
          response: resp,
          intent,
          matchedQuestion: keywordHit.matched?.join(", ") || "",
          matchSource: keywordHit.source,
          similarity: 1,
        });
        return res.json(sendResponse(resp));
      }

      // 2) Sentiment check
      const sentimentResult = sentiment.analyze(userQueryRaw);
      if (sentimentResult.score <= -3) {
        const resp = `😔 You seem low. Want me to connect you to a counselor?\nCall 📞 1800-599-0019\n\n${getAffirmation()}`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "sentiment" });
        return res.json(sendResponse(resp));
      }
      if (sentimentResult.score >= 3) {
        const resp = `😊 Glad you’re doing well! Need study tips?\n\n${getAffirmation()}`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "sentiment" });
        return res.json(sendResponse(resp));
      }

      // 3) Fuzzy FAQ search
      const best = await findBestFaq(userQueryRaw);
      if (best) {
        const resp = `${best.answer}\n\n${getAffirmation()}`;
        await logChat({
          query: userQueryRaw,
          response: resp,
          intent,
          matchedQuestion: best.question,
          matchSource: best.source,
          similarity: best.score,
        });
        return res.json(sendResponse(resp));
      }

      // 4) Final fallback
      const resp = `🙏 Sorry, I couldn’t find an exact answer. But I can help in Finance, Mentorship, Counseling, or Marketplace.\n\n${getAffirmation()}`;
      await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "none" });
      return res.json(sendResponse(resp));
    }

    // --- Other intents (simplified for now) ---
    return res.json(sendResponse(`Intent ${intent} not yet wired here.`));
  } catch (err) {
    console.error("❌ Webhook error:", err.message || err);
    return res.json(sendResponse(`⚠️ Something went wrong. ${getAffirmation()}`));
  }
});

// ---------- Start ----------
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
