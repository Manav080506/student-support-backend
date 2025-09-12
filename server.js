import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import { Student, Parent, Mentor, Faq } from "./models/index.js";

const app = express();
app.use(express.json());
app.use(cors());

// MongoDB connection
const mongoURI = process.env.MONGODB_URI;
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Health Check
app.get("/", (req, res) => {
  res.type("text/plain");
  res.send("Student Support Backend is Running 🚀");
});

// ------------------- Students -------------------
app.post("/students", async (req, res) => {
  try {
    const { studentId, name, feesPending = 0, marks = 0, attendance = 0, scholarships = [], interests = [] } = req.body;
    if (!studentId || !name) return res.status(400).json({ error: "studentId and name required" });

    const exists = await Student.findOne({ studentId });
    if (exists) return res.status(409).json({ error: "Student already exists" });

    const student = new Student({ studentId, name, feesPending, marks, attendance, scholarships, interests });
    await student.save();
    res.status(201).json({ message: "Student created", student });
  } catch (err) {
    console.error("❌ Error creating student:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/students", async (req, res) => res.json(await Student.find()));
app.get("/students/:id", async (req, res) => {
  const student = await Student.findOne({ studentId: req.params.id });
  student ? res.json(student) : res.status(404).json({ error: "Student not found" });
});

// ------------------- Parents -------------------
app.post("/parents", async (req, res) => {
  const parent = new Parent(req.body);
  await parent.save();
  res.status(201).json({ message: "Parent created", parent });
});
app.get("/parents", async (req, res) => res.json(await Parent.find()));

// ------------------- Mentors -------------------
app.post("/mentors", async (req, res) => {
  const mentor = new Mentor(req.body);
  await mentor.save();
  res.status(201).json({ message: "Mentor created", mentor });
});
app.get("/mentors", async (req, res) => res.json(await Mentor.find()));

// ------------------- FAQs -------------------
app.post("/faqs", async (req, res) => {
  const faq = new Faq(req.body);
  await faq.save();
  res.status(201).json({ message: "FAQ created", faq });
});
app.get("/faqs", async (req, res) => res.json(await Faq.find()));

// ------------------- Webhook -------------------
app.post("/webhook", async (req, res) => {
  const body = req.body;
  if (!body.queryResult) return res.type("text/plain").send("Webhook called but no queryResult found.");

  const intentName = body.queryResult.intent.displayName;
  const params = body.queryResult.parameters || {};
  console.log("👉 Webhook hit | Intent:", intentName, "| Params:", params);

  let responseText = "I'm not sure how to help with that.";

  if (intentName === "FinanceIntent") {
    const student = await Student.findOne({ studentId: params.studentId?.toUpperCase() });
    responseText = student
      ? `Student ${student.name} has ₹${student.feesPending} pending fees.`
      : "I couldn’t find fee details for this student.";
  }

  else if (intentName === "CounselingIntent") {
    responseText = "A counselor will reach out soon. Meanwhile, would you like self-help resources on stress and mental health?";
  }

  else if (intentName === "DistressIntent") {
    console.log("🚨 Distress Alert:", body.queryResult.queryText);
    responseText = "I sense you’re in distress. You are not alone. A counselor will contact you immediately.";
  }

  else if (intentName === "MarketplaceIntent") {
    responseText = "Our marketplace has: used textbooks, calculators, and hostel essentials.";
  }

  else if (intentName === "MentorshipIntent") {
    responseText = "We have mentors in Computer Science, Mechanical, and Commerce. Please tell me your interest.";
  }

  else if (intentName === "ParentStatusIntent") {
    const parent = await Parent.findOne({ parentId: params.parentId?.toUpperCase() });
    if (parent) {
      const student = await Student.findOne({ studentId: parent.studentId });
      responseText = student
        ? `Hello ${parent.name}, your child ${student.name} has ₹${student.feesPending} fees pending, scored ${student.marks}, attendance ${student.attendance}%.`
        : "Parent found, but no linked student record.";
    } else {
      responseText = "I couldn’t find details for that parent ID.";
    }
  }

  else if (intentName === "MentorStatusIntent") {
    const mentor = await Mentor.findOne({ mentorId: params.mentorId?.toUpperCase() });
    if (mentor) {
      const students = await Student.find({ studentId: { $in: mentor.mentees } });
      responseText = students.length
        ? `Hello ${mentor.name}, your mentees:\n` + students.map(s => `${s.name} → Fees: ₹${s.feesPending}, Marks: ${s.marks}, Attendance: ${s.attendance}%`).join("\n")
        : `Hello ${mentor.name}, you currently have no mentees.`;
    } else {
      responseText = "I couldn’t find details for that mentor ID.";
    }
  }

  res.json({ fulfillmentText: responseText });
});

// ------------------- Start -------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
