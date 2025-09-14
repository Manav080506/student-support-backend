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
import ChatLog from "./models/ChatLog.js"; // Chat log model
import { getSheetData } from "./utils/sheets.js";

dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(cors());

// ------------------ Root health check ------------------
app.get("/", (req, res) => {
  res.send("✅ Student Support Backend is running");
});

// ------------------ MongoDB Connection ------------------
mongoose
  .connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ------------------ Dummy Database ------------------
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

// ------------------ Sentiment ------------------
const sentiment = new Sentiment();

// ------------------ Helper ------------------
function sendResponse(text) {
  return { fulfillmentText: text, fulfillmentMessages: [{ text: { text: [text] } }] };
}

async function logChat({ query, response, intent, matchedQuestion = null, matchSource = "none", similarity = 0 }) {
  try {
    await ChatLog.create({ query, response, intent, matchedQuestion, matchSource, similarity });
  } catch (err) {
    console.error("❌ ChatLog save error:", err.message);
  }
}

function fuzzyBestMatch(query, candidates) {
  if (!candidates || candidates.length === 0) return null;
  const scores = stringSimilarity.findBestMatch(query, candidates);
  return { bestMatchText: scores.bestMatch.target, bestScore: scores.bestMatch.rating };
}

// ------------------ Webhook ------------------
app.post("/webhook", async (req, res) => {
  const intent = req.body.queryResult?.intent?.displayName || "unknown";
  const params = req.body.queryResult?.parameters || {};

  try {
    // === FINANCE INTENT ===
    if (intent === "FinanceIntent") {
      const studentId = params.studentId?.[0] || params.userID || (Array.isArray(params.userID) && params.userID[0]);
      if (!studentId) {
        const resp = "Please provide your Student ID (e.g., STU001).";
        await logChat({ query: req.body.queryResult.queryText || "", response: resp, intent });
        return res.json(sendResponse(resp));
      }
      const student = students[studentId];
      if (!student) {
        const resp = "⚠️ I couldn’t find details for that student ID.";
        await logChat({ query: req.body.queryResult.queryText || "", response: resp, intent });
        return res.json(sendResponse(resp));
      }
      try {
        await Badge.create({ studentId, badgeName: "Finance Explorer", reason: "Checked finance summary" });
      } catch (e) {
        console.warn("⚠️ Badge create failed:", e.message);
      }
      const resp = `💰 *Finance Summary*\n- Student: ${student.name}\n- Pending Fees: ₹${student.feesPending}\n- Scholarships: ${student.scholarships.join(", ")}\n\n👉 Options:\n1️⃣ Show Eligible Scholarships\n2️⃣ Show Fee Deadlines`;
      await logChat({ query: req.body.queryResult.queryText || "", response: resp, intent, matchedQuestion: "FinanceSummary", matchSource: "database", similarity: 1 });
      return res.json(sendResponse(resp));
    }

    // === PARENT, MENTOR, COUNSELING, DISTRESS, MARKETPLACE, MENTORSHIP INTENTS ===
    // (same as your version — unchanged for brevity)
    // ... [KEEP SAME IMPLEMENTATIONS AS YOUR LAST FILE]

    // === REMINDER INTENT ===
    if (intent === "ReminderIntent") {
      const userId = params.studentId?.[0] || params.parentId?.[0] || params.mentorId?.[0] || params.userID || "GENERIC";
      const reminders = await Reminder.find({ targetId: { $in: [userId, "GENERIC"] } })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();
      const resp = reminders.length
        ? `📌 *Your Latest Reminders:*\n${reminders.map((r, i) => `${i + 1}. ${r.message}`).join("\n")}`
        : "📭 You have no reminders at the moment.";
      await logChat({ query: req.body.queryResult.queryText || "", response: resp, intent, matchedQuestion: "Reminders", matchSource: reminders.length ? "database" : "none", similarity: reminders.length ? 1 : 0 });
      return res.json(sendResponse(resp));
    }

    // === FALLBACK (sentiment + fuzzy + hardcoded) ===
    if (intent === "Default Fallback Intent") {
      const userQuery = (req.body.queryResult.queryText || "").trim();

      if (!userQuery) {
        const resp = "I didn't get that. Can you say it again?";
        await logChat({ query: userQuery, response: resp, intent });
        return res.json(sendResponse(resp));
      }

      // 🧠 Sentiment
      try {
        const sentimentResult = sentiment.analyze(userQuery);
        if (sentimentResult.score <= -3) {
          const resp = `😔 I sense you’re feeling very low. You’re not alone.\n✔ Would you like me to connect you to a counselor?\n✔ Helpline: 📞 1800-599-0019`;
          await logChat({ query: userQuery, response: resp, intent, matchSource: "sentiment", matchedQuestion: "sentiment_alert", similarity: Math.abs(sentimentResult.score / 5) });
          return res.json(sendResponse(resp));
        }
      } catch (err) {
        console.warn("⚠️ Sentiment analysis failed:", err.message);
      }

      // 1️⃣ FAQ DB
      try {
        const faq = await Faq.findOne({ question: new RegExp(userQuery, "i") });
        if (faq) {
          const resp = faq.answer;
          await logChat({ query: userQuery, response: resp, intent, matchedQuestion: faq.question, matchSource: "faq", similarity: 1 });
          return res.json(sendResponse(resp));
        }
        const allFaqs = await Faq.find({}, { question: 1, answer: 1 }).lean();
        if (allFaqs.length > 0) {
          const match = fuzzyBestMatch(userQuery, allFaqs.map(f => f.question));
          if (match && match.bestScore >= 0.6) {
            const matched = allFaqs.find(f => f.question === match.bestMatchText);
            const resp = matched?.answer || "Sorry, couldn't fetch.";
            await logChat({ query: userQuery, response: resp, intent, matchedQuestion: matched.question, matchSource: "faq-fuzzy", similarity: match.bestScore });
            return res.json(sendResponse(resp));
          }
        }
      } catch (err) {
        console.warn("⚠️ FAQ lookup failed:", err.message);
      }

      // 2️⃣ Google Sheets
      try {
        const sheetData = await getSheetData();
        if (sheetData?.length > 0) {
          const qs = sheetData.filter(r => r.Question).map(r => r.Question);
          const match = fuzzyBestMatch(userQuery, qs);
          if (match && match.bestScore >= 0.6) {
            const row = sheetData.find(r => r.Question === match.bestMatchText);
            const resp = row.Answer || row.answer;
            await logChat({ query: userQuery, response: resp, intent, matchedQuestion: row.Question, matchSource: "sheet-fuzzy", similarity: match.bestScore });
            return res.json(sendResponse(resp));
          }
        }
      } catch (err) {
        console.warn("⚠️ Sheets lookup failed:", err.message);
      }

      // 3️⃣ Hardcoded
      const hardcodedFaqs = {
        "what is sih": "💡 *SIH (Smart India Hackathon)* is a nationwide initiative by MHRD.",
        "who are you": "🤖 I am your Student Support Assistant, here to guide you in Finance, Mentorship, Counseling, and Marketplace.",
      };
      const hcMatch = fuzzyBestMatch(userQuery.toLowerCase(), Object.keys(hardcodedFaqs));
      if (hcMatch && hcMatch.bestScore >= 0.6) {
        const resp = hardcodedFaqs[hcMatch.bestMatchText];
        await logChat({ query: userQuery, response: resp, intent, matchedQuestion: hcMatch.bestMatchText, matchSource: "hardcoded-fuzzy", similarity: hcMatch.bestScore });
        return res.json(sendResponse(resp));
      }

      // Final fallback
      const finalResp = "🙏 Sorry, I couldn’t find an exact answer. But I can guide you in Finance, Mentorship, Counseling, or Marketplace.";
      await logChat({ query: userQuery, response: finalResp, intent });
      return res.json(sendResponse(finalResp));
    }

    // Default catch
    const unknownResp = "I can guide you in Finance, Mentorship, Counseling, or Marketplace.";
    await logChat({ query: req.body.queryResult.queryText || "", response: unknownResp, intent });
    return res.json(sendResponse(unknownResp));

  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    const resp = "⚠️ Something went wrong while processing your request.";
    await logChat({ query: req.body.queryResult?.queryText || "", response: resp, intent });
    return res.json(sendResponse(resp));
  }
});

// ------------------ Seeder, Badge, Reminder, ChatLogs, Cron Jobs ------------------
// (keep same as your previous file – unchanged)

// ------------------ Start Server ------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
