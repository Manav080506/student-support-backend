// server.js
import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import cron from "node-cron";
import Sentiment from "sentiment";

import Faq from "./models/Faq.js";
import Badge from "./models/Badge.js";
import BadgeMeta from "./models/BadgeMeta.js";
import Reminder from "./models/Reminder.js";
import ChatLog from "./models/ChatLog.js"; // <-- Chat log model
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

/**
 * Log a chat attempt to MongoDB ChatLog
 * @param {Object} opts - { query, response, intent, matchedQuestion, matchSource, similarity }
 */
async function logChat({ query, response, intent, matchedQuestion = null, matchSource = "none", similarity = 0 }) {
  try {
    await ChatLog.create({
      query,
      response,
      intent,
      matchedQuestion,
      matchSource,
      similarity,
    });
  } catch (err) {
    console.error("❌ ChatLog save error:", err.message);
  }
}

// ------------------ Webhook ------------------
app.post("/webhook", async (req, res) => {
  const intent = req.body.queryResult.intent.displayName;
  const params = req.body.queryResult.parameters;

  try {
    // ------------------ Finance ------------------
    if (intent === "FinanceIntent") {
      const studentId = params.studentId?.[0];
      if (!studentId) {
        const resp = "Please provide your Student ID (e.g., STU001).";
        await logChat({ query: req.body.queryResult.queryText, response: resp, intent, matchSource: "none", similarity: 0 });
        return res.json(sendResponse(resp));
      }

      const student = students[studentId];
      if (!student) {
        const resp = "⚠️ I couldn’t find details for that student ID.";
        await logChat({ query: req.body.queryResult.queryText, response: resp, intent, matchSource: "none", similarity: 0 });
        return res.json(sendResponse(resp));
      }

      await Badge.create({ studentId, badgeName: "Finance Explorer", reason: "Checked finance summary" });

      const resp = `💰 *Finance Summary*\n- Student: ${student.name}\n- Pending Fees: ₹${student.feesPending}\n- Scholarships: ${student.scholarships.join(", ")}\n\n👉 Options:\n1️⃣ Show Eligible Scholarships\n2️⃣ Show Fee Deadlines`;
      await logChat({ query: req.body.queryResult.queryText, response: resp, intent, matchSource: "database", matchedQuestion: "FinanceSummary", similarity: 1 });

      return res.json(sendResponse(resp));
    }

    // ------------------ Parent Status ------------------
    if (intent === "ParentStatusIntent") {
      const parentId = params.parentId?.[0];
      if (!parentId) {
        const resp = "Please provide your Parent ID (e.g., PARENT001).";
        await logChat({ query: req.body.queryResult.queryText, response: resp, intent, matchSource: "none", similarity: 0 });
        return res.json(sendResponse(resp));
      }

      const parent = parents[parentId];
      if (!parent) {
        const resp = "⚠️ I couldn’t find details for that parent ID.";
        await logChat({ query: req.body.queryResult.queryText, response: resp, intent, matchSource: "none", similarity: 0 });
        return res.json(sendResponse(resp));
      }

      await Badge.create({ studentId: parentId, badgeName: "Engaged Parent", reason: "Viewed child dashboard" });

      const resp = `👨‍👩‍👦 *Parent Dashboard*\nParent ID: ${parentId}\nChild: ${parent.child}\n\n📊 Attendance: ${parent.attendance}\n📝 Marks: ${parent.marks}\n💰 Fees Pending: ₹${parent.feesPending}\n\n👉 Options:\n1️⃣ View Scholarship Updates\n2️⃣ View Upcoming Deadlines`;
      await logChat({ query: req.body.queryResult.queryText, response: resp, intent, matchSource: "database", matchedQuestion: "ParentDashboard", similarity: 1 });

      return res.json(sendResponse(resp));
    }

    // ------------------ Mentor Status ------------------
    if (intent === "MentorStatusIntent") {
      const mentorId = params.mentorId?.[0];
      if (!mentorId) {
        const resp = "Please provide your Mentor ID (e.g., MENTOR001).";
        await logChat({ query: req.body.queryResult.queryText, response: resp, intent, matchSource: "none", similarity: 0 });
        return res.json(sendResponse(resp));
      }

      const mentor = mentors[mentorId];
      if (!mentor) {
        const resp = "⚠️ I couldn’t find details for that mentor ID.";
        await logChat({ query: req.body.queryResult.queryText, response: resp, intent, matchSource: "none", similarity: 0 });
        return res.json(sendResponse(resp));
      }

      await Badge.create({ studentId: mentorId, badgeName: "Active Mentor", reason: "Reviewed mentees" });

      const resp = `👨‍🏫 *Mentor Dashboard*\nMentor ID: ${mentorId}\n\n📋 Assigned Mentees:\n${mentor.mentees.join(", ")}\n\n👉 Options:\n1️⃣ Show Performance Summary\n2️⃣ Send Message to Mentees`;
      await logChat({ query: req.body.queryResult.queryText, response: resp, intent, matchSource: "database", matchedQuestion: "MentorDashboard", similarity: 1 });

      return res.json(sendResponse(resp));
    }

    // ------------------ Counseling ------------------
    if (intent === "CounselingIntent") {
      await Badge.create({ studentId: "GENERIC", badgeName: "Wellbeing Seeker", reason: "Asked for counseling" });

      const resp = `🧠 *Counseling Support*\nI understand you’re seeking guidance.\n✔ A counselor will be notified to contact you.\n✔ Meanwhile, here are self-help resources:\n- Breathing exercises\n- Study-life balance guide\n\n👉 Options:\n1️⃣ Connect to Counselor\n2️⃣ Show Self-Help Resources`;
      await logChat({ query: req.body.queryResult.queryText, response: resp, intent, matchSource: "database", matchedQuestion: "Counseling", similarity: 1 });

      return res.json(sendResponse(resp));
    }

    // ------------------ Distress ------------------
    if (intent === "DistressIntent") {
      const resp = `🚨 *Distress Alert*\nI sense you’re in distress. You are not alone.\n✔ A counselor has been notified to contact you immediately.\n✔ If it’s urgent, please call the helpline: 📞 1800-599-0019\n\n👉 Options:\n1️⃣ Connect to Counselor Now\n2️⃣ Get Relaxation Resources`;
      await logChat({ query: req.body.queryResult.queryText, response: resp, intent, matchSource: "database", matchedQuestion: "Distress", similarity: 1 });
      return res.json(sendResponse(resp));
    }

    // ------------------ Marketplace ------------------
    if (intent === "MarketplaceIntent") {
      await Badge.create({ studentId: "GENERIC", badgeName: "Marketplace Explorer", reason: "Browsed marketplace" });

      const resp = `🛒 *Marketplace Listings*\nHere are some items available right now:\n- 📚 Used Textbooks (CS, Mechanical, Commerce)\n- 🧮 Calculators\n- 🛏 Hostel Essentials\n- 💻 Laptops (second-hand)\n\n👉 Options:\n1️⃣ See Latest Listings\n2️⃣ Post an Item for Sale`;
      await logChat({ query: req.body.queryResult.queryText, response: resp, intent, matchSource: "database", matchedQuestion: "Marketplace", similarity: 1 });

      return res.json(sendResponse(resp));
    }

    // ------------------ Mentorship ------------------
    if (intent === "MentorshipIntent") {
      await Badge.create({ studentId: "GENERIC", badgeName: "Mentorship Seeker", reason: "Requested mentor" });

      const resp = `👨‍🏫 *Mentorship Available*\nWe have mentors in the following fields:\n- 💻 Computer Science\n- ⚙️ Mechanical Engineering\n- 📊 Commerce\n- 🤖 Artificial Intelligence / Data Science\n\n👉 Options:\n1️⃣ Connect to a Mentor\n2️⃣ View Mentor Profiles`;
      await logChat({ query: req.body.queryResult.queryText, response: resp, intent, matchSource: "database", matchedQuestion: "Mentorship", similarity: 1 });

      return res.json(sendResponse(resp));
    }

    // ------------------ Reminder Intent ------------------
    if (intent === "ReminderIntent") {
      const userId = params.studentId?.[0] || params.parentId?.[0] || params.mentorId?.[0] || "GENERIC";
      const reminders = await Reminder.find({ targetId: { $in: [userId, "GENERIC"] } })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

      const resp = reminders.length
        ? `📌 *Your Latest Reminders:*\n${reminders.map((r, i) => `${i + 1}. ${r.message}`).join("\n")}`
        : "📭 You have no reminders at the moment.";

      await logChat({ query: req.body.queryResult.queryText, response: resp, intent, matchSource: reminders.length ? "database" : "none", matchedQuestion: "Reminders", similarity: reminders.length ? 1 : 0 });
      return res.json(sendResponse(resp));
    }

    // ------------------ Fallback with Multi-Layer + Sentiment ------------------
    if (intent === "Default Fallback Intent") {
      const userQuery = (req.body.queryResult.queryText || "").trim();

      // Quick guard
      if (!userQuery) {
        const resp = "I didn't get that. Can you say it again?";
        await logChat({ query: userQuery, response: resp, intent, matchSource: "none", similarity: 0 });
        return res.json(sendResponse(resp));
      }

      // 🧠 Sentiment Detection
      try {
        const sentimentResult = sentiment.analyze(userQuery);
        if (sentimentResult.score <= -3) {
          const resp = `😔 I sense you’re feeling very low. You’re not alone.\n✔ Would you like me to connect you to a counselor?\n✔ Helpline: 📞 1800-599-0019\n\nWhile you decide, here are quick exercises:\n- 4-4-4 breathing\n- Short walk or water break`;
          await logChat({ query: userQuery, response: resp, intent, matchSource: "sentiment", matchedQuestion: "sentiment_alert", similarity: Math.max(-sentimentResult.score / 5, 0) });
          return res.json(sendResponse(resp));
        }
        if (sentimentResult.score >= 3) {
          const resp = `😊 Glad to hear you're feeling good! Want suggestions for productive tasks or study tips?`;
          await logChat({ query: userQuery, response: resp, intent, matchSource: "sentiment", matchedQuestion: "sentiment_positive", similarity: Math.min(sentimentResult.score / 5, 1) });
          return res.json(sendResponse(resp));
        }
      } catch (err) {
        console.warn("⚠️ Sentiment analysis failed:", err.message);
        // continue to KB checks
      }

      // 1️⃣ Check MongoDB FAQs (simple regex match)
      try {
        const faq = await Faq.findOne({ question: new RegExp(userQuery, "i") });
        if (faq) {
          const resp = faq.answer;
          await logChat({ query: userQuery, response: resp, intent, matchedQuestion: faq.question, matchSource: "faq", similarity: 1 });
          return res.json(sendResponse(resp));
        }
      } catch (err) {
        console.warn("⚠️ FAQ lookup failed:", err.message);
      }

      // 2️⃣ Check Google Sheets
      try {
        const sheetData = await getSheetData(); // returns array of rows as objects with headers
        const sheetFaq = sheetData.find((row) => {
          if (!row.Question) return false;
          try {
            return userQuery.toLowerCase().includes(row.Question.toLowerCase());
          } catch {
            return false;
          }
        });
        if (sheetFaq) {
          const resp = sheetFaq.Answer || sheetFaq.answer || "Sorry, I couldn't fetch the sheet answer.";
          await logChat({ query: userQuery, response: resp, intent, matchedQuestion: sheetFaq.Question, matchSource: "sheet", similarity: 1 });
          return res.json(sendResponse(resp));
        }
      } catch (err) {
        console.warn("⚠️ Google Sheets lookup failed:", err.message);
      }

      // 3️⃣ Hardcoded fallback map (case-insensitive keyed)
      const hardcodedFaqs = {
        "what is sih": "💡 *SIH (Smart India Hackathon)* is a nationwide initiative by MHRD to provide students a platform to solve pressing problems.",
        "who are you": "🤖 I am your Student Support Assistant, here to guide you in Finance, Mentorship, Counseling, and Marketplace.",
      };
      const lowerQ = userQuery.toLowerCase();
      if (hardcodedFaqs[lowerQ]) {
        const resp = hardcodedFaqs[lowerQ];
        await logChat({ query: userQuery, response: resp, intent, matchedQuestion: lowerQ, matchSource: "hardcoded", similarity: 1 });
        return res.json(sendResponse(resp));
      }

      // 4️⃣ Final fallback (no match)
      const finalResp = "🙏 Sorry, I couldn’t find an exact answer. But I can guide you in Finance, Mentorship, Counseling, or Marketplace.";
      await logChat({ query: userQuery, response: finalResp, intent, matchSource: "none", similarity: 0 });
      return res.json(sendResponse(finalResp));
    }

    // If intent is something else not handled above:
    const unknownResp = "I can guide you in Finance, Mentorship, Counseling, or Marketplace.";
    await logChat({ query: req.body.queryResult.queryText || "", response: unknownResp, intent, matchSource: "none", similarity: 0 });
    return res.json(sendResponse(unknownResp));
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    const resp = "⚠️ Something went wrong while processing your request.";
    await logChat({ query: req.body.queryResult.queryText || "", response: resp, intent: req.body.queryResult.intent?.displayName || "unknown", matchSource: "none", similarity: 0 });
    return res.json(sendResponse(resp));
  }
});

