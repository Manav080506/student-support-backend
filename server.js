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
  scholarships: [{ course: String }],
  interests: [String],
});
const Student = mongoose.model("Student", studentSchema);

// ======================
// Health Check
// ======================
app.get("/", (req, res) => res.send("Student Support Backend is Running 🚀"));

// ======================
// Student Routes
// ======================
app.get("/students", async (req, res) => {
  try {
    const students = await Student.find();
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
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

app.put("/students/:id", async (req, res) => {
  try {
    const student = await Student.findOneAndUpdate({ studentId: req.params.id }, req.body, { new: true });
    if (!student) return res.status(404).json({ error: "Student not found" });
    res.json({ message: "Updated", student });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.delete("/students/:id", async (req, res) => {
  try {
    const deleted = await Student.findOneAndDelete({ studentId: req.params.id });
    if (!deleted) return res.status(404).json({ error: "Student not found" });
    res.json({ message: "Deleted", student: deleted });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ======================
// FAQ Routes
// ======================
app.post("/seed-faqs", async (req, res) => {
  try {
    const faqs = [
      {
        category: "Finance",
        question: "How can I pay my pending fees?",
        answer: "You can pay fees via the official payment portal: https://payment-portal.com",
      },
      {
        category: "Counseling",
        question: "How do I book a counseling session?",
        answer: "You can book via the student dashboard → Counseling tab.",
      },
      {
        category: "Scholarship",
        question: "What scholarships are available?",
        answer: "Check the National Scholarship Portal or our in-app Scholarship Finder.",
      },
    ];

    await Faq.deleteMany();
    const result = await Faq.insertMany(faqs);

    res.json({ message: "FAQs seeded", count: result.length });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/faqs", async (req, res) => {
  try {
    const faqs = await Faq.find();
    res.json(faqs);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/faqs", async (req, res) => {
  try {
    const faq = new Faq(req.body);
    await faq.save();
    res.status(201).json({ message: "FAQ added", faq });
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

    // Finance Intent
    if (intentName === "FinanceIntent") {
      const studentId = params.studentId;
      const student = await Student.findOne({ studentId });
      if (student) {
        responseText = `Student ${student.name} has ₹${student.feesPending} pending fees.`;
      } else {
        responseText = "I couldn’t find fee details for this student.";
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

    // Fallback → Try FAQ search
    else {
      const faq = await Faq.findOne({
        question: { $regex: userQuery, $options: "i" },
      });

      if (faq) {
        responseText = faq.answer;
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
