// server.js
import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import cron from "node-cron";

import Faq from "./models/Faq.js";
import Badge from "./models/Badge.js";
import BadgeMeta from "./models/BadgeMeta.js";
import Reminder from "./models/Reminder.js";
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

// ------------------ Helper ------------------
function sendResponse(text) {
  return { fulfillmentText: text, fulfillmentMessages: [{ text: { text: [text] } }] };
}

// ------------------ Webhook ------------------
app.post("/webhook", async (req, res) => {
  const intent = req.body.queryResult.intent.displayName;
  const params = req.body.queryResult.parameters;

  try {
    // ------------------ Finance ------------------
    if (intent === "FinanceIntent") {
      const studentId = params.studentId?.[0];
      if (!studentId) return res.json(sendResponse("Please provide your Student ID (e.g., STU001)."));

      const student = students[studentId];
      if (!student) return res.json(sendResponse("⚠️ I couldn’t find details for that student ID."));

      await Badge.create({ studentId, badgeName: "Finance Explorer", reason: "Checked finance summary" });

      return res.json(
        sendResponse(
          `💰 *Finance Summary*\n- Student: ${student.name}\n- Pending Fees: ₹${student.feesPending}\n- Scholarships: ${student.scholarships.join(", ")}\n\n👉 Options:\n1️⃣ Show Eligible Scholarships\n2️⃣ Show Fee Deadlines`
        )
      );
    }

    // ------------------ Parent Status ------------------
    if (intent === "ParentStatusIntent") {
      const parentId = params.parentId?.[0];
      if (!parentId) return res.json(sendResponse("Please provide your Parent ID (e.g., PARENT001)."));

      const parent = parents[parentId];
      if (!parent) return res.json(sendResponse("⚠️ I couldn’t find details for that parent ID."));

      await Badge.create({ studentId: parentId, badgeName: "Engaged Parent", reason: "Viewed child dashboard" });

      return res.json(
        sendResponse(
          `👨‍👩‍👦 *Parent Dashboard*\nParent ID: ${parentId}\nChild: ${parent.child}\n\n📊 Attendance: ${parent.attendance}\n📝 Marks: ${parent.marks}\n💰 Fees Pending: ₹${parent.feesPending}\n\n👉 Options:\n1️⃣ View Scholarship Updates\n2️⃣ View Upcoming Deadlines`
        )
      );
    }

    // ------------------ Mentor Status ------------------
    if (intent === "MentorStatusIntent") {
      const mentorId = params.mentorId?.[0];
      if (!mentorId) return res.json(sendResponse("Please provide your Mentor ID (e.g., MENTOR001)."));

      const mentor = mentors[mentorId];
      if (!mentor) return res.json(sendResponse("⚠️ I couldn’t find details for that mentor ID."));

      await Badge.create({ studentId: mentorId, badgeName: "Active Mentor", reason: "Reviewed mentees" });

      return res.json(
        sendResponse(
          `👨‍🏫 *Mentor Dashboard*\nMentor ID: ${mentorId}\n\n📋 Assigned Mentees:\n${mentor.mentees.join(", ")}\n\n👉 Options:\n1️⃣ Show Performance Summary\n2️⃣ Send Message to Mentees`
        )
      );
    }

    // ------------------ Counseling ------------------
    if (intent === "CounselingIntent") {
      await Badge.create({ studentId: "GENERIC", badgeName: "Wellbeing Seeker", reason: "Asked for counseling" });

      return res.json(
        sendResponse(
          `🧠 *Counseling Support*\nI understand you’re seeking guidance.\n✔ A counselor will be notified to contact you.\n✔ Meanwhile, here are self-help resources:\n- Stress management tips\n- Study-life balance guide\n\n👉 Options:\n1️⃣ Connect to Counselor\n2️⃣ Show Self-Help Resources`
        )
      );
    }

    // ------------------ Distress ------------------
    if (intent === "DistressIntent") {
      return res.json(
        sendResponse(
          `🚨 *Distress Alert*\nI sense you’re in distress. You are not alone.\n✔ A counselor has been notified to contact you immediately.\n✔ If it’s urgent, please call the helpline: 📞 1800-599-0019\n\n👉 Options:\n1️⃣ Connect to Counselor Now\n2️⃣ Get Relaxation Resources`
        )
      );
    }

    // ------------------ Marketplace ------------------
    if (intent === "MarketplaceIntent") {
      await Badge.create({ studentId: "GENERIC", badgeName: "Marketplace Explorer", reason: "Browsed marketplace" });

      return res.json(
        sendResponse(
          `🛒 *Marketplace Listings*\nHere are some items available right now:\n- 📚 Used Textbooks (CS, Mechanical, Commerce)\n- 🧮 Calculators\n- 🛏 Hostel Essentials\n- 💻 Laptops (second-hand)\n\n👉 Options:\n1️⃣ See Latest Listings\n2️⃣ Post an Item for Sale`
        )
      );
    }

    // ------------------ Mentorship ------------------
    if (intent === "MentorshipIntent") {
      await Badge.create({ studentId: "GENERIC", badgeName: "Mentorship Seeker", reason: "Requested mentor" });

      return res.json(
        sendResponse(
          `👨‍🏫 *Mentorship Available*\nWe have mentors in the following fields:\n- 💻 Computer Science\n- ⚙️ Mechanical Engineering\n- 📊 Commerce\n- 🤖 Artificial Intelligence / Data Science\n\n👉 Options:\n1️⃣ Connect to a Mentor\n2️⃣ View Mentor Profiles`
        )
      );
    }

    // ------------------ Reminder Intent ------------------
    if (intent === "ReminderIntent") {
      const userId = params.studentId?.[0] || params.parentId?.[0] || params.mentorId?.[0] || "GENERIC";
      const reminders = await Reminder.find({ targetId: { $in: [userId, "GENERIC"] } })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

      if (reminders.length === 0) {
        return res.json(sendResponse("📭 You have no reminders at the moment."));
      }

      const reminderText = reminders.map((r, i) => `${i + 1}. ${r.message}`).join("\n");
      return res.json(sendResponse(`📌 *Your Latest Reminders:*\n${reminderText}`));
    }

    // ------------------ Fallback with Multi-Layer + Sentiment ------------------
    if (intent === "Default Fallback Intent") {
      const userQuery = req.body.queryResult.queryText;

      // 🧠 1️⃣ Sentiment Detection
      const Sentiment = (await import("sentiment")).default;
      const sentiment = new Sentiment();
      const result = sentiment.analyze(userQuery);

      if (result.score < -2) {
        return res.json(
          sendResponse(
            `😔 I sense you’re feeling low. You’re not alone.\n✔ Would you like me to connect you to a counselor?\n✔ Here are some quick self-help resources while you wait:\n- Breathing exercises\n- Stress management tips`
          )
        );
      }

      if (result.score > 2) {
        return res.json(
          sendResponse(
            `😊 That’s great to hear! Keep up the positive energy.\n✔ Would you like me to suggest some productive activities or resources to use this energy well?`
          )
        );
      }

      // 2️⃣ Check MongoDB FAQs
      const faq = await Faq.findOne({ question: new RegExp(userQuery, "i") });
      if (faq) return res.json(sendResponse(faq.answer));

      // 3️⃣ Check Google Sheets
      const sheetData = await getSheetData();
      const sheetFaq = sheetData.find(
        (row) => row.Question && userQuery.toLowerCase().includes(row.Question.toLowerCase())
      );
      if (sheetFaq) return res.json(sendResponse(sheetFaq.Answer));

      // 4️⃣ Hardcoded fallback
      const hardcodedFaqs = {
        "what is sih": "💡 *SIH (Smart India Hackathon)* is a nationwide initiative by MHRD...",
        "who are you": "🤖 I am your Student Support Assistant, here to guide you...",
      };
      const lowerQ = userQuery.toLowerCase();
      if (hardcodedFaqs[lowerQ]) return res.json(sendResponse(hardcodedFaqs[lowerQ]));

      // 5️⃣ Final fallback
      return res.json(
        sendResponse(
          "🙏 Sorry, I couldn’t find an exact answer. But I can guide you in Finance, Mentorship, Counseling, or Marketplace."
        )
      );
    }
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    res.json(sendResponse("⚠️ Something went wrong while processing your request."));
  }
});

// ------------------ Seeder, Badge, Reminder APIs + Cron (same as before) ------------------
// (Keep your existing /seed-faqs, /seed-badge-meta, /award-badge, /badges/:id, /reminders/:id, and cron jobs here)

// ------------------ Start Server ------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