// ------------------ Seeder Routes ------------------
app.get("/seed-faqs", async (req, res) => {
  try {
    const faqs = [
      { category: "General", question: "What is SIH", answer: "💡 SIH (Smart India Hackathon) is a nationwide initiative by MHRD..." },
      { category: "General", question: "Who are you", answer: "🤖 I am your Student Support Assistant, here to guide you..." },
      { category: "Finance", question: "What scholarships are available", answer: "🎓 Scholarships are available for Computer Science, Mechanical, and Commerce students." },
    ];
    await Faq.deleteMany({});
    await Faq.insertMany(faqs);
    res.json({ message: "✅ FAQs seeded successfully!", faqs });
  } catch (err) {
    console.error("❌ Seeder error:", err.message);
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
    console.error("❌ Seeder error:", err.message);
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
    console.error("❌ Award badge error:", err.message);
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
    console.error("❌ Get badges error:", err.message);
    res.status(500).json({ error: "Failed to fetch badges" });
  }
});

// ------------------ Reminder API ------------------
app.get("/reminders/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const reminders = await Reminder.find({ targetId: { $in: [id, "GENERIC"] } })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    res.json({ reminders });
  } catch (err) {
    console.error("❌ Get reminders error:", err.message);
    res.status(500).json({ error: "Failed to fetch reminders" });
  }
});

