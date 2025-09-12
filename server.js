// server.js
import express from "express";
import mongoose from "mongoose";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors());

// MongoDB connection
const mongoURI = process.env.MONGODB_URI;
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Schema + model
const studentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true },
  name: String,
  feesPending: Number,
  scholarships: [{ course: String }],
  interests: [String]
});
const Student = mongoose.model("Student", studentSchema);

// Health check
app.get("/", (req, res) => res.send("Student Support Backend is Running 🚀"));

// CRUD APIs (for testing/debug)
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
  try {
    const { studentId, name, feesPending = 0, scholarships = [], interests = [] } = req.body;
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
  const student = await Student.findOneAndUpdate({ studentId: req.params.id }, { $set: req.body }, { new: true });
  if (!student) return res.status(404).json({ error: "Student not found" });
  res.json({ message: "Updated", student });
});
app.delete("/students/:id", async (req, res) => {
  const deleted = await Student.findOneAndDelete({ studentId: req.params.id });
  if (!deleted) return res.status(404).json({ error: "Student not found" });
  res.json({ message: "Deleted", student: deleted });
});

// ====================================
// Webhook for Dialogflow
// ====================================
app.post("/webhook", async (req, res) => {
  try {
    const intentName = req.body.queryResult.intent.displayName;
    let responseText = "I'm not sure how to help with that.";

    // ========================
    // Finance Intent
    // ========================
    if (intentName === "FinanceIntent") {
      const studentId = req.body.queryResult.parameters.studentId;
      if (!studentId) {
        responseText = "Please provide your Student ID to check finance details.";
      } else {
        const student = await Student.findOne({ studentId });
        if (student) {
          responseText = `Student ${student.name} has ₹${student.feesPending} pending fees.`;
        } else {
          responseText = "I couldn’t find fee details for this student.";
        }
      }
    }

    // ========================
    // Counseling Intent
    // ========================
    else if (intentName === "CounselingIntent") {
      responseText =
        "I understand you’re seeking counseling. A counselor will reach out soon. Meanwhile, would you like self-help resources on stress and mental health?";
    }

    // ========================
    // Distress Intent
    // ========================
    else if (intentName === "DistressIntent") {
      const distressLog = {
        studentId: req.body.queryResult.parameters.studentId || "unknown",
        message: req.body.queryResult.queryText,
        timestamp: new Date(),
      };
      console.log("🚨 Distress Alert:", distressLog);

      responseText =
        "I sense you’re in distress. You are not alone. I am notifying a counselor to contact you immediately. If it’s an emergency, please call the helpline: 1800-599-0019.";
    }

    // ========================
    // Marketplace Intent
    // ========================
    else if (intentName === "MarketplaceIntent") {
      responseText =
        "Our marketplace currently has: used textbooks, calculators, and hostel essentials available. Would you like me to fetch the latest listings for you?";
    }

    // ========================
    // Mentorship Intent
    // ========================
    else if (intentName === "MentorshipIntent") {
      responseText =
        "We have mentors available in Computer Science, Mechanical, and Commerce. Please tell me your field of interest so I can match you with the right mentor.";
    }

    // Send back to Dialogflow
    res.json({ fulfillmentText: responseText });

  } catch (error) {
    console.error("Webhook error:", error);
    res.json({ fulfillmentText: "Something went wrong. Please try again later." });
  }
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
