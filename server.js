// server.js
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import { Student, Parent, Mentor, Faq } from "./models/index.js";

const app = express();
app.use(express.json());
app.use(cors());

// ------------------- MongoDB Connection -------------------
const mongoURI = process.env.MONGODB_URI;
mongoose
  .connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ------------------- Health Check -------------------
app.get("/", (req, res) => {
  res.type("text/plain");
  res.send("Student Support Backend is Running 🚀");
});

// ------------------- Student Routes -------------------

// Create new student
app.post("/students", async (req, res) => {
  try {
    const { studentId, name, feesPending = 0, marks = 0, attendance = 0, scholarships = [], interests = [] } = req.body;

    if (!studentId || !name) {
      return res.status(400).json({ error: "studentId and name required" });
    }

    const exists = await Student.findOne({ studentId });
    if (exists) {
      return res.status(409).json({ error: "Student already exists" });
    }

    const student = new Student({ studentId, name, feesPending, marks, attendance, scholarships, interests });
    await student.save();

    res.status(201).json({ message: "Student created", student });
  } catch (err) {
    console.error("❌ Error creating student:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get all students
app.get("/students", async (req, res) => {
  try {
    const students = await Student.find();
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Get single student by ID
app.get("/students/:id", async (req, res) => {
  try {
    const student = await Student.findOne({ studentId: req.params.id });
    if (!student) return res.status(404).json({ error: "Student not found" });
    res.json(student);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ------------------- Parent Routes -------------------
app.get("/parents", async (req, res) => {
  try {
    const parents = await Parent.find();
    res.json(parents);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ------------------- Mentor Routes -------------------
app.get("/mentors", async (req, res) => {
  try {
    const mentors = await Mentor.find();
    res.json(mentors);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ------------------- FAQ Routes -------------------
app.get("/faqs", async (req, res) => {
  try {
    const faqs = await Faq.find();
    res.json(faqs);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ------------------- Webhook (Dialogflow) -------------------
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    if (!body.queryResult) {
      return res.type("text/plain").send("Webhook called but no queryResult found.");
    }

    const intentName = body.queryResult.intent.displayName;
    const params = body.queryResult.parameters || {};

    // 🔎 Debug logs in Render
    console.log("👉 Webhook hit");
    console.log("👉 Intent:", intentName);
    console.log("👉 Parameters:", JSON.stringify(params, null, 2));

    let responseText = "I'm not sure how to help with that.";

    // Finance Intent
    if (intentName === "FinanceIntent") {
      const studentId = params.studentId?.toString().toUpperCase();
      const student = await Student.findOne({ studentId });
      if (student) {
        responseText = `Student ${student.name} has ₹${student.feesPending} pending fees.`;
      } else {
        responseText = "I couldn’t find fee details for this student.";
      }
    }

    // Counseling Intent
    else if (intentName === "CounselingIntent") {
      responseText = "I understand you’re seeking counseling. A counselor will reach out soon. Meanwhile, would you like self-help resources on stress and mental health?";
    }

    // Distress Intent
    else if (intentName === "DistressIntent") {
      const distressLog = {
        studentId: params.studentId || "unknown",
        message: body.queryResult.queryText,
        timestamp: new Date(),
      };
      console.log("🚨 Distress Alert:", distressLog);
      responseText = "I sense you’re in distress. You are not alone. I am notifying a counselor to contact you immediately. If it’s an emergency, please call the helpline: 1800-599-0019.";
    }

    // Marketplace Intent
    else if (intentName === "MarketplaceIntent") {
      responseText = "Our marketplace currently has: used textbooks, calculators, and hostel essentials. Would you like me to fetch the latest listings for you?";
    }

    // Mentorship Intent
    else if (intentName === "MentorshipIntent") {
      responseText = "We have mentors available in Computer Science, Mechanical, and Commerce. Please tell me your field of interest so I can match you with the right mentor.";
    }

    // Parent Status Intent
    else if (intentName === "ParentStatusIntent") {
      const parentId = params.parentId?.toString().toUpperCase();
      const parent = await Parent.findOne({ parentId });
      if (parent) {
        const student = await Student.findOne({ studentId: parent.studentId });
        if (student) {
          responseText = `Hello ${parent.name} (${parent.relation}), your child ${student.name} has ₹${student.feesPending} fees pending, scored ${student.marks} marks, and has ${student.attendance}% attendance.`;
        } else {
          responseText = "Parent found, but no linked student record.";
        }
      } else {
        responseText = "I couldn’t find details for that parent ID.";
      }
    }

    // Mentor Status Intent
    else if (intentName === "MentorStatusIntent") {
      const mentorId = params.mentorId?.toString().toUpperCase();
      const mentor = await Mentor.findOne({ mentorId });
      if (mentor) {
        if (mentor.mentees.length > 0) {
          const students = await Student.find({ studentId: { $in: mentor.mentees } });
          responseText = `Hello ${mentor.name}, here are your mentees:\n` +
            students.map(s => `${s.name} → Fees: ₹${s.feesPending}, Marks: ${s.marks}, Attendance: ${s.attendance}%`).join("\n");
        } else {
          responseText = `Hello ${mentor.name}, you currently have no mentees assigned.`;
        }
      } else {
        responseText = "I couldn’t find details for that mentor ID.";
      }
    }

    // Default fallback
    else {
      responseText = "🤔 I didn’t quite get that. I can help with fees, scholarships, counseling, mentorship, or the student marketplace.";
    }

    res.json({ fulfillmentText: responseText });
  } catch (error) {
    console.error("Webhook error:", error);
    res.json({ fulfillmentText: "Something went wrong. Please try again later." });
  }
});

// ------------------- Start Server -------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