// ------------------ Cron Jobs ------------------
// Daily finance reminders at 9 AM
cron.schedule("0 9 * * *", async () => {
  try {
    console.log("🔔 Cron: Checking finance reminders...");
    for (const [id, student] of Object.entries(students)) {
      if (student.feesPending > 0) {
        const message = `⚠️ Reminder: ${student.name} has pending fees of ₹${student.feesPending}`;
        await Reminder.create({ type: "finance", message, targetId: id });
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
      await Reminder.create({ type: "mentorship", message, targetId: id });
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
    await Reminder.create({ type: "badge", message, targetId: "GENERIC" });
    await Badge.create({ studentId: "GENERIC", badgeName: "Consistency Badge", reason: "Daily engagement" });
    console.log(message);
  } catch (err) {
    console.error("❌ Cron (badge) error:", err.message);
  }
});

// Parent weekly report every Sunday at 8 PM
cron.schedule("0 20 * * 0", async () => {
  try {
    console.log("👨‍👩‍👦 Cron: Sending parent weekly report...");
    for (const [id, parent] of Object.entries(parents)) {
      const message = `📊 Weekly Report - Child: ${parent.child}, Attendance: ${parent.attendance}, Marks: ${parent.marks}`;
      await Reminder.create({ type: "parent", message, targetId: id });
      console.log(message);
    }
  } catch (err) {
    console.error("❌ Cron (parent report) error:", err.message);
  }
});

// Health check every 30 minutes
cron.schedule("*/30 * * * *", async () => {
  try {
    const message = "✅ Server is alive & running...";
    await Reminder.create({ type: "health", message, targetId: "SYSTEM" });
    console.log(message);
  } catch (err) {
    console.error("❌ Cron (health) error:", err.message);
  }
});

// ------------------ Start Server ------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
