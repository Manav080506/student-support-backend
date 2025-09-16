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
import { findKeywordFaq } from "./utils/getKeywordFaq.js"; // ✅ new

dotenv.config();
const app = express();
app.use(bodyParser.json());
app.use(cors());

// ---------- Config ----------
const ADMIN_KEY = process.env.ADMIN_KEY || "admin-secret";
const AUTO_SEED = process.env.AUTO_SEED === "true";
const PORT = process.env.PORT || 5000;
const WEBHOOK_TIMEOUT_MS = Number(process.env.WEBHOOK_TIMEOUT_MS || 2500); // ms

// ---------- Basic health ----------
app.get("/", (req, res) => {
  res.send("✅ Student Support Backend is running — now with keyword FAQs!");
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
      createdAt: new Date(),
    });
  } catch (err) {
    console.error("❌ ChatLog save error:", err?.message || err);
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
  } catch {
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
    console.log("✅ Seeded students");
  }
  if (!(await Parent.countDocuments())) {
    await Parent.create({ parentId: "PARENT001", name: "Mr. Runthala", relation: "Father", studentId: "STU001" });
    console.log("✅ Seeded parents");
  }
  if (!(await Mentor.countDocuments())) {
    await Mentor.create({ mentorId: "MENTOR001", name: "Prof. Sharma", field: "Computer Science", mentees: ["STU001", "STU002"] });
    console.log("✅ Seeded mentors");
  }
  if (!(await Faq.countDocuments())) {
    await Faq.insertMany([
      { category: "Finance", question: "What scholarships are available", answer: "🎓 Scholarships: merit and need-based. Check dashboard for eligibility." },
      { category: "Finance", question: "When is my fee due", answer: "Fee deadlines are posted on the finance dashboard. Contact finance for specifics." },
      { category: "Counseling", question: "I feel anxious", answer: "🧠 Try 4-4-4 breathing and reach out to a counselor if it persists." },
      { category: "Distress", question: "I feel depressed", answer: "🚨 If immediate danger, call local emergency services. Helpline: 1800-599-0019." },
      { category: "General", question: "Who are you", answer: "🤖 I am the Student Support Assistant — here to help." },
    ]);
    console.log("✅ Seeded FAQs");
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
    console.log("✅ Seeded badge meta");
  }
}

// ---------- Webhook ----------
app.post("/webhook", async (req, res) => {
  try {
    const intent = req.body.queryResult?.intent?.displayName || "unknown";
    const params = req.body.queryResult?.parameters || {};
    const userQueryRaw = (req.body.queryResult?.queryText || "").trim();

    const studentIdParam = params.studentId || params.userID || null;
    const parentIdParam = params.parentId || null;
    const mentorIdParam = params.mentorId || null;
    const studentProfile = studentIdParam ? await Student.findOne({ studentId: studentIdParam }).lean() : null;

    // Default Fallback Intent with new order
    if (intent === "Default Fallback Intent") {
      // 1) Sentiment
      try {
        const sres = sentiment.analyze(userQueryRaw);
        if (sres.score <= -3) {
          const resp = `😔 You seem low. Want me to connect you to a counselor?\nCall 📞 1800-599-0019\n\n${getAffirmation(studentProfile?.name)}`;
          await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "sentiment", matchedQuestion: "sentiment_negative", similarity: Math.abs(sres.score) });
          return res.json(sendResponse(resp));
        }
        if (sres.score >= 3) {
          const resp = `😊 Glad you’re doing well! Need study tips?\n\n${getAffirmation(studentProfile?.name)}`;
          await logChat({ query: userQueryRaw, response: resp, intent, matchSource: "sentiment", matchedQuestion: "sentiment_positive", similarity: sres.score });
          return res.json(sendResponse(resp));
        }
      } catch (err) {
        console.warn("⚠️ Sentiment failed:", err?.message || err);
      }

      // 2) Keyword FAQs
      const keywordMatch = await findKeywordFaq(userQueryRaw);
      if (keywordMatch) {
        const resp = `${keywordMatch.answer}\n\n${getAffirmation(studentProfile?.name)}`;
        await logChat({
          query: userQueryRaw,
          response: resp,
          intent,
          matchedQuestion: keywordMatch.matched?.join(", ") || "keyword",
          matchSource: keywordMatch.source,
          similarity: 1,
        });
        return res.json(sendResponse(resp));
      }

      // 3) Fuzzy FAQ
      const best = await findBestFaq(userQueryRaw);
      if (best) {
        const resp = `${best.answer}\n\n${getAffirmation(studentProfile?.name)}`;
        await logChat({ query: userQueryRaw, response: resp, intent, matchedQuestion: best.question, matchSource: best.source, similarity: best.score });
        return res.json(sendResponse(resp));
      }

      // 4) Synonym checks
      const lower = userQueryRaw.toLowerCase();
      if (["fees", "fee", "scholarship", "finance", "dues", "pending"].some((w) => lower.includes(w))) {
        const r = `💰 It looks like you want finance help. Please provide your Student ID (e.g., STU001).`;
        await logChat({ query: userQueryRaw, response: r, intent, matchSource: "synonym", matchedQuestion: "finance_synonym", similarity: 1 });
        return res.json(sendResponse(r));
      }
      if (["suicide", "suicidal", "kill myself", "end my life"].some((w) => lower.includes(w))) {
        const r = `🚨 I'm worried you're mentioning self-harm. If you are in immediate danger call local emergency services. Helpline: 📞 1800-599-0019.`;
        await logChat({ query: userQueryRaw, response: r, intent, matchSource: "synonym", matchedQuestion: "selfharm_synonym", similarity: 1 });
        return res.json(sendResponse(r));
      }

      // 5) Final fallback
      const fallbackResp = `🙏 Sorry, I couldn’t find an exact answer. But I can help in Finance, Mentorship, Counseling, or Marketplace.\n\n${getAffirmation(studentProfile?.name)}`;
      await logChat({ query: userQueryRaw, response: fallbackResp, intent, matchSource: "none", similarity: 0 });
      return res.json(sendResponse(fallbackResp));
    }

    // Other intents (Finance, Parent, Mentor, etc.) — keep your existing code here
    return res.json(sendResponse(`I can guide you in Finance, Mentorship, Counseling, or Marketplace. ${getAffirmation(studentProfile?.name)}`));
  } catch (err) {
    console.error("❌ Webhook error:", err.message || err);
    return res.json(sendResponse(`⚠️ Something went wrong. ${getAffirmation()}`));
  }
});

// ---------- Start ----------
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
