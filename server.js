// server.js (full, ES module)
import express from "express";
import mongoose from "mongoose";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors());

// ===============================
// MongoDB connection
// ===============================
const mongoURI = process.env.MONGODB_URI;
mongoose
  .connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ===============================
// Schema + model
// ===============================
const studentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true },
  name: String,
  feesPending: Number,
  scholarships: [{ course: String }],
  interests: [String],
});
const Student = mongoose.model("Student", studentSchema);

// ===============================
// Health Route
// ===============================
app.get("/", (req, res) => res.send("Student Support Backend is Running 🚀"));

// ===============================
// CRUD Routes for Students
// ===============================

// READ - all students
app.get("/students", async (req, res) => {
  try {
    const students = await Student.find();
    res.json(students);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// READ - single student
app.get("/students/:id", async (req, res) => {
  try {
    const student = await Student.findOne({ studentId: req.params.id });
    if (!student) return res.status(404).json({ error: "Student not found" });
    res.json(student);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// CREATE - add new student
app.post("/students", async (req, res) => {
  try {
    const {
      studentId,
      name,
      feesPending = 0,
      scholarships = [],
      interests = [],
    } = req.body;

    if (!studentId || !name)
      return res
        .status(400)
        .json({ error: "studentId and name are required" });

    const exists = await Student.findOne({ studentId });
    if (exists)
      return res.status(409).json({ error: "Student already exists" });

    const student = new Student({
      studentId,
      name,
      feesPending,
      scholarships,
      interests,
    });

    await student.save();
    res.status(201).json({ message: "Student created", student });
  } catch (err) {
    console.error("Error creating student:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// UPDATE - modify student
app.put("/students/:id", async (req, res) => {
  try {
    const updates = req.body;
    const student = await Student.findOneAndUpdate(
      { studentId: req.params.id },
      { $set: updates },
      { new: true }
    );
    if (!student) return res.status(404).json({ error: "Student not found" });
    res.json({ message: "Updated", student });
  } catch (err) {
    console.error("Error updating:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE - remove student
app.delete("/students/:id", async (req, res) => {
  try {
    const deleted = await Student.findOneAndDelete({
      studentId: req.params.id,
    });
    if (!deleted)
      return res.status(404).json({ error: "Student not found" });
    res.json({ message: "Deleted", student: deleted });
  } catch (err) {
    console.error("Error deleting:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ===============================
// Webhook for Dialogflow
// ===============================
app.post("/webhook", async (req, res) => {
  try {
    const intentName = req.body.queryResult.intent.displayName;
    const params = req.body.queryResult.parameters || {};
    let responseText = "I'm not sure how to help with that.";

    // Finance / Fees Intent
    if (intentName === "CheckFees" || intentName === "FinanceIntent") {
      const studentId = params.studentId;
      if (!studentId) {
        responseText = "Please provide your student ID (e.g., STU001).";
      } else {
        const student = await Student.findOne({ studentId });
        if (student) {
          responseText = `${student.name}, your pending fees are ₹${student.feesPending}.`;
        } else {
          responseText = `No record found for ${studentId}.`;
        }
      }
    }

    // Scholarship Intent
    else if (intentName === "ScholarshipFinder") {
      responseText =
        "I can search scholarships. Please tell me your course and family income.";
    }

    // Counseling Intent
    else if (intentName === "CounselingIntent") {
      responseText =
        "I understand you’re seeking counseling. A counselor will reach out soon. Meanwhile, would you like self-help resources on stress and mental health?";
    }

    // Distress Intent
    else if (intentName === "DistressIntent") {
      const distressLog = {
        studentId: params.studentId || "unknown",
        message: req.body.queryResult.queryText,
        timestamp: new Date(),
      };
      console.log("🚨 Distress Alert:", distressLog);

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

    // Send response back to Dialogflow
    res.json({ fulfillmentText: responseText });
  } catch (error) {
    console.error("Webhook error:", error);
    res.json({
      fulfillmentText: "Something went wrong. Please try again later.",
    });
  }
});

// ===============================
// Start Server
// ===============================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
