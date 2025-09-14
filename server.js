// server.js
import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import { getSheetData } from "./utils/sheets.js";
import Faq from "./models/Faq.js";

dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(cors());

// ------------------ MongoDB ------------------
mongoose
  .connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

// ------------------ Helper ------------------
function sendResponse(text) {
  return {
    fulfillmentText: text,
    fulfillmentMessages: [{ text: { text: [text] } }],
  };
}

// ------------------ Webhook ------------------
app.post("/webhook", async (req, res) => {
  const intent = req.body.queryResult.intent.displayName;
  const params = req.body.queryResult.parameters;

  // ------------------ Finance ------------------
  if (intent === "FinanceIntent") {
    const studentId = params.studentId?.[0];
    if (!studentId) {
      return res.json(sendResponse("Please provide your Student ID (e.g., STU001)."));
    }
    return res.json(sendResponse(`💰 Finance details for ${studentId} (from DB soon).`));
  }

  // ------------------ Parent ------------------
  if (intent === "ParentStatusIntent") {
    const parentId = params.parentId?.[0];
    if (!parentId) {
      return res.json(sendResponse("Please provide your Parent ID (e.g., PARENT001)."));
    }
    return res.json(sendResponse(`👨‍👩‍👦 Parent dashboard for ${parentId} (from DB soon).`));
  }

  // ------------------ Mentor ------------------
  if (intent === "MentorStatusIntent") {
    const mentorId = params.mentorId?.[0];
    if (!mentorId) {
      return res.json(sendResponse("Please provide your Mentor ID (e.g., MENTOR001)."));
    }
    return res.json(sendResponse(`👨‍🏫 Mentor dashboard for ${mentorId} (from DB soon).`));
  }

  // ------------------ Counseling ------------------
  if (intent === "CounselingIntent") {
    return res.json(
      sendResponse(
        `🧠 *Counseling Support*\nI understand you’re seeking guidance.\n✔ A counselor will be notified.\n✔ Meanwhile, here are resources:\n- Stress tips\n- Study-life balance guide`
      )
    );
  }

  // ------------------ Distress ------------------
  if (intent === "DistressIntent") {
    return res.json(
      sendResponse(
        `🚨 *Distress Alert*\nYou are not alone.\n✔ A counselor has been notified immediately.\n✔ Helpline: 📞 1800-599-0019`
      )
    );
  }

  // ------------------ Marketplace ------------------
  if (intent === "MarketplaceIntent") {
    return res.json(
      sendResponse(
        `🛒 *Marketplace Listings*\n- 📚 Used Textbooks\n- 🧮 Calculators\n- 🛏 Hostel Essentials\n- 💻 Laptops (second-hand)`
      )
    );
  }

  // ------------------ Mentorship ------------------
  if (intent === "MentorshipIntent") {
    return res.json(
      sendResponse(
        `👨‍🏫 *Mentorship Available*\n- 💻 Computer Science\n- ⚙️ Mechanical Engineering\n- 📊 Commerce\n- 🤖 AI/Data Science`
      )
    );
  }

  // ------------------ Default Fallback ------------------
  if (intent === "Default Fallback Intent") {
    const userQuery = req.body.queryResult.queryText.toLowerCase();

    // 1. Hardcoded FAQs
    const hardcodedFAQs = {
      "what is sih":
        "💡 SIH (Smart India Hackathon) is a nationwide initiative where students solve real-world problems.",
      "fee deadline":
        "📅 The fee deadline is usually the 10th of every month.",
      "scholarship":
        "🎓 Scholarships are available for meritorious and needy students. Apply via the finance section."
    };
    if (hardcodedFAQs[userQuery]) {
      return res.json(sendResponse(hardcodedFAQs[userQuery]));
    }

    // 2. Google Sheets
    try {
      const sheetData = await getSheetData("Sheet1!A:B"); // question | answer
      const sheetMatch = sheetData.find(
        (row) => row.question?.toLowerCase() === userQuery
      );
      if (sheetMatch) {
        return res.json(sendResponse(sheetMatch.answer));
      }
    } catch (err) {
      console.error("❌ Sheets fallback error:", err.message);
    }

    // 3. MongoDB FAQ
    try {
      const faqMatch = await Faq.findOne({
        question: new RegExp(userQuery, "i"),
      });
      if (faqMatch) {
        return res.json(sendResponse(faqMatch.answer));
      }
    } catch (err) {
      console.error("❌ MongoDB fallback error:", err.message);
    }

    // 4. Final Fallback
    return res.json(
      sendResponse(
        "🤖 I can guide you in Finance, Mentorship, Counseling, or Marketplace."
      )
    );
  }

  // ------------------ Safety Default ------------------
  return res.json(
    sendResponse("🤖 I can guide you in Finance, Mentorship, Counseling, or Marketplace.")
  );
});

// ------------------ Start Server ------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
