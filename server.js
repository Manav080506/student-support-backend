// server.js
import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import cors from "cors";

const app = express();
app.use(bodyParser.json());
app.use(cors());

// ------------------ MongoDB Connection ------------------
const MONGO_URI =
  "mongodb+srv://manavrunthala:sQYgFt0GXkJcLzfG@cluster0.dohpjtq.mongodb.net/studentSupport?retryWrites=true&w=majority&appName=Cluster0";

mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ------------------ Schemas ------------------
const studentSchema = new mongoose.Schema({
  studentId: String,
  name: String,
  feesPending: Number,
  scholarships: [String],
});

const parentSchema = new mongoose.Schema({
  parentId: String,
  child: String,
  attendance: String,
  marks: String,
  feesPending: Number,
});

const mentorSchema = new mongoose.Schema({
  mentorId: String,
  mentees: [String],
});

// ------------------ Models ------------------
const Student = mongoose.model("Student", studentSchema);
const Parent = mongoose.model("Parent", parentSchema);
const Mentor = mongoose.model("Mentor", mentorSchema);

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

  try {
    // ------------------ Finance ------------------
    if (intent === "FinanceIntent") {
      const studentId = params.studentId?.[0];
      if (!studentId) {
        return res.json(
          sendResponse("Please provide your Student ID (e.g., STU001).")
        );
      }

      const student = await Student.findOne({ studentId });
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

      const parent = await Parent.findOne({ parentId });
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

      const mentor = await Mentor.findOne({ mentorId });
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

    // ------------------ Default ------------------
    return res.json(
      sendResponse(
        "I can guide you in Finance, Mentorship, Counseling, or Marketplace."
      )
    );
  } catch (error) {
    console.error("❌ Webhook Error:", error);
    return res.json(
      sendResponse("⚠️ Something went wrong, please try again later.")
    );
  }
});

// ------------------ Start Server ------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

