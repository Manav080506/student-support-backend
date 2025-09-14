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

function resolveUserId(params = {}) {
  // prefer explicit userId, otherwise studentId/parentId/mentorId
  return (
    params.userId?.[0] ||
    params.studentId?.[0] ||
    params.parentId?.[0] ||
    params.mentorId?.[0] ||
    "GENERIC"
  );
}

// ------------------ Webhook ------------------
app.post("/webhook", async (req, res) => {
  const intent = req.body?.queryResult?.intent?.displayName;
  const params = req.body?.queryResult?.parameters || {};

  try {
    // ------------------ Finance ------------------
    if (intent === "FinanceIntent") {
      const studentId = params.studentId?.[0];
      if (!studentId) return res.json(sendResponse("Please provide your Student ID (e.g., STU001)."));

      const student = students[studentId];
      if (!student) return res.json(sendResponse("⚠️ I couldn’t find details for that student ID."));

      await Badge.create({ studentId, badgeName: "Finance Explorer", reason: "Checked finance summary" }).catch(() => null);

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

      await Badge.create({ studentId: parentId, badgeName: "Engaged Parent", reason: "Viewed child dashboard" }).catch(() => null);

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

      await Badge.create({ studentId: mentorId, badgeName: "Active Mentor", reason: "Reviewed mentees" }).catch(() => null);

      return res.json(
        sendResponse(
          `👨‍🏫 *Mentor Dashboard*\nMentor ID: ${mentorId}\n\n📋 Assigned Mentees:\n${mentor.mentees.join(", ")}\n\n👉 Options:\n1️⃣ Show Performance Summary\n2️⃣ Send Message to Mentees`
        )
      );
    }

    // ------------------ Counseling ------------------
    if (intent === "CounselingIntent") {
      await Badge.create({ studentId: "GENERIC", badgeName: "Wellbeing Seeker", reason: "Asked for counseling" }).catch(() => null);

      return res.json(
        sendResponse(
          `🧠 *Counseling Support*\nI understand you’re seeking guidance.\n✔ A counselor will be notified to contact you.\n✔ Meanwhile, here are self-help resources:\n- Stress management tips\n- Study-life balance guide\n\n👉 Options:\n1️⃣ Connect to Counselor\n2️⃣ Show Self-Help Resources`
        )
      );
    }

    // ------------------ Distress ------------------
    if (intent === "DistressIntent") {
      // escalate / notify logic could be added here
      return res.json(
        sendResponse(
          `🚨 *Distress Alert*\nI sense you’re in distress. You are not alone.\n✔ A counselor has been notified to contact you immediately.\n✔ If it’s urgent, please call the helpline: 📞 1800-599-0019\n\n👉 Options:\n1️⃣ Connect to Counselor Now\n2️⃣ Get Relaxation Resources`
        )
      );
    }

    // ------------------ Marketplace ------------------
    if (intent === "MarketplaceIntent") {
      await Badge.create({ studentId: "GENERIC", badgeName: "Marketplace Explorer", reason: "Browsed marketplace" }).catch(() => null);

      return res.json(
        sendResponse(
          `🛒 *Marketplace Listings*\nHere are some items available right now:\n- 📚 Used Textbooks (CS, Mechanical, Commerce)\n- 🧮 Calculators\n- 🛏 Hostel Essentials\n- 💻 Laptops (second-hand)\n\n👉 Options:\n1️⃣ See Latest Listings\n2️⃣ Post an Item for Sale`
        )
      );
    }

    // ------------------ Mentorship ------------------
    if (intent === "MentorshipIntent") {
      await Badge.create({ studentId: "GENERIC", badgeName: "Mentorship Seeker", reason: "Requested mentor" }).catch(() => null);

      return res.json(
        sendResponse(
          `👨‍🏫 *Mentorship Available*\nWe have mentors in the following fields:\n- 💻 Computer Science\n- ⚙️ Mechanical Engineering\n- 📊 Commerce\n- 🤖 Artificial Intelligence / Data Science\n\n👉 Options:\n1️⃣ Connect to a Mentor\n2️⃣ View Mentor Profiles`
        )
      );
    }

    // ------------------ Reminder Intent ------------------
    if (intent === "ReminderIntent") {
      const userId = resolveUserId(params);
      const reminders = await Reminder.find({ targetId: { $in: [userId, "GENERIC"] } })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

      if (!reminders || reminders.length === 0) {
        return res.json(sendResponse("📭 You have no reminders at the moment."));
      }

      const reminderText = reminders.map((r, i) => `${i + 1}. ${r.message}`).join("\n");
      return res.json(sendResponse(`📌 *Your Latest Reminders:*\n${reminderText}`));
    }

    // ------------------ Fallback with Multi-Layer ------------------
    if (intent === "Default Fallback Intent" || !intent) {
      const userQuery = (req.body?.queryResult?.queryText || "").trim();
      const lowerQ = userQuery.toLowerCase();

      // 1️⃣ Check MongoDB FAQs (loose regex)
      const faq = await Faq.findOne({ question: new RegExp(userQuery, "i") }).lean();
      if (faq) return res.json(sendResponse(faq.answer));

      // 2️⃣ Check Google Sheets (if available)
      try {
        const sheetData = await getSheetData();
        const sheetFaq = sheetData.find((row) => row.Question && lowerQ.includes((row.Question || "").toLowerCase()));
        if (sheetFaq && sheetFaq.Answer) return res.json(sendResponse(sheetFaq.Answer));
      } catch (err) {
        console.warn("❗ Sheets lookup failed:", err.message);
      }

      // 3️⃣ Hardcoded fallback map (quick answers)
      const hardcodedFaqs = {
        "what is sih": "💡 *SIH (Smart India Hackathon)* is a nationwide initiative by MHRD to provide students a platform to solve pressing problems.",
        "who are you": "🤖 I am your Student Support Assistant, here to guide you with Finance, Mentorship, Counseling, and Marketplace queries.",
        "hello": "Hi! 👋 I can help you with Finance, Mentorship, Counseling, Marketplace and more. What do you want to do?",
      };

      for (const key in hardcodedFaqs) {
        if (lowerQ.includes(key)) return res.json(sendResponse(hardcodedFaqs[key]));
      }

      // 4️⃣ Final fallback
      return res.json(
        sendResponse(
          "🙏 Sorry, I couldn’t find an exact answer. I can help with Finance, Mentorship, Counseling, Marketplace or show FAQs. Try: 'What is SIH' or 'Show my reminders'."
        )
      );
    }

    // default
    return res.json(sendResponse("I can guide you in Finance, Mentorship, Counseling, or Marketplace."));
  } catch (err) {
    console.error("❌ Webhook error:", err);
    return res.json(sendResponse("⚠️ Something went wrong while processing your request."));
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
    console.error("❌ Seeder error:", err);
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
    console.error("❌ Seeder error:", err);
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
    console.error("❌ Award badge error:", err);
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
    console.error("❌ Fetch badges error:", err);
    res.status(500).json({ error: "Failed to fetch badges" });
  }
});

