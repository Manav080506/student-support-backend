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

// Log chat attempts
async function logChat({ query, response, intent, matchedQuestion = null, matchSource = "none", similarity = 0 }) {
  try {
    await ChatLog.create({ query, response, intent, matchedQuestion, matchSource, similarity });
  } catch (err) {
    console.error("❌ ChatLog save error:", err.message);
  }
}

// Fuzzy match helper
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
    // ------------------ Finance ------------------
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

    // ------------------ Parent Status ------------------
    if (intent === "ParentStatusIntent") {
      const parentId = params.parentId?.[0];
      if (!parentId) {
        const resp = "Please provide your Parent ID (e.g., PARENT001).";
        await logChat({ query: req.body.queryResult.queryText || "", response: resp, intent });
        return res.json(sendResponse(resp));
      }

      const parent = parents[parentId];
      if (!parent) {
        const resp = "⚠️ I couldn’t find details for that parent ID.";
        await logChat({ query: req.body.queryResult.queryText || "", response: resp, intent });
        return res.json(sendResponse(resp));
      }

      try {
        await Badge.create({ studentId: parentId, badgeName: "Engaged Parent", reason: "Viewed child dashboard" });
      } catch (e) {
        console.warn("⚠️ Badge create failed:", e.message);
      }

      const resp = `👨‍👩‍👦 *Parent Dashboard*\nParent ID: ${parentId}\nChild: ${parent.child}\n\n📊 Attendance: ${parent.attendance}\n📝 Marks: ${parent.marks}\n💰 Fees Pending: ₹${parent.feesPending}\n\n👉 Options:\n1️⃣ View Scholarship Updates\n2️⃣ View Upcoming Deadlines`;
      await logChat({ query: req.body.queryResult.queryText || "", response: resp, intent, matchedQuestion: "ParentDashboard", matchSource: "database", similarity: 1 });

      return res.json(sendResponse(resp));
    }

    // ------------------ Mentor Status ------------------
    if (intent === "MentorStatusIntent") {
      const mentorId = params.mentorId?.[0];
      if (!mentorId) {
        const resp = "Please provide your Mentor ID (e.g., MENTOR001).";
        await logChat({ query: req.body.queryResult.queryText || "", response: resp, intent });
        return res.json(sendResponse(resp));
      }

      const mentor = mentors[mentorId];
      if (!mentor) {
        const resp = "⚠️ I couldn’t find details for that mentor ID.";
        await logChat({ query: req.body.queryResult.queryText || "", response: resp, intent });
        return res.json(sendResponse(resp));
      }

      try {
        await Badge.create({ studentId: mentorId, badgeName: "Active Mentor", reason: "Reviewed mentees" });
      } catch (e) {
        console.warn("⚠️ Badge create failed:", e.message);
      }

      const resp = `👨‍🏫 *Mentor Dashboard*\nMentor ID: ${mentorId}\n\n📋 Assigned Mentees:\n${mentor.mentees.join(", ")}\n\n👉 Options:\n1️⃣ Show Performance Summary\n2️⃣ Send Message to Mentees`;
      await logChat({ query: req.body.queryResult.queryText || "", response: resp, intent, matchedQuestion: "MentorDashboard", matchSource: "database", similarity: 1 });

      return res.json(sendResponse(resp));
    }

    // ------------------ Counseling ------------------
    if (intent === "CounselingIntent") {
      try {
        await Badge.create({ studentId: "GENERIC", badgeName: "Wellbeing Seeker", reason: "Asked for counseling" });
      } catch (e) {
        console.warn("⚠️ Badge create failed:", e.message);
      }

      const resp = `🧠 *Counseling Support*\nI understand you’re seeking guidance.\n✔ A counselor will be notified to contact you.\n✔ Meanwhile, here are self-help resources:\n- Breathing exercises\n- Study-life balance guide\n\n👉 Options:\n1️⃣ Connect to Counselor\n2️⃣ Show Self-Help Resources`;
      await logChat({ query: req.body.queryResult.queryText || "", response: resp, intent, matchedQuestion: "Counseling", matchSource: "database", similarity: 1 });

      return res.json(sendResponse(resp));
    }

    // ------------------ Distress ------------------
    if (intent === "DistressIntent") {
      const resp = `🚨 *Distress Alert*\nI sense you’re in distress. You are not alone.\n✔ A counselor has been notified to contact you immediately.\n✔ If it’s urgent, please call the helpline: 📞 1800-599-0019\n\n👉 Options:\n1️⃣ Connect to Counselor Now\n2️⃣ Get Relaxation Resources`;
      await logChat({ query: req.body.queryResult.queryText || "", response: resp, intent, matchedQuestion: "Distress", matchSource: "database", similarity: 1 });
      return res.json(sendResponse(resp));
    }

    // ------------------ Marketplace ------------------
    if (intent === "MarketplaceIntent") {
      try {
        await Badge.create({ studentId: "GENERIC", badgeName: "Marketplace Explorer", reason: "Browsed marketplace" });
      } catch (e) {
        console.warn("⚠️ Badge create failed:", e.message);
      }

      const resp = `🛒 *Marketplace Listings*\nHere are some items available right now:\n- 📚 Used Textbooks (CS, Mechanical, Commerce)\n- 🧮 Calculators\n- 🛏 Hostel Essentials\n- 💻 Laptops (second-hand)\n\n👉 Options:\n1️⃣ See Latest Listings\n2️⃣ Post an Item for Sale`;
      await logChat({ query: req.body.queryResult.queryText || "", response: resp, intent, matchedQuestion: "Marketplace", matchSource: "database", similarity: 1 });

      return res.json(sendResponse(resp));
    }

    // ------------------ Mentorship ------------------
    if (intent === "MentorshipIntent") {
      try {
        await Badge.create({ studentId: "GENERIC", badgeName: "Mentorship Seeker", reason: "Requested mentor" });
      } catch (e) {
        console.warn("⚠️ Badge create failed:", e.message);
      }

      const resp = `👨‍🏫 *Mentorship Available*\nWe have mentors in the following fields:\n- 💻 Computer Science\n- ⚙️ Mechanical Engineering\n- 📊 Commerce\n- 🤖 Artificial Intelligence / Data Science\n\n👉 Options:\n1️⃣ Connect to a Mentor\n2️⃣ View Mentor Profiles`;
      await logChat({ query: req.body.queryResult.queryText || "", response: resp, intent, matchedQuestion: "Mentorship", matchSource: "database", similarity: 1 });

      return res.json(sendResponse(resp));
    }

    // ------------------ Reminder Intent ------------------
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

    // ------------------ Fallback (with fuzzy + sentiment) ------------------
    if (intent === "Default Fallback Intent") {
      const userQuery = (req.body.queryResult.queryText || "").trim();

      if (!userQuery) {
        const resp = "I didn't get that. Can you say it again?";
        await logChat({ query: userQuery, response: resp, intent });
        return res.json(sendResponse(resp));
      }

      // Sentiment
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

      // 1️⃣ FAQ DB (regex + fuzzy)
      try {
        const faq = await Faq.findOne({ question: new RegExp(userQuery, "i") });
        if (faq) {
          const resp = faq.answer;
          await logChat({ query: userQuery, response: resp, intent, matchedQuestion: faq.question, matchSource: "faq", similarity: 1 });
          return res.json(sendResponse(resp));
        }
        const allFaqs = await Faq.find({}, { question: 1, answer: 1 }).lean();
        if (allFaqs.length > 0) {
          const qList = allFaqs.map(f => f.question);
          const match = fuzzyBestMatch(userQuery, qList);
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

      // 2️⃣ Google Sheet fuzzy
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

      // 3️⃣ Hardcoded (fuzzy)
      const hardcodedFaqs = {
        "what is sih": "💡 *SIH (Smart India Hackathon)* is a nationwide initiative by MHRD.",
        "who are you": "🤖 I am your Student Support Assistant, here to guide you in Finance, Mentorship, Counseling, and Marketplace.",
      };
      const keys = Object.keys(hardcodedFaqs);
      const hcMatch = fuzzyBestMatch(userQuery.toLowerCase(), keys);
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

    // default
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

// … (Seeder, Badge, Reminder, ChatLogs, Cron, Server start unchanged)
