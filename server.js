// server.js (ES module)
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import Faq from "./models/Faq.js";
import Student from "./models/Student.js";
import { initSheet, getCachedSheetFaqs, refreshSheetCache } from "./utils/sheets-simple.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Optional webhook secret verification helper
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || null;

// -------------------- MongoDB --------------------
const mongoURI = process.env.MONGODB_URI;
if (!mongoURI) {
  console.warn("MONGODB_URI not set. DB operations will fail.");
} else {
  mongoose.connect(mongoURI, { autoIndex: true })
    .then(() => console.log("✅ MongoDB connected"))
    .catch(err => console.error("❌ MongoDB connection error:", err.message));
}

// -------------------- Sheets --------------------
initSheet();
// Refresh sheet cache every 5 minutes (adjust if you like)
setInterval(() => {
  refreshSheetCache().catch(e => console.warn("Sheet refresh failed:", e.message));
}, 1000 * 60 * 5);

// -------------------- Hardcoded FAQs (fast fallback) --------------------
const HARDCODED_FAQS = [
  { q: "what is sih", a: "SIH stands for Smart India Hackathon." },
  { q: "who are you", a: "I am the Student Support Chatbot — here to help with fees, mentorship, counseling and marketplace." },
  // add more phrases & answers here
];

// -------------------- Small helper for responses --------------------
function sendResponseText(text) {
  return {
    fulfillmentText: text,
    fulfillmentMessages: [{ text: { text: [text] } }],
  };
}

function matchHardcoded(query) {
  const q = query.toLowerCase();
  for (const entry of HARDCODED_FAQS) {
    if (q.includes(entry.q.toLowerCase())) return entry.a;
  }
  return null;
}

function matchSheetFaqs(query) {
  const q = query.toLowerCase();
  const faqs = getCachedSheetFaqs();
  for (const f of faqs) {
    if (!f.question) continue;
    if (q.includes(f.question.toLowerCase()) || f.question.toLowerCase().includes(q)) {
      return f.answer;
    }
  }
  return null;
}

// Basic fuzzy DB search
async function matchDbFaq(query) {
  if (!query) return null;
  try {
    // try exact-ish
    const doc = await Faq.findOne({ question: { $regex: query, $options: "i" } }).lean();
    if (doc) return doc.answer;
    // fallback: look for keywords in question text (simple)
    const parts = query.split(/\s+/).slice(0, 6);
    const regex = parts.map(p => `(?=.*${p})`).join("") + ".*";
    const doc2 = await Faq.findOne({ question: { $regex: regex, $options: "i" } }).lean();
    return doc2 ? doc2.answer : null;
  } catch (e) {
    console.warn("DB FAQ search error:", e.message);
    return null;
  }
}

// -------------------- Webhook (Dialogflow) --------------------
app.post("/webhook", async (req, res) => {
  try {
    // optional: simple secret check
    if (WEBHOOK_SECRET) {
      const incoming = req.header("X-WEBHOOK-SECRET");
      if (!incoming || incoming !== WEBHOOK_SECRET) {
        return res.status(403).json(sendResponseText("Forbidden"));
      }
    }

    const body = req.body;
    const intentName = body?.queryResult?.intent?.displayName || "";
    const userQuery = (body?.queryResult?.queryText || "").trim();
    const params = body?.queryResult?.parameters || {};

    // ---------- FinanceIntent ----------
    if (intentName === "FinanceIntent" || intentName === "finance.check") {
      const sid = (params.studentId && params.studentId[0]) || params.studentId || params.student_id || null;
      if (!sid) {
        return res.json(sendResponseText("Please provide your Student ID (e.g., STU001)."));
      }
      const student = await Student.findOne({ studentId: sid }).lean();
      if (!student) {
        return res.json(sendResponseText("⚠️ I couldn’t find fee details for this student."));
      }
      const msg = `💰 Finance Summary\n- Student: ${student.name}\n- Pending Fees: ₹${student.feesPending}\n- Scholarships: ${student.scholarships?.join(", ") || "None"}\n\nOptions: 1) Show Scholarships 2) Show Deadlines`;
      return res.json(sendResponseText(msg));
    }

    // ---------- CounselingIntent ----------
    if (intentName === "CounselingIntent" || intentName === "counseling.connect") {
      return res.json(sendResponseText("🧠 Counseling: A counselor will be notified. Meanwhile, try breathing exercises and the study-life balance guide."));
    }

    // ---------- DistressIntent ----------
    if (intentName === "DistressIntent" || intentName === "distress.alert") {
      // You can log to DB here for follow-up
      console.log("🚨 Distress alert:", { query: userQuery, params });
      return res.json(sendResponseText("🚨 I sense you’re in distress. A counselor will contact you ASAP. If it's urgent call: 1800-599-0019."));
    }

    // ---------- MarketplaceIntent ----------
    if (intentName === "MarketplaceIntent" || intentName === "marketplace.handle") {
      return res.json(sendResponseText("🛒 Marketplace: Used textbooks, calculators, hostel essentials, and laptops (second-hand). Would you like to see listings or post an item?"));
    }

    // ---------- MentorshipIntent ----------
    if (intentName === "MentorshipIntent" || intentName === "mentor.connect") {
      return res.json(sendResponseText("👨‍🏫 Mentorship: We have mentors in Computer Science, Mechanical, Commerce, and AI. Which field do you want?"));
    }

    // ---------- Parent & Mentor status intents (examples) ----------
    if (intentName === "ParentStatusIntent" || intentName === "parent.status.check") {
      const pid = (params.parentId && params.parentId[0]) || params.parentId || null;
      if (!pid) return res.json(sendResponseText("Please provide your Parent ID (e.g., PARENT001)."));
      // Example fetch - user should have Parent model; this is placeholder
      // Here we reply with an example; you should replace with real DB fetch
      return res.json(sendResponseText(`👨‍👩‍👦 Parent Dashboard for ${pid}: Attendance: 85%, Marks: 80%, Fees Pending: ₹5000`));
    }

    if (intentName === "MentorStatusIntent" || intentName === "mentor.status.check") {
      const mid = (params.mentorId && params.mentorId[0]) || params.mentorId || null;
      if (!mid) return res.json(sendResponseText("Please provide your Mentor ID (e.g., MENTOR001)."));
      return res.json(sendResponseText(`👨‍🏫 Mentor Dashboard for ${mid}: Assigned mentees: STU001, STU002`));
    }

    // ---------- Fallback / Unknown intent (three-layered) ----------
    // Try hardcoded -> sheet cache -> mongo faq -> default
    // 1) Hardcoded
    const hard = matchHardcoded(userQuery);
    if (hard) return res.json(sendResponseText(hard));

    // 2) Google Sheets cached FAQs
    const sheetAns = matchSheetFaqs(userQuery);
    if (sheetAns) return res.json(sendResponseText(sheetAns));

    // 3) MongoDB FAQs
    const dbAns = await matchDbFaq(userQuery);
    if (dbAns) return res.json(sendResponseText(dbAns));

    // Default fallback
    return res.json(sendResponseText("Sorry, I didn’t understand. I can help with Finance, Mentorship, Counseling, Marketplace. Can you rephrase?"));

  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json(sendResponseText("Server error in webhook."));
  }
});

// simple health
app.get("/", (req, res) => res.send("Student Support Backend running."));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

