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

// ------------------ Root health check ------------------
app.get("/", (req, res) => {
  res.send("✅ Student Support Backend is running with 💡 + 🌟 affirmations!");
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

// ------------------ Affirmations ------------------
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

function getAffirmation() {
  return affirmations[Math.floor(Math.random() * affirmations.length)];
}

// ------------------ Helpers ------------------
function sendResponse(text) {
  return { fulfillmentText: text, fulfillmentMessages: [{ text: { text: [text] } }] };
}

async function logChat({ query, response, intent, matchedQuestion = null, matchSource = "none", similarity = 0 }) {
  try {
    await ChatLog.create({ query, response, intent, matchedQuestion, matchSource, similarity, createdAt: new Date() });
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

// ------------------ Webhook ------------------
app.post("/webhook", async (req, res) => {
  const intent = req.body.queryResult?.intent?.displayName || "unknown";
  const params = req.body.queryResult?.parameters || {};
  const userQueryRaw = req.body.queryResult?.queryText || "";

  try {
    // ---- FinanceIntent ----
    if (intent === "FinanceIntent") {
      const studentId = params.studentId?.[0] || params.userID || (Array.isArray(params.userID) && params.userID[0]);
      if (!studentId) return res.json(sendResponse("Please provide your Student ID (e.g., STU001)."));

      const student = students[studentId];
      if (!student) return res.json(sendResponse("⚠️ I couldn’t find details for that student ID."));

      const resp = `💰 *Finance Summary*\n- Student: ${student.name}\n- Pending Fees: ₹${student.feesPending}\n- Scholarships: ${student.scholarships.join(", ")}\n\n${getAffirmation()}\n\n👉 Options:\n1️⃣ Show Eligible Scholarships\n2️⃣ Show Fee Deadlines`;
      return res.json(sendResponse(resp));
    }

    // ---- ParentStatusIntent ----
    if (intent === "ParentStatusIntent") {
      const parentId = params.parentId?.[0];
      if (!parentId) return res.json(sendResponse("Please provide your Parent ID (e.g., PARENT001)."));

      const parent = parents[parentId];
      if (!parent) return res.json(sendResponse("⚠️ I couldn’t find details for that parent ID."));

      const resp = `👨‍👩‍👦 *Parent Dashboard*\nChild: ${parent.child}\n📊 Attendance: ${parent.attendance}\n📝 Marks: ${parent.marks}\n💰 Fees Pending: ₹${parent.feesPending}\n\n${getAffirmation()}`;
      return res.json(sendResponse(resp));
    }

    // ---- MentorStatusIntent ----
    if (intent === "MentorStatusIntent") {
      const mentorId = params.mentorId?.[0];
      if (!mentorId) return res.json(sendResponse("Please provide your Mentor ID (e.g., MENTOR001)."));

      const mentor = mentors[mentorId];
      if (!mentor) return res.json(sendResponse("⚠️ I couldn’t find details for that mentor ID."));

      const resp = `👨‍🏫 *Mentor Dashboard*\nMentees: ${mentor.mentees.join(", ")}\n\n${getAffirmation()}`;
      return res.json(sendResponse(resp));
    }

    // ---- CounselingIntent ----
    if (intent === "CounselingIntent") {
      const resp = `🧠 *Counseling Support*\n✔ A counselor will be notified.\n✔ Self-help: Breathing exercises, study-life balance.\n\n${getAffirmation()}`;
      return res.json(sendResponse(resp));
    }

    // ---- DistressIntent ----
    if (intent === "DistressIntent") {
      const resp = `🚨 *Distress Alert*\nYou are not alone.\n✔ A counselor has been notified.\n✔ Helpline: 📞 1800-599-0019\n\n${getAffirmation()}`;
      return res.json(sendResponse(resp));
    }

    // ---- MarketplaceIntent ----
    if (intent === "MarketplaceIntent") {
      const resp = `🛒 *Marketplace Listings*\n- 📚 Used Textbooks\n- 🧮 Calculators\n- 🛏 Hostel Essentials\n- 💻 Laptops\n\n${getAffirmation()}`;
      return res.json(sendResponse(resp));
    }

    // ---- MentorshipIntent ----
    if (intent === "MentorshipIntent") {
      const resp = `👨‍🏫 *Mentorship Available*\n- 💻 Computer Science\n- ⚙️ Mechanical\n- 📊 Commerce\n- 🤖 AI/DS\n\n${getAffirmation()}`;
      return res.json(sendResponse(resp));
    }

    // ---- ReminderIntent ----
    if (intent === "ReminderIntent") {
      const userId = params.studentId?.[0] || params.parentId?.[0] || params.mentorId?.[0] || params.userID || "GENERIC";
      const reminders = await Reminder.find({ targetId: { $in: [userId, "GENERIC"] } }).sort({ createdAt: -1 }).limit(5).lean();

      const resp = reminders.length
        ? `📌 *Your Latest Reminders:*\n${reminders.map((r, i) => `${i + 1}. ${r.message}`).join("\n")}\n\n${getAffirmation()}`
        : "📭 You have no reminders at the moment.\n\n" + getAffirmation();
      return res.json(sendResponse(resp));
    }

    // ---- Default Fallback ----
    if (intent === "Default Fallback Intent") {
      const userQuery = userQueryRaw.trim();
      if (!userQuery) return res.json(sendResponse("I didn't get that. Can you say it again? " + getAffirmation()));

      // Synonym dictionary
      const synonyms = {
        counseling: ["counseling", "therapy", "guidance", "help", "talk to someone"],
        distress: ["distress", "depressed", "anxious", "panic", "sad", "lonely", "overwhelmed"],
      };

      const lowerQ = userQuery.toLowerCase();
      if (synonyms.counseling.some((w) => lowerQ.includes(w))) {
        return res.json(sendResponse("🧠 It seems you’d like counseling. I can connect you. " + getAffirmation()));
      }
      if (synonyms.distress.some((w) => lowerQ.includes(w))) {
        return res.json(sendResponse("🚨 I sense distress. Please don’t hesitate to reach out or call 📞 1800-599-0019. " + getAffirmation()));
      }

      return res.json(sendResponse("🙏 Sorry, I couldn’t find an exact answer. But I can guide you in Finance, Mentorship, Counseling, or Marketplace.\n\n" + getAffirmation()));
    }

    return res.json(sendResponse("I can guide you in Finance, Mentorship, Counseling, or Marketplace. " + getAffirmation()));
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    return res.json(sendResponse("⚠️ Something went wrong. " + getAffirmation()));
  }
});

// ------------------ Seeder Routes ------------------
app.get("/seed-faqs", async (req, res) => {
  try {
    const faqs = [
      { category: "General", question: "What is SIH", answer: "💡 SIH (Smart India Hackathon) is a nationwide initiative by MHRD. " + getAffirmation() },
      { category: "General", question: "Who are you", answer: "🤖 I am your Student Support Assistant, here to guide you. " + getAffirmation() },
      { category: "Finance", question: "What scholarships are available", answer: "🎓 Scholarships are available for CS, Mechanical, and Commerce students. " + getAffirmation() },
      { category: "Counseling", question: "I feel anxious about exams", answer: "🧠 Anxiety is normal during exams. " + getAffirmation() },
      { category: "Distress", question: "I feel depressed", answer: "🚨 You are not alone. Please reach out or call 📞 1800-599-0019. " + getAffirmation() },
    ];
    await Faq.deleteMany({});
    await Faq.insertMany(faqs);
    res.json({ message: "✅ FAQs seeded with affirmations!", faqs });
  } catch (err) {
    res.status(500).json({ error: "Seeder failed" });
  }
});

// ------------------ Start Server ------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT} with 🌟 affirmations`));
