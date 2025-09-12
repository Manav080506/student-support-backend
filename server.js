// server.js
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import Faq from "./models/Faq.js";   // 👈 FAQ model

const app = express();
app.use(express.json());
app.use(cors());

// =============================
// MongoDB connection
// =============================
const mongoURI = process.env.MONGODB_URI;
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("✅ MongoDB Connected"))
.catch((err) => console.error("❌ MongoDB connection error:", err));

// =============================
// Student Schema + Model
// =============================
const studentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true },
  name: String,
  feesPending: Number,
  scholarships: [{ course: String }],
  interests: [String]
});
const Student = mongoose.model("Student", studentSchema);

// =============================
// Health Route
// =============================
app.get("/", (req, res) => res.send("Student Support Backend is Running 🚀"));

// =============================
// Student CRUD APIs
// =============================
app.get("/students", async (req, res) => {
  const students = await Student.find();
  res.json(students);
});

app.get("/students/:id", async (req, res) => {
  const student = await Student.findOne({ studentId: req.params.id });
  if (!student) return res.status(404).json({ error: "Student not found" });
  res.json(student);
});

app.post("/students", async (req, res) => {
  const { studentId, name, feesPending = 0, scholarships = [], interests = [] } = req.body;
  const exists = await Student.findOne({ studentId });
  if (exists) return res.status(409).json({ error: "Student already exists" });

  const student = new Student({ studentId, name, feesPending, scholarships, interests });
  await student.save();
  res.status(201).json({ message: "Student created", student });
});

app.put("/students/:id", async (req, res) => {
  const student = await Student.findOneAndUpdate(
    { studentId: req.params.id },
    { $set: req.body },
    { new: true }
  );
  if (!student) return res.status(404).json({ error: "Student not found" });
  res.json({ message: "Updated", student });
});

app.delete("/students/:id", async (req, res) => {
  const deleted = await Student.findOneAndDelete({ studentId: req.params.id });
  if (!deleted) return res.status(404).json({ error: "Student not found" });
  res.json({ message: "Deleted", student: deleted });
});

// =============================
// FAQ Routes
// =============================

// 👉 Seed FAQs (run once, then remove/comment)
app.post("/seed-faqs", async (req, res) => {
  try {
    const docs = [
      {
        category: "Finance",
        question: "How can I pay my pending fees?",
        answer: "You can pay fees via the official payment portal: https://payment-portal.com"
      },
      {
        category: "Counseling",
        question: "How do I book a counseling session?",
        answer: "Request a session using this form: https://college.com/counseling"
      },
      {
        category: "Mentorship",
        question: "How can I get a mentor in Computer Science?",
        answer: "Request a mentor via the mentorship portal or ask the bot to connect you."
      }
    ];
    await Faq.insertMany(docs);
    return res.json({ message: "FAQs seeded", count: docs.length });
  } catch (err) {
    console.error("Seed FAQ error:", err);
    return res.status(500).json({ error: "Failed to seed FAQs" });
  }
});

// Get all FAQs
app.get("/faqs", async (req, res) => {
  try {
    const faqs = await Faq.find().sort({ createdAt: -1 });
    res.json(faqs);
  } catch (err) {
    console.error("Get FAQs error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Create FAQ
app.post("/faqs", async (req, res) => {
  try {
    const { category, question, answer } = req.body;
    if (!category || !question || !answer) {
      return res.status(400).json({ error: "category, question, and answer required" });
    }
    const faq = new Faq({ category, question, answer });
    await faq.save();
    res.status(201).json(faq);
  } catch (err) {
    console.error("Create FAQ error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// =============================
// Webhook (basic placeholder)
// =============================
app.post("/webhook", async (req, res) => {
  try {
    const intentName = req.body.queryResult.intent.displayName;
    let responseText = "I can help with Fees, Counseling, Mentorship, Marketplace, or Distress support.";

    if (intentName === "FinanceIntent") {
      responseText = "Finance intent triggered (hooked into DB).";
    }
    if (intentName === "CounselingIntent") {
      responseText = "Counseling intent triggered.";
    }
    if (intentName === "DistressIntent") {
      responseText = "Distress intent triggered.";
    }
    if (intentName === "MarketplaceIntent") {
      responseText = "Marketplace intent triggered.";
    }
    if (intentName === "MentorshipIntent") {
      responseText = "Mentorship intent triggered.";
    }

    res.json({ fulfillmentText: responseText });
  } catch (error) {
    console.error("Webhook error:", error);
    res.json({ fulfillmentText: "Something went wrong. Please try again later." });
  }
});

// =============================
// Start Server
// =============================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
