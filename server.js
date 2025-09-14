// server.js
import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

import Faq from "./models/Faq.js";
import Badge from "./models/Badge.js";
import { getSheetData } from "./utils/sheets.js";

dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(cors());

// ------------------ MongoDB Connection ------------------
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/student-support";
mongoose
  .connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ------------------ Dummy Database ------------------
const students = {
  STU001: { name: "Manav Runthala", feesPending: 5000, scholarships: ["Computer Science"], lastFeeDate: "2025-03-15" },
  STU002: { name: "Daksh Beniwal", feesPending: 3000, scholarships: ["Mechanical Engineering"], lastFeeDate: "2025-02-20" },
  STU003: { name: "Disha Binani", feesPending: 0, scholarships: ["Commerce"], lastFeeDate: "2025-01-10" }
};

const parents = {
  PARENT001: { child: "Manav Runthala", attendance: "85%", marks: "80%", feesPending: 5000 }
};

const mentors = {
  MENTOR001: { mentees: ["STU001", "STU002"] }
};

// ------------------ Helper ------------------
function sendResponse(text) {
  return { fulfillmentText: text, fulfillmentMessages: [{ text: { text: [text] } }] };
}

// Award badge helper (ensures no duplicate)
async function awardBadgeIfNotExists(studentId, badgeName, reason = "") {
  if (!studentId) return null;
  const existing = await Badge.findOne({ studentId, badgeName });
  if (existing) return existing;
  const b = await Badge.create({ studentId, badgeName, reason });
  return b;
}