// ------------------ Reminder APIs ------------------
app.get("/reminders/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const reminders = await Reminder.find({ targetId: { $in: [id, "GENERIC"] } })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ reminders });
  } catch (err) {
    console.error("❌ Fetch reminders error:", err);
    res.status(500).json({ error: "Failed to fetch reminders" });
  }
});

app.post("/create-reminder", async (req, res) => {
  try {
    const { type = "general", message, targetId = "GENERIC", meta = {} } = req.body;
    if (!message) return res.status(400).json({ error: "message required" });
    const r = await Reminder.create({ type, message, targetId, meta });
    res.json({ message: "✅ Reminder created", reminder: r });
  } catch (err) {
    console.error("❌ Create reminder error:", err);
    res.status(500).json({ error: "Failed to create reminder" });
  }
});

app.get("/seed-reminders", async (req, res) => {
  try {
    const sample = [
      { type: "finance", message: "⚠️ Fee due in 2 days", targetId: "STU001" },
      { type: "scholarship", message: "📝 Scholarship form closes tomorrow", targetId: "STU002" },
      { type: "parent", message: "📊 Weekly report ready", targetId: "PARENT001" },
      { type: "system", message: "✅ System health OK", targetId: "SYSTEM" },
    ];
    await Reminder.insertMany(sample);
    res.json({ message: "✅ Sample reminders seeded", sample });
  } catch (err) {
    console.error("❌ Seed reminders error:", err);
    res.status(500).json({ error: "Seeder failed" });
  }
});

