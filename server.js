// server.js
import express from "express";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

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
app.post("/webhook", (req, res) => {
  let intent = req.body.queryResult.intent.displayName;
  const params = req.body.queryResult.parameters;
  const queryText = req.body.queryResult.queryText?.toLowerCase() || "";

  // ------------------ Finance ------------------
  if (intent === "FinanceIntent" || queryText.includes("fee")) {
    const studentId = params.studentId?.[0] || queryText.match(/stu\d+/i)?.[0];
    if (!studentId) return res.json(sendResponse("Please provide your Student ID (e.g., STU001)."));

    const student = students[studentId];
    if (!student) return res.json(sendResponse("⚠️ I couldn’t find details for that student ID."));

    return res.json(
      sendResponse(
        `💰 *Finance Summary*\n- Student: ${student.name}\n- Pending Fees: ₹${student.feesPending}\n- Scholarships: ${student.scholarships.join(", ")}\n\n👉 Options:\n1️⃣ Show Eligible Scholarships\n2️⃣ Show Fee Deadlines`
      )
    );
  }

  // ------------------ Parent Status ------------------
  if (intent === "ParentStatusIntent" || queryText.includes("parent")) {
    const parentId = params.parentId?.[0] || queryText.match(/parent\d+/i)?.[0];
    if (!parentId) return res.json(sendResponse("Please provide your Parent ID (e.g., PARENT001)."));

    const parent = parents[parentId];
    if (!parent) return res.json(sendResponse("⚠️ I couldn’t find details for that parent ID."));

    return res.json(
      sendResponse(
        `👨‍👩‍👦 *Parent Dashboard*\nParent ID: ${parentId}\nChild: ${parent.child}\n\n📊 Attendance: ${parent.attendance}\n📝 Marks: ${parent.marks}\n💰 Fees Pending: ₹${parent.feesPending}\n\n👉 Options:\n1️⃣ View Scholarship Updates\n2️⃣ View Upcoming Deadlines`
      )
    );
  }

  // ------------------ Mentor Status ------------------
  if (intent === "MentorStatusIntent" || queryText.includes("mentor id")) {
    const mentorId = params.mentorId?.[0] || queryText.match(/mentor\d+/i)?.[0];
    if (!mentorId) return res.json(sendResponse("Please provide your Mentor ID (e.g., MENTOR001)."));

    const mentor = mentors[mentorId];
    if (!mentor) return res.json(sendResponse("⚠️ I couldn’t find details for that mentor ID."));

    return res.json(
      sendResponse(
        `👨‍🏫 *Mentor Dashboard*\nMentor ID: ${mentorId}\n\n📋 Assigned Mentees:\n${mentor.mentees.join(", ")}\n\n👉 Options:\n1️⃣ Show Performance Summary\n2️⃣ Send Message to Mentees`
      )
    );
  }

  // ------------------ Mentorship ------------------
  if (intent === "MentorshipIntent" || queryText.includes("mentor")) {
    return res.json(
      sendResponse(
        `👨‍🏫 *Mentorship Available*\nWe have mentors in the following fields:\n- 💻 Computer Science\n- ⚙️ Mechanical Engineering\n- 📊 Commerce\n- 🤖 Artificial Intelligence / Data Science\n\n👉 Options:\n1️⃣ Connect to a Mentor\n2️⃣ View Mentor Profiles`
      )
    );
  }

  // ------------------ Counseling ------------------
  if (intent === "CounselingIntent" || queryText.includes("counsel") || queryText.includes("stress")) {
    return res.json(
      sendResponse(
        `🧠 *Counseling Support*\nI understand you’re seeking guidance.\n✔ A counselor will be notified to contact you.\n✔ Meanwhile, here are self-help resources:\n- Stress management tips\n- Study-life balance guide\n\n👉 Options:\n1️⃣ Connect to Counselor\n2️⃣ Show Self-Help Resources`
      )
    );
  }

  // ------------------ Distress ------------------
  if (intent === "DistressIntent" || queryText.includes("suicidal") || queryText.includes("unsafe") || queryText.includes("depression")) {
    return res.json(
      sendResponse(
        `🚨 *Distress Alert*\nI sense you’re in distress. You are not alone.\n✔ A counselor has been notified to contact you immediately.\n✔ If it’s urgent, please call the helpline: 📞 1800-599-0019\n\n👉 Options:\n1️⃣ Connect to Counselor Now\n2️⃣ Get Relaxation Resources`
      )
    );
  }

  // ------------------ Marketplace ------------------
  if (intent === "MarketplaceIntent" || queryText.includes("laptop") || queryText.includes("books") || queryText.includes("marketplace") || queryText.includes("sell")) {
    return res.json(
      sendResponse(
        `🛒 *Marketplace Listings*\nHere are some items available right now:\n- 📚 Used Textbooks (CS, Mechanical, Commerce)\n- 🧮 Calculators\n- 🛏 Hostel Essentials\n- 💻 Laptops (second-hand)\n\n👉 Options:\n1️⃣ See Latest Listings\n2️⃣ Post an Item for Sale`
      )
    );
  }

  // ------------------ Default ------------------
  return res.json(sendResponse("I can guide you in Finance, Mentorship, Counseling, or Marketplace."));
});

// ------------------ Start Server ------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

