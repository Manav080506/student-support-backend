// server.js
import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import Faq from "./models/Faq.js";
import { getSheetAnswer } from "./sheets.js";
import { Student, Parent, Mentor } from "./db.js";

const app = express();
app.use(bodyParser.json());

// MongoDB connect
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ Mongo error:", err.message));

function sendResponse(text) {
  return {
    fulfillmentText: text,
    fulfillmentMessages: [{ text: { text: [text] } }],
  };
}

app.post("/webhook", async (req, res) => {
  const intent = req.body.queryResult.intent.displayName;
  const params = req.body.queryResult.parameters;
  const queryText = req.body.queryResult.queryText;

  // ---------------- Finance ----------------
  if (intent === "FinanceIntent") {
    const studentId = params.studentId?.[0];
    if (!studentId) return res.json(sendResponse("Please provide your Student ID (e.g., STU001)."));

    const student = await Student.findOne({ studentId });
    if (!student) return res.json(sendResponse("⚠️ I couldn’t find details for that student ID."));

    return res.json(sendResponse(
      `💰 *Finance Summary*\n- Student: ${student.name}\n- Pending Fees: ₹${student.feesPending}\n- Scholarships: ${student.scholarships.join(", ")}`
    ));
  }

  // ---------------- Parent Status ----------------
  if (intent === "ParentStatusIntent") {
    const parentId = params.parentId?.[0];
    if (!parentId) return res.json(sendResponse("Please provide your Parent ID (e.g., PARENT001)."));

    const parent = await Parent.findOne({ parentId });
    if (!parent) return res.json(sendResponse("⚠️ I couldn’t find details for that parent ID."));

    return res.json(sendResponse(
      `👨‍👩‍👦 *Parent Dashboard*\nChild: ${parent.child}\n📊 Attendance: ${parent.attendance}\n📝 Marks: ${parent.marks}\n💰 Fees Pending: ₹${parent.feesPending}`
    ));
  }

  // ---------------- Mentor Status ----------------
  if (intent === "MentorStatusIntent") {
    const mentorId = params.mentorId?.[0];
    if (!mentorId) return res.json(sendResponse("Please provide your Mentor ID (e.g., MENTOR001)."));

    const mentor = await Mentor.findOne({ mentorId });
    if (!mentor) return res.json(sendResponse("⚠️ I couldn’t find details for that mentor ID."));

    return res.json(sendResponse(
      `👨‍🏫 *Mentor Dashboard*\nMentees: ${mentor.mentees.join(", ")}`
    ));
  }

  // ---------------- Counseling ----------------
  if (intent === "CounselingIntent") {
    return res.json(sendResponse("🧠 Counseling support available. Options:\n1️⃣ Connect to Counselor\n2️⃣ Show Self-Help Resources"));
  }

  // ---------------- Distress ----------------
  if (intent === "DistressIntent") {
    return res.json(sendResponse("🚨 Distress Alert! A counselor has been notified. Call 📞 1800-599-0019 immediately if urgent."));
  }

  // ---------------- Marketplace ----------------
  if (intent === "MarketplaceIntent") {
    return res.json(sendResponse("🛒 Marketplace: Books, Calculators, Hostel Essentials, Laptops available."));
  }

  // ---------------- Mentorship ----------------
  if (intent === "MentorshipIntent") {
    return res.json(sendResponse("👨‍🏫 Mentorship available in CS, Mechanical, Commerce, AI/Data Science."));
  }

  // ---------------- Fallback Layer ----------------
  // Try Google Sheets
  const sheetAnswer = await getSheetAnswer(queryText);
  if (sheetAnswer) return res.json(sendResponse(sheetAnswer));

  // Try FAQ
  const faqAnswer = getFaqAnswer(queryText);
  if (faqAnswer) return res.json(sendResponse(faqAnswer));

  // Final fallback
  return res.json(sendResponse("I can guide you in Finance, Mentorship, Counseling, or Marketplace."));
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

