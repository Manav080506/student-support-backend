// server.js
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import Student from "./models/Student.js"; // your Student model
import Faq from "./models/Faq.js"; // FAQ model (optional, for later)

// Initialize
const app = express();
app.use(express.json());
app.use(cors());

// MongoDB connection (Render -> Environment Variables -> MONGODB_URI)
const mongoURI = process.env.MONGODB_URI;
mongoose
  .connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ------------------- Health Check -------------------
app.get("/", (req, res) => {
  res.type("text/plain"); // Force plain text response
  res.send("Student Support Backend is Running 🚀");
});

// ------------------- Students API -------------------

// GET all students
app.get("/students", async (req, res) => {
  try {
    const students = await Student.find();
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// GET student by ID
app.get("/students/:id", async (req, res) => {
  try {
    const student = await Student.findOne({ studentId: req.params.id });
    if (!student) return res.status(404).json({ error: "Student not found" });
    res.json(student);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// CREATE new student
app.post("/students", async (req, res) => {
  try {
    const { studentId, name, feesPending = 0, scholarships = [], interests = [] } = req.body;
    if (!studentId || !name) return res.status(400).json({ error: "studentId and name required" });

    const exists = await Student.findOne({ studentId });
    if (exists) return res.status(409).json({ error: "Student already exists" });

    const student = new Student({ studentId, name, feesPending, scholarships, interests });
    await student.save();
    res.status(201).json({ message: "Student created", student });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// UPDATE student
app.put("/students/:id", async (req, res) => {
  try {
    const updates = req.body;
    const student = await Student.findOneAndUpdate({ studentId: req.params.id }, { $set: updates }, { new: true });
    if (!student) return res.status(404).json({ error: "Student not found" });
    res.json({ message: "Updated", student });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE student
app.delete("/students/:id", async (req, res) => {
  try {
    const deleted = await Student.findOneAndDelete({ studentId: req.params.id });
    if (!deleted) return res.status(404).json({ error: "Student not found" });
    res.json({ message: "Deleted", student: deleted });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ------------------- Webhook (Dialogflow) -------------------
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    // Defensive fallback
    if (!body.queryResult) {
      return res.type("text/plain").send("Webhook called but no queryResult found.");
    }

    const intentName = body.queryResult.intent.displayName;
    const params = body.queryResult.parameters || {};
    let responseText = "I'm not sure how to help with that.";

    // FinanceIntent
    if (intentName === "FinanceIntent") {
      const studentId = params.studentId?.toString().toUpperCase();
      const student = await Student.findOne({ studentId });
      if (student) {
        responseText = `Student ${student.name} has ₹${student.feesPending} pending fees.`;
      } else {
        responseText = "I couldn’t find fee details for this student.";
      }
    }

    // CounselingIntent
    else if (intentName === "CounselingIntent") {
      responseText = "I understand you’re seeking counseling. A counselor will reach out soon. Meanwhile, would you like self-help resources on stress and mental health?";
    }

    // DistressIntent
    else if (intentName === "DistressIntent") {
      const distressLog = {
        studentId: params.studentId || "unknown",
        message: body.queryResult.queryText,
        timestamp: new Date(),
      };
      console.log("🚨 Distress Alert:", distressLog);

      responseText = "I sense you’re in distress. You are not alone. I am notifying a counselor to contact you immediately. If it’s an emergency, please call the helpline: 1800-599-0019.";
    }

    // MarketplaceIntent
    else if (intentName === "MarketplaceIntent") {
      responseText = "Our marketplace currently has: used textbooks, calculators, and hostel essentials. Would you like me to fetch the latest listings for you?";
    }

    // MentorshipIntent
    else if (intentName === "MentorshipIntent") {
      responseText = "We have mentors available in Computer Science, Mechanical, and Commerce. Please tell me your field of interest so I can match you with the right mentor.";
    }

    // Send response back
    res.json({ fulfillmentText: responseText });
  } catch (error) {
    console.error("Webhook error:", error);
    res.json({ fulfillmentText: "Something went wrong. Please try again later." });
  }
});

// ------------------- Start Server -------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
