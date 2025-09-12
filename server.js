// server.js (Full working version with Parents + Mentors APIs)

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
// Student APIs
// =====================
app.post("/students", async (req, res) => {
  try {
    const student = new Student(req.body);
    await student.save();
    res.status(201).json(student);
  } catch (err) {
    res.status(500).json({ error: "Error creating student" });
  }
});

app.get("/students", async (req, res) => {
  const students = await Student.find();
  res.json(students);
});

app.get("/students/:id", async (req, res) => {
  try {
    const student = await Student.findOne({ studentId: req.params.id });
    if (!student) return res.status(404).json({ error: "Student not found" });
    res.json(student);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// =====================
// Parent APIs
// =====================
app.post("/parents", async (req, res) => {
  try {
    const parent = new Parent(req.body);
    await parent.save();
    res.status(201).json(parent);
  } catch (err) {
    res.status(500).json({ error: "Error creating parent" });
  }
});

app.get("/parents/:id", async (req, res) => {
  try {
    const parent = await Parent.findOne({ parentId: req.params.id });
    if (!parent) return res.status(404).json({ error: "Parent not found" });
    res.json(parent);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// =====================
// Mentor APIs
// =====================
app.post("/mentors", async (req, res) => {
  try {
    const mentor = new Mentor(req.body);
    await mentor.save();
    res.status(201).json(mentor);
  } catch (err) {
    res.status(500).json({ error: "Error creating mentor" });
  }
});

app.get("/mentors/:id", async (req, res) => {
  try {
    const mentor = await Mentor.findOne({ mentorId: req.params.id });
    if (!mentor) return res.status(404).json({ error: "Mentor not found" });
    res.json(mentor);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

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
      responseText = student
        ? `Student ${student.name} has ₹${student.feesPending} pending fees.`
        : "I couldn’t find fee details for this student.";
    }

    // ===== Counseling Intent =====
    else if (intentName === "CounselingIntent") {
      responseText =
        "I understand you’re seeking counseling. A counselor will reach out soon. Meanwhile, would you like self-help resources on stress and mental health?";
    }

    // ===== Distress Intent =====
    else if (intentName === "DistressIntent") {
      console.log("🚨 Distress Alert:", {
        studentId: params.studentId || "unknown",
        message: req.body.queryResult.queryText,
        timestamp: new Date(),
      });
      responseText =
        "I sense you’re in distress. You are not alone. A counselor will contact you immediately. If it’s an emergency, please call the helpline: 1800-599-0019.";
    }

    // ===== Marketplace Intent =====
    else if (intentName === "MarketplaceIntent") {
      responseText =
        "Our marketplace currently has used textbooks, calculators, and hostel essentials available. Would you like me to fetch the latest listings for you?";
    }

    // ===== Mentorship Intent =====
    else if (intentName === "MentorshipIntent") {
      responseText =
        "We have mentors available in Computer Science, Mechanical, and Commerce. Please tell me your field of interest so I can match you with the right mentor.";
    }

    // ===== Parent Status Intent =====
    else if (intentName === "ParentStatusIntent") {
      const parentId = params.parentId || params.ParentID;
      const parent = await Parent.findOne({ parentId });
      if (parent) {
        const student = await Student.findOne({ studentId: parent.childId });
        responseText = student
          ? `Parent ${parentId}, your child ${student.name} has attendance ${student.attendance}% and marks ${student.marks}. Fees pending: ₹${student.feesPending}.`
          : "I couldn’t find details for the child.";
      } else {
        responseText = "I couldn’t find details for that parent ID.";
      }
    }

    // ===== Mentor Status Intent =====
    else if (intentName === "MentorStatusIntent") {
      const mentorId = params.mentorId || params.MentorID;
      const mentor = await Mentor.findOne({ mentorId });
      responseText = mentor
        ? `Mentor ${mentorId}, you have ${mentor.mentees.length} mentees: ${mentor.mentees.join(
            ", "
          )}.`
        : "I couldn’t find details for that mentor ID.";
    }

    res.json({ fulfillmentText: responseText });
  } catch (error) {
    console.error("Webhook error:", error);
    res.json({ fulfillmentText: "Something went wrong. Please try again later." });
  }
});

// =====================
// Start Server
// =====================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