// ------------------ Webhook ------------------
app.post("/webhook", async (req, res) => {
  const intent = req.body.queryResult?.intent?.displayName || "";
  const params = req.body.queryResult?.parameters || {};

  try {
    // ------------------ FinanceIntent ------------------
    if (intent === "FinanceIntent") {
      const studentId = params.studentId?.[0];

      // If no studentId provided, return general scholarships and prompt.
      if (!studentId) {
        return res.json(
          sendResponse(
            "🎓 Scholarships available right now:\n- Computer Science\n- Mechanical Engineering\n- Commerce\n\n👉 Provide your Student ID (e.g., STU001) to check personalized fees and scholarships."
          )
        );
      }

      const student = students[studentId];
      if (!student) return res.json(sendResponse("⚠️ I couldn’t find details for that student ID."));

      // Award small engagement badge for checking finance (example)
      await awardBadgeIfNotExists(studentId, "Finance Explorer", "Checked finance summary");

      let reminder = "";
      if (student.feesPending > 0) {
        reminder = `\n\n⚠️ Reminder: ₹${student.feesPending} pending. Last paid on ${student.lastFeeDate}.`;
      }

      return res.json(
        sendResponse(
          `💰 *Finance Summary*\n- Student: ${student.name}\n- Pending Fees: ₹${student.feesPending}\n- Scholarships: ${student.scholarships.join(", ")}${reminder}\n\n👉 Options:\n1️⃣ Show Eligible Scholarships\n2️⃣ Show Fee Deadlines`
        )
      );
    }

    // ------------------ ParentStatusIntent ------------------
    if (intent === "ParentStatusIntent") {
      const parentId = params.parentId?.[0];
      if (!parentId) {
        return res.json(
          sendResponse("👨‍👩‍👦 Please provide your Parent ID (e.g., PARENT001).")
        );
      }

      const parent = parents[parentId];
      if (!parent) return res.json(sendResponse("⚠️ I couldn’t find details for that parent ID."));

      // award a parent-engagement badge (example)
      // we don't have studentId here but can use parentId as well
      await awardBadgeIfNotExists(parentId, "Engaged Parent", "Viewed child progress");

      let alert = "";
      const attendanceValue = parseInt(parent.attendance.replace("%", ""));
      if (!isNaN(attendanceValue) && attendanceValue < 75) {
        alert = "\n\n⚠️ Alert: Attendance is below 75%. Should I connect you with a mentor?";
      }

      return res.json(
        sendResponse(
          `👨‍👩‍👦 *Parent Dashboard*\nParent ID: ${parentId}\nChild: ${parent.child}\n\n📊 Attendance: ${parent.attendance}\n📝 Marks: ${parent.marks}\n💰 Fees Pending: ₹${parent.feesPending}${alert}\n\n👉 Options:\n1️⃣ View Scholarship Updates\n2️⃣ View Upcoming Deadlines`
        )
      );
    }

    // ------------------ MentorStatusIntent ------------------
    if (intent === "MentorStatusIntent") {
      const mentorId = params.mentorId?.[0];
      if (!mentorId) return res.json(sendResponse("Please provide your Mentor ID (e.g., MENTOR001)."));

      const mentor = mentors[mentorId];
      if (!mentor) return res.json(sendResponse("⚠️ I couldn’t find details for that mentor ID."));

      // award mentor engagement badge example
      await awardBadgeIfNotExists(mentorId, "Active Mentor", "Viewed mentee list");

      return res.json(
        sendResponse(
          `👨‍🏫 *Mentor Dashboard*\nMentor ID: ${mentorId}\n\n📋 Assigned Mentees:\n${mentor.mentees.join(", ")}\n\n👉 Options:\n1️⃣ Show Performance Summary\n2️⃣ Send Message to Mentees`
        )
      );
    }

    // ------------------ CounselingIntent ------------------
    if (intent === "CounselingIntent") {
      // awarding a wellbeing seeker badge example (if student param present)
      const sid = params.studentId?.[0];
      if (sid) await awardBadgeIfNotExists(sid, "Wellbeing Seeker", "Reached out for counseling");

      return res.json(
        sendResponse(
          `🧠 *Counseling Support*\nI understand you’re seeking guidance.\n✔ A counselor will be notified to contact you.\n✔ Meanwhile, here are self-help resources:\n- Stress management tips\n- Study-life balance guide\n\n👉 Options:\n1️⃣ Connect to Counselor\n2️⃣ Show Self-Help Resources`
        )
      );
    }

    // ------------------ DistressIntent ------------------
    if (intent === "DistressIntent") {
      // No badge awarding for distress (safety first) — still log optionally
      return res.json(
        sendResponse(
          `🚨 *Distress Alert*\nI sense you’re in distress. You are not alone.\n✔ A counselor has been notified to contact you immediately.\n✔ If it’s urgent, please call the helpline: 📞 1800-599-0019\n\n👉 Options:\n1️⃣ Connect to Counselor Now\n2️⃣ Get Relaxation Resources`
        )
      );
    }

    // ------------------ MarketplaceIntent ------------------
    if (intent === "MarketplaceIntent") {
      // award marketplace explorer badge if student param present
      const sid = params.studentId?.[0];
      if (sid) await awardBadgeIfNotExists(sid, "Marketplace Explorer", "Browsed the marketplace");

      return res.json(
        sendResponse(
          `🛒 *Marketplace Listings*\nHere are some items available right now:\n- 📚 Used Textbooks (CS, Mechanical, Commerce)\n- 🧮 Calculators\n- 🛏 Hostel Essentials\n- 💻 Laptops (second-hand)\n\n👉 Options:\n1️⃣ See Latest Listings\n2️⃣ Post an Item for Sale`
        )
      );
    }

    // ------------------ MentorshipIntent ------------------
    if (intent === "MentorshipIntent") {
      const field = params.field?.[0];
      if (!field) {
        return res.json(
          sendResponse(
            `👨‍🏫 *Mentorship Available*\nWe have mentors in:\n- 💻 Computer Science\n- ⚙️ Mechanical Engineering\n- 📊 Commerce\n- 🤖 Artificial Intelligence / Data Science\n\n👉 Example: 'Connect me to a mentor in Mechanical'`
          )
        );
      }

      // award a "Mentorship Seeker" badge optionally (requires studentId)
      const sid = params.studentId?.[0];
      if (sid) await awardBadgeIfNotExists(sid, "Mentorship Seeker", `Requested mentor in ${field}`);

      return res.json(
        sendResponse(
          `👨‍🏫 Connecting you to a mentor in ${field}...\n👉 Options:\n1️⃣ View Mentor Profiles\n2️⃣ Connect Now`
        )
      );
    }

    // ------------------ ReminderIntent ------------------
    if (intent === "ReminderIntent") {
      const reminderTime = params.time || "8:00 PM";
      return res.json(
        sendResponse(`⏰ Okay! I’ll remind you to study daily at ${reminderTime}. (Demo)`)
      );
    }

    // ------------------ Default Fallback Intent (multi-layer) ------------------
    if (intent === "Default Fallback Intent") {
      const userQuery = (req.body.queryResult?.queryText || "").trim();
      // 1) MongoDB FAQ (fuzzy)
      const faq = await Faq.findOne({ question: new RegExp(userQuery, "i") });
      if (faq) return res.json(sendResponse(faq.answer));

      // 2) Google Sheets fallback
      const sheetData = await getSheetData();
      const sheetFaq = sheetData.find((row) =>
        row.Question && userQuery.toLowerCase().includes(row.Question.toLowerCase())
      );
      if (sheetFaq) return res.json(sendResponse(sheetFaq.Answer));

      // 3) Hardcoded fallback map
      const hardcodedFaqs = {
        "what is sih": "💡 SIH (Smart India Hackathon) is a nationwide initiative by MHRD to provide students a platform to solve pressing problems.",
        "who are you": "🤖 I am your Student Support Assistant, here to guide you with Finance, Mentorship, Counseling, and Marketplace queries."
      };
      const lowerQ = userQuery.toLowerCase();
      if (hardcodedFaqs[lowerQ]) return res.json(sendResponse(hardcodedFaqs[lowerQ]));

      // 4) final fallback message
      return res.json(sendResponse("🙏 Sorry, I couldn’t find an exact answer. I can help with Finance, Mentorship, Counseling, or Marketplace. Could you rephrase?"));
    }

    // If none matched — safe fallback
    return res.json(sendResponse("I can guide you in Finance, Mentorship, Counseling, or Marketplace."));
  } catch (err) {
    console.error("❌ Webhook error:", err);
    return res.json(sendResponse("⚠️ Something went wrong while processing your request."));
  }
});

