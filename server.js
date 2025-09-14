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

    // ------------------ Fallback with Multi-Layer ------------------
    if (intent === "Default Fallback Intent") {
      const userQuery = req.body.queryResult.queryText;

      // 1️⃣ Check MongoDB FAQs
      const faq = await Faq.findOne({ question: new RegExp(userQuery, "i") });
      if (faq) return res.json(sendResponse(faq.answer));

      // 2️⃣ Check Google Sheets
      const sheetData = await getSheetData();
      const sheetFaq = sheetData.find((row) => row.Question && userQuery.toLowerCase().includes(row.Question.toLowerCase()));
      if (sheetFaq) return res.json(sendResponse(sheetFaq.Answer));

      // 3️⃣ Hardcoded fallback
      const hardcodedFaqs = {
        "what is sih": "💡 *SIH (Smart India Hackathon)* is a nationwide initiative by MHRD to provide students a platform to solve pressing problems.",
        "who are you": "🤖 I am your Student Support Assistant, here to guide you with Finance, Mentorship, Counseling, and Marketplace queries.",
      };
      const lowerQ = userQuery.toLowerCase();
      if (hardcodedFaqs[lowerQ]) return res.json(sendResponse(hardcodedFaqs[lowerQ]));

      // 4️⃣ Final fallback
      return res.json(sendResponse("🙏 Sorry, I couldn’t find an exact answer. But I can guide you in Finance, Mentorship, Counseling, or Marketplace."));
    }
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    res.json(sendResponse("⚠️ Something went wrong while processing your request."));
  }
});

// ------------------ Seeder Routes ------------------
app.get("/seed-faqs", async (req, res) => {
  try {
    const faqs = [
      { category: "General", question: "What is SIH", answer: "💡 SIH (Smart India Hackathon) is a nationwide initiative by MHRD to provide students a platform to solve pressing problems." },
      { category: "General", question: "Who are you", answer: "🤖 I am your Student Support Assistant, here to guide you with Finance, Mentorship, Counseling, and Marketplace queries." },
      { category: "Finance", question: "What scholarships are available", answer: "🎓 Scholarships are available for Computer Science, Mechanical, and Commerce students." },
    ];
    await Faq.deleteMany({});
    await Faq.insertMany(faqs);
    res.json({ message: "✅ FAQs seeded successfully!", faqs });
  } catch (err) {
    res.status(500).json({ error: "Seeder failed" });
  }
});

app.get("/seed-badge-meta", async (req, res) => {
  try {
    const metas = [
      { badgeName: "Finance Explorer", description: "Checked your finance summary", icon: "💰" },
      { badgeName: "Engaged Parent", description: "Viewed child’s dashboard", icon: "👨‍👩‍👦" },
      { badgeName: "Active Mentor", description: "Reviewed mentees", icon: "👨‍🏫" },
      { badgeName: "Marketplace Explorer", description: "Browsed the marketplace", icon: "🛒" },
      { badgeName: "Mentorship Seeker", description: "Requested a mentor", icon: "🎓" },
      { badgeName: "Wellbeing Seeker", description: "Asked for counseling", icon: "🧠" },
      { badgeName: "Consistency Badge", description: "Stayed active regularly", icon: "🎖️" },
    ];
    await BadgeMeta.deleteMany({});
    await BadgeMeta.insertMany(metas);
    res.json({ message: "✅ Badge metadata seeded successfully!", metas });
  } catch (err) {
    res.status(500).json({ error: "Seeder failed" });
  }
});

// ------------------ Badge APIs ------------------
app.post("/award-badge", async (req, res) => {
  try {
    const { studentId, badgeName, reason } = req.body;
    const badge = await Badge.create({ studentId, badgeName, reason });
    res.json({ message: "✅ Badge awarded", badge });
  } catch (err) {
    res.status(500).json({ error: "Award badge failed" });
  }
});

app.get("/badges/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const badges = await Badge.find({ studentId: id }).sort({ awardedAt: -1 }).lean();
    const metas = await BadgeMeta.find({}).lean();
    const metaMap = {};
    metas.forEach((m) => (metaMap[m.badgeName] = m));

    const enriched = badges.map((b) => ({
      ...b,
      description: metaMap[b.badgeName]?.description || "",
      icon: metaMap[b.badgeName]?.icon || "🏅",
    }));

    res.json({ badges: enriched });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch badges" });
  }
});

// ------------------ Cron Jobs ------------------

// Daily finance reminders at 9 AM
cron.schedule("0 9 * * *", () => {
  console.log("🔔 Cron: Checking finance reminders...");
  Object.entries(students).forEach(([id, student]) => {
    if (student.feesPending > 0) {
      console.log(`⚠️ Reminder: ${student.name} has pending fees of ₹${student.feesPending}`);
    }
  });
});

// Weekly mentorship nudges every Monday at 10 AM
cron.schedule("0 10 * * 1", () => {
  console.log("📅 Cron: Weekly mentorship nudges...");
  Object.entries(mentors).forEach(([id, mentor]) => {
    console.log(`👨‍🏫 Mentor ${id} has ${mentor.mentees.length} mentees`);
  });
});

// ------------------ Start Server ------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
