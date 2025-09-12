// server.js (interactive + adaptive chatbot replies)

import express from "express";
import mongoose from "mongoose";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors());

// =====================
// MongoDB connection
// =====================
const mongoURI = process.env.MONGODB_URI;
mongoose
  .connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// =====================
// Schemas & Models
// =====================
const studentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true },
  name: String,
  feesPending: Number,
  marks: Number,
  attendance: Number,
  scholarships: [{ course: String }],
  interests: [String],
});

const parentSchema = new mongoose.Schema({
  parentId: { type: String, required: true, unique: true },
  childId: String,
  relation: String,
});

const mentorSchema = new mongoose.Schema({
  mentorId: { type: String, required: true, unique: true },
  mentees: [String],
});

const Student = mongoose.model("Student", studentSchema);
const Parent = mongoose.model("Parent", parentSchema);
const Mentor = mongoose.model("Mentor", mentorSchema);

// =====================
// Health Route
// =====================
app.get("/", (req, res) => res.send("🚀 Student Support Backend is Running"));

// =====================
// Dialogflow Webhook
// =====================
app.post("/webhook", async (req, res) => {
  try {
    const intentName = req.body.queryResult.intent.displayName;
    const params = req.body.queryResult.parameters || {};
    let responseText = "I'm not sure how to help with that.";

    // ===== Finance Intent =====
    if (intentName === "FinanceIntent") {
      const studentId = params.studentId;
      const student = await Student.findOne({ studentId });
      if (student) {
        const scholarshipText =
          student.scholarships && student.scholarships.length > 0
            ? `${student.scholarships.length} applied (${student.scholarships
                .map((s) => s.course)
                .join(", ")})`
            : "No scholarships applied yet";

        responseText = `💰 *Finance Summary*\n- Student: ${student.name}\n- Pending Fees: ₹${student.feesPending}\n- Scholarships: ${scholarshipText}\n\n👉 Options:\n1️⃣ Show Eligible Scholarships\n2️⃣ Show Fee Deadlines`;
      } else {
        responseText = "⚠️ I couldn’t find fee details for this student.";
      }
    }

    // ===== Counseling Intent =====
    else if (intentName === "CounselingIntent") {
      responseText = `🧠 *Counseling Support*\nI understand you’re seeking guidance.\n✔ A counselor will be notified to contact you.\n✔ Meanwhile, here are self-help resources:\n- Stress management tips\n- Study-life balance guide\n\n👉 Options:\n1️⃣ Connect to Counselor\n2️⃣ Show Self-Help Resources`;
    }

    // ===== Distress Intent =====
    else if (intentName === "DistressIntent") {
      console.log("🚨 Distress Alert:", {
        studentId: params.studentId || "unknown",
        message: req.body.queryResult.queryText,
        timestamp: new Date(),
      });
      responseText = `🚨 *Distress Alert*\nI sense you’re in distress. You are not alone.\n✔ A counselor has been notified to contact you immediately.\n✔ If it’s urgent, please call the helpline: 📞 1800-599-0019\n\n👉 Options:\n1️⃣ Connect to Counselor Now\n2️⃣ Get Relaxation Resources`;
    }

    // ===== Marketplace Intent =====
    else if (intentName === "MarketplaceIntent") {
      responseText = `🛒 *Marketplace Listings*\nHere are some items available right now:\n- 📚 Used Textbooks (CS, Mechanical, Commerce)\n- 🧮 Calculators\n- 🛏 Hostel Essentials\n\n👉 Options:\n1️⃣ See Latest Listings\n2️⃣ Post an Item for Sale`;
    }

    // ===== Mentorship Intent =====
    else if (intentName === "MentorshipIntent") {
      responseText = `👨‍🏫 *Mentorship Available*\nWe have mentors in the following fields:\n- 💻 Computer Science\n- ⚙️ Mechanical Engineering\n- 📊 Commerce\n\n👉 Options:\n1️⃣ Connect to a Mentor\n2️⃣ View Mentor Profiles`;
    }

    // ===== Parent Status Intent =====
    else if (intentName === "ParentStatusIntent") {
      const parentId = params.parentId || params.ParentID;
      const parent = await Parent.findOne({ parentId });
      if (parent) {
        const student = await Student.findOne({ studentId: parent.childId });
        if (student) {
          responseText = `👨‍👩‍👦 *Parent Dashboard*\nParent ID: ${parentId}\nChild: ${student.name}\n\n📊 Attendance: ${
            student.attendance ?? "Not updated"
          }%\n📝 Marks: ${
            student.marks ?? "Not updated"
          }%\n💰 Fees Pending: ₹${
            student.feesPending ?? 0
          }\n\n👉 Options:\n1️⃣ View Scholarship Updates\n2️⃣ View Upcoming Deadlines`;
        } else {
          responseText = "⚠️ I couldn’t find details for the child.";
        }
      } else {
        responseText = "⚠️ I couldn’t find details for that parent ID.";
      }
    }

    // ===== Mentor Status Intent =====
    else if (intentName === "MentorStatusIntent") {
      const mentorId = params.mentorId || params.MentorID;
      const mentor = await Mentor.findOne({ mentorId });
      if (mentor) {
        if (mentor.mentees && mentor.mentees.length > 0) {
          responseText = `👨‍🏫 *Mentor Dashboard*\nMentor ID: ${mentorId}\n\n📋 Assigned Mentees:\n${mentor.mentees
            .map((m, i) => `${i + 1}. ${m}`)
            .join(
              "\n"
            )}\n\n👉 Options:\n1️⃣ Show Performance Summary\n2️⃣ Send Message to Mentees`;
        } else {
          responseText = `👨‍🏫 Mentor ${mentorId}, you currently don’t have any assigned mentees.`;
        }
      } else {
        responseText = "⚠️ I couldn’t find details for that mentor ID.";
      }
    }

    res.json({ fulfillmentText: responseText });
  } catch (error) {
    console.error("Webhook error:", error);
    res.json({
      fulfillmentText: "Something went wrong. Please try again later.",
    });
  }
});

// =====================
// Start Server
// =====================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