// ------------------ Gamification Endpoints ------------------

// Award a badge manually (useful for automation/tests)
app.post("/award-badge", async (req, res) => {
  try {
    const { studentId, badgeName, reason } = req.body;
    if (!studentId || !badgeName) return res.status(400).json({ error: "studentId and badgeName required" });
    const badge = await awardBadgeIfNotExists(studentId, badgeName, reason || "");
    return res.json({ message: "✅ Badge awarded (or already exists)", badge });
  } catch (err) {
    console.error("❌ Award badge error:", err);
    return res.status(500).json({ error: "Failed to award badge" });
  }
});

// List badges for a studentId or parent/mentor Id
app.get("/badges/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const badges = await Badge.find({ studentId: id }).sort({ awardedAt: -1 }).lean();
    return res.json({ badges });
  } catch (err) {
    console.error("❌ Get badges error:", err);
    return res.status(500).json({ error: "Failed to fetch badges" });
  }
});

// ------------------ Seeder Route (faqs) ------------------
app.get("/seed-faqs", async (req, res) => {
  try {
    const faqs = [
      { category: "General", question: "What is SIH", answer: "💡 SIH (Smart India Hackathon) is a nationwide initiative by MHRD to provide students a platform to solve pressing problems." },
      { category: "General", question: "Who are you", answer: "🤖 I am your Student Support Assistant, here to guide you with Finance, Mentorship, Counseling, and Marketplace queries." },
      { category: "Finance", question: "What scholarships are available", answer: "🎓 Scholarships are available for Computer Science, Mechanical, and Commerce students." }
    ];
    await Faq.deleteMany({});
    await Faq.insertMany(faqs);
    return res.json({ message: "✅ FAQs seeded successfully!", faqs });
  } catch (err) {
    console.error("❌ Seeder error:", err);
    return res.status(500).json({ error: "Seeder failed" });
  }
});

// ------------------ Start Server ------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
