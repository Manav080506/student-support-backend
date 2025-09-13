// server.js
import express from "express";
import bodyParser from "body-parser";
import { google } from "googleapis";
import fs from "fs";

const app = express();
app.use(bodyParser.json());

// ------------------ Dummy Database ------------------
const students = {
  STU001: {
    name: "Manav Runthala",
    feesPending: 5000,
    scholarships: ["Computer Science"],
  },
  STU002: {
    name: "Daksh Beniwal",
    feesPending: 3000,
    scholarships: ["Mechanical Engineering"],
  },
  STU003: {
    name: "Disha Binani",
    feesPending: 0,
    scholarships: ["Commerce"],
  },
};

const parents = {
  PARENT001: {
    child: "Manav Runthala",
    attendance: "85%",
    marks: "80%",
    feesPending: 5000,
  },
};

const mentors = {
  MENTOR001: {
    mentees: ["STU001", "STU002"],
  },
};

// ------------------ Google Sheets Setup (Diary) ------------------
const credentials = JSON.parse(fs.readFileSync("credentials.json", "utf8"));
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: SCOPES,
});

// Replace with your Google Sheet ID
const SHEET_ID = "YOUR_SHEET_ID_HERE";
const RANGE = "Sheet1!A:B"; // A=keywords, B=answer

async function fetchDiary() {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: RANGE,
  });

  const rows = res.data.values;
  if (!rows || rows.length === 0) return [];

  return rows.map((row) => {
    const keywords = row[0] ? row[0].split(",").map((k) => k.trim()) : [];
    const answer = row[1] || "";
    return { keywords, answer };
  });
}

function lookupDiary(queryText, faqList) {
  queryText = queryText.toLowerCase();
  for (const faq of faqList) {
    for (const keyword of faq.keywords) {
      if (queryText.includes(keyword.toLowerCase())) {
        return faq.answer;
      }
    }
  }
  return null;
}

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
  const queryText = req.body.queryResult.queryText;

  // ------------------ Finance ------------------
  if (intent === "FinanceIntent") {
    const studentId = params.studentId?.[0];
    if (!studentId) {
      return res.json(
        sendResponse("Please provide your Student ID (e.g., STU001).")
      );
    }

    const student = students[studentId];
    if (!student) {
      return res.json(
        sendResponse("⚠️ I couldn’t find details for that student ID.")
      );
    }

    return res.json(
      sendResponse(
        `💰 *Finance Summary*\n- Student: ${student.name}\n- Pending Fees: ₹${student.feesPending}\n- Scholarships: ${student.scholarships.join(
          ", "
        )}\n\n👉 Options:\n1️⃣ Show Eligible Scholarships\n2️⃣ Show Fee Deadlines`
      )
    );
  }

  // ------------------ Parent Status ------------------
  if (intent === "ParentStatusIntent") {
    const parentId = params.parentId?.[0];
    if (!parentId) {
      return res.json(
        sendResponse("Please provide your Parent ID (e.g., PARENT001).")
      );
    }

    const parent = parents[parentId];
    if (!parent) {
      return res.json(
        sendResponse("⚠️ I couldn’t find details for that parent ID.")
      );
    }

    return res.json(
      sendResponse(
        `👨‍👩‍👦 *Parent Dashboard*\nParent ID: ${parentId}\nChild: ${parent.child}\n\n📊 Attendance: ${parent.attendance}\n📝 Marks: ${parent.marks}\n💰 Fees Pending: ₹${parent.feesPending}\n\n👉 Options:\n1️⃣ View Scholarship Updates\n2️⃣ View Upcoming Deadlines`
      )
    );
  }

  // ------------------ Mentor Status ------------------
  if (intent === "MentorStatusIntent") {
    const mentorId = params.mentorId?.[0];
    if (!mentorId) {
      return res.json(
        sendResponse("Please provide your Mentor ID (e.g., MENTOR001).")
      );
    }

    const mentor = mentors[mentorId];
    if (!mentor) {
      return res.json(
        sendResponse("⚠️ I couldn’t find details for that mentor ID.")
      );
    }

    return res.json(
      sendResponse(
        `👨‍🏫 *Mentor Dashboard*\nMentor ID: ${mentorId}\n\n📋 Assigned Mentees:\n${mentor.mentees.join(
          ", "
        )}\n\n👉 Options:\n1️⃣ Show Performance Summary\n2️⃣ Send Message to Mentees`
      )
    );
  }

  // ------------------ Counseling ------------------
  if (intent === "CounselingIntent") {
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
    return res.json(
      sendResponse(
        `🛒 *Marketplace Listings*\nHere are some items available right now:\n- 📚 Used Textbooks (CS, Mechanical, Commerce)\n- 🧮 Calculators\n- 🛏 Hostel Essentials\n- 💻 Laptops (second-hand)\n\n👉 Options:\n1️⃣ See Latest Listings\n2️⃣ Post an Item for Sale`
      )
    );
  }

  // ------------------ Mentorship ------------------
  if (intent === "MentorshipIntent") {
    return res.json(
      sendResponse(
        `👨‍🏫 *Mentorship Available*\nWe have mentors in the following fields:\n- 💻 Computer Science\n- ⚙️ Mechanical Engineering\n- 📊 Commerce\n- 🤖 Artificial Intelligence / Data Science\n\n👉 Options:\n1️⃣ Connect to a Mentor\n2️⃣ View Mentor Profiles`
      )
    );
  }

  // ------------------ Fallback (Diary lookup) ------------------
  try {
    const faqList = await fetchDiary();
    const diaryAnswer = lookupDiary(queryText, faqList);

    if (diaryAnswer) {
      return res.json(sendResponse(diaryAnswer));
    } else {
      return res.json(
        sendResponse(
          "🤔 I don’t have an exact answer for that. But I can guide you in Finance, Mentorship, Counseling, or Marketplace."
        )
      );
    }
  } catch (err) {
    console.error("Diary fetch error:", err);
    return res.json(
      sendResponse(
        "⚠️ I couldn’t access the knowledge base right now. Please try again."
      )
    );
  }
});

// ------------------ Start Server ------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