// Convenience: seed all (faqs + badge-meta + reminders)
app.get("/seed-all", async (req, res) => {
  try {
    await Promise.all([
      (async () => {
        const faqs = [
          { category: "General", question: "What is SIH", answer: "💡 SIH (Smart India Hackathon) is a nationwide initiative by MHRD to provide students a platform to solve pressing problems." },
          { category: "General", question: "Who are you", answer: "🤖 I am your Student Support Assistant, here to guide you with Finance, Mentorship, Counseling, and Marketplace queries." },
          { category: "Finance", question: "What scholarships are available", answer: "🎓 Scholarships are available for Computer Science, Mechanical, and Commerce students." },
        ];
        await Faq.deleteMany({});
        await Faq.insertMany(faqs);
      })(),
      (async () => {
        const metas = [
          { badgeName: "Finance Explorer", description: "Checked your finance summary", icon: "💰" },
          { badgeName: "Engaged Parent", description: "Viewed child’s dashboard", icon: "👨‍👩‍👦" },
        ];
        await BadgeMeta.deleteMany({});
        await BadgeMeta.insertMany(metas);
      })(),
      (async () => {
        const sample = [
          { type: "finance", message: "⚠️ Fee due in 2 days", targetId: "STU001" },
          { type: "parent", message: "📊 Weekly report ready", targetId: "PARENT001" },
        ];
        await Reminder.insertMany(sample);
      })(),
    ]);
    res.json({ message: "✅ All seeded (faqs, badge meta, reminders)" });
  } catch (err) {
    console.error("❌ Seed-all error:", err);
    res.status(500).json({ error: "seed-all failed" });
  }
});

// ------------------ Cron Jobs ------------------
// wrap each cron callback inside try/catch so a failure doesn't crash the process

// Daily finance reminders at 9 AM
cron.schedule("0 9 * * *", async () => {
  try {
    console.log("🔔 Cron: Checking finance reminders...");
    for (const [id, student] of Object.entries(students)) {
      if (student.feesPending > 0) {
        const message = `⚠️ Reminder: ${student.name} has pending fees of ₹${student.feesPending}`;
        await Reminder.create({ type: "finance", message, targetId: id }).catch(() => null);
        console.log(message);
      }
    }
  } catch (err) {
    console.error("❌ Cron (finance) error:", err.message);
  }
});

// Weekly mentorship nudges every Monday at 10 AM
cron.schedule("0 10 * * 1", async () => {
  try {
    console.log("📅 Cron: Weekly mentorship nudges...");
    for (const [id, mentor] of Object.entries(mentors)) {
      const message = `👨‍🏫 Mentor ${id} has ${mentor.mentees.length} mentees. Check progress!`;
      await Reminder.create({ type: "mentorship", message, targetId: id }).catch(() => null);
      console.log(message);
    }
  } catch (err) {
    console.error("❌ Cron (mentorship) error:", err.message);
  }
});

// Daily consistency badge check at midnight
cron.schedule("0 0 * * *", async () => {
  try {
    console.log("🎖️ Cron: Awarding consistency badges...");
    const message = "🎖️ Consistency Badge awarded for daily engagement!";
    await Reminder.create({ type: "badge", message, targetId: "GENERIC" }).catch(() => null);
    await Badge.create({ studentId: "GENERIC", badgeName: "Consistency Badge", reason: "Daily engagement" }).catch(() => null);
    console.log(message);
  } catch (err) {
    console.error("❌ Cron (consistency) error:", err.message);
  }
});

// Parent weekly report every Sunday at 8 PM
cron.schedule("0 20 * * 0", async () => {
  try {
    console.log("👨‍👩‍👦 Cron: Sending parent weekly report...");
    for (const [id, parent] of Object.entries(parents)) {
      const message = `📊 Weekly Report - Child: ${parent.child}, Attendance: ${parent.attendance}, Marks: ${parent.marks}`;
      await Reminder.create({ type: "parent", message, targetId: id }).catch(() => null);
      console.log(message);
    }
  } catch (err) {
    console.error("❌ Cron (parent report) error:", err.message);
  }
});

// Health check every 30 minutes
cron.schedule("*/30 * * * *", async () => {
  try {
    const message = `✅ Server is alive & running at ${new Date().toISOString()}`;
    await Reminder.create({ type: "health", message, targetId: "SYSTEM" }).catch(() => null);
    console.log(message);
  } catch (err) {
    console.error("❌ Cron (health) error:", err.message);
  }
});

// ------------------ Start Server ------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
