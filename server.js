// server.js
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import Faq from "./models/Faq.js";

const app = express();
app.use(express.json());
app.use(cors());

// ======================
// MongoDB connection
// ======================
const mongoURI = process.env.MONGODB_URI;
mongoose
  .connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ======================
// Student Schema
// ======================
const studentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true },
  name: String,
  feesPending: Number,
  marks: Number,
  attendance: Number,
  scholarships: [{ course: String }],
  interests: [String],
});
const Student = mongoose.model("Student", studentSchema);

// ======================
// Parent Schema
// ======================
const parentSchema = new mongoose.Schema({
  parentId: { type: String, required: true, unique: true },
  name: String,
  relation: String, // e.g., Father, Mother
  studentId: { type: String, required: true }, // linked student
});
const Parent = mongoose.model("Parent", parentSchema);

// ======================
// Ensure text index for FAQ fuzzy search
// ======================
Faq.schema.index({ question: "text", answer: "text" });

// ======================
// Health Check
// ======================
app.get("/", (req, res) => res.send("Student Support Backend is Running 🚀"));

// ======================
// Parent Routes
// ======================

// Create parent
app.post("/parents", async (req, res) => {
  try {
    const { parentId, name, relation, studentId } = req.body;
    if (!parentId || !name || !studentId)
      return res.status(400).json({ error: "parentId, name, studentId required" });

    const exists = await Parent.findOne({ parentId });
    if (exists) return res.status(409).json({ error: "Parent already exists" });

    const parent = new Parent({ parentId, name, relation, studentId });
    await parent.save();
    res.status(201).json({ message: "Parent created", parent });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Get parent details
app.get("/parents/:id", async (req, res) => {
  try {
    const parent = await Parent.findOne({ parentId: req.params.id });
    if (!parent) return res.status(404).json({ error: "Parent not found" });
    res.json(parent);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Parent view student status
app.get("/parents/:id/status", async (req, res) => {
  try {
    const parent = await Parent.findOne({ parentId: req.params.id });
    if (!parent) return res.status(404).json({ error: "Parent not found" });

    const student = await Student.findOne({ studentId: parent.studentId });
    if (!student) return res.status(404).json({ error: "Student not found" });

    const status = {
      studentName: student.name,
      feesPending: student.feesPending,
      marks: student.marks,
      attendance: student.attendance,
      scholarships: student.scholarships,
    };

    res.json({ parent: parent.name, relation: parent.relation, student: status });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ======================
// Webhook (Dialogflow)
// ======================
app.post("/webhook", async (req, res) => {
  try {
    const intentName = req.body.queryResult.intent.displayName;
    const params = req.body.queryResult.parameters;
    const userQuery = req.body.queryResult.queryText;
    let responseText = "I'm not sure how to help with that.";

    // Finance Intent (student/parent)
    if (intentName === "FinanceIntent") {
      const studentId = params.studentId;
      const student = await Student.findOne({ studentId });
      if (student) {
        responseText = `Student ${student.name} has ₹${student.feesPending} pending fees.`;
      } else {
        responseText = "I couldn’t find fee details for this student.";
      }
    }

    // Parent Query Intent
    else if (intentName === "ParentStatusIntent") {
      const parentId = params.parentId;
      const parent = await Parent.findOne({ parentId });
      if (!parent) {
        responseText = "Parent not found. Please check your Parent ID.";
      } else {
        const student = await Student.findOne({ studentId: parent.studentId });
        if (student) {
          responseText = `Hello ${parent.name} (${parent.relation}), your child ${student.name} has ₹${student.feesPending} pending fees, ${student.attendance}% attendance, and scored ${student.marks} marks.`;
        } else {
          responseText = "Linked student record not found.";
        }
      }
    }

    // Counseling Intent
    else if (intentName === "CounselingIntent") {
      responseText =
        "I understand you’re seeking counseling. A counselor will reach out soon. Meanwhile, would you like self-help resources on stress and mental health?";
    }

    // Distress Intent
    else if (intentName === "DistressIntent") {
      console.log("🚨 Distress Alert:", userQuery);
      responseText =
        "I sense you’re in distress. You are not alone. I am notifying a counselor to contact you immediately. If it’s an emergency, please call the helpline: 1800-599-0019.";
    }

    // Marketplace Intent
    else if (intentName === "MarketplaceIntent") {
      responseText =
        "Our marketplace currently has: used textbooks, calculators, and hostel essentials available. Would you like me to fetch the latest listings for you?";
    }

    // Mentorship Intent
    else if (intentName === "MentorshipIntent") {
      responseText =
        "We have mentors available in Computer Science, Mechanical, and Commerce. Please tell me your field of interest so I can match you with the right mentor.";
    }

    // Fallback → Fuzzy FAQ search
    else {
      const faq = await Faq.findOne(
        { $text: { $search: userQuery } },
        { score: { $meta: "textScore" } }
      ).sort({ score: { $meta: "textScore" } });

      if (faq && faq.score >= 0.5) {
        responseText = `Here’s what I found: ${faq.answer}`;
      } else {
        responseText =
          "Sorry, I didn’t quite get that. I can help with Finance, Counseling, Mentorship, Marketplace, or Scholarships.";
      }
    }

    res.json({ fulfillmentText: responseText });
  } catch (err) {
    console.error("Webhook error:", err);
    res.json({ fulfillmentText: "Something went wrong. Please try again later." });
  }
});

// ======================
// Start server
// ======================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
