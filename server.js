// server.js (full, ES module)
import express from "express";
import mongoose from "mongoose";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors());

// MongoDB connection (MONGODB_URI must be in Render env)
const mongoURI = process.env.MONGODB_URI;
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
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

// Health
app.get("/", (req, res) => res.send("Student Support Backend is Running 🚀"));

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

// READ - single
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

// CREATE - POST /students
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
    console.error("Error creating student:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// UPDATE - PUT /students/:id
app.put("/students/:id", async (req, res) => {
  try {
    const updates = req.body;
    const student = await Student.findOneAndUpdate({ studentId: req.params.id }, { $set: updates }, { new: true });
    if (!student) return res.status(404).json({ error: "Student not found" });
    res.json({ message: "Updated", student });
  } catch (err) {
    console.error("Error updating:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE - DELETE /students/:id
app.delete("/students/:id", async (req, res) => {
  try {
    const deleted = await Student.findOneAndDelete({ studentId: req.params.id });
    if (!deleted) return res.status(404).json({ error: "Student not found" });
    res.json({ message: "Deleted", student: deleted });
  } catch (err) {
    console.error("Error deleting:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/*
  Webhook for Dialogflow (simple)
  - Dialogflow sends POST requests with body.queryResult
  - We expect a parameter 'studentId' OR the bot will ask to provide it
  - Optionally verify a secret header: X-WEBHOOK-SECRET (set in Render env)
*/
app.post("/webhook", async (req, res) => {
  try {
    // optional: check header
    const secret = process.env.WEBHOOK_SECRET; // set this in Render env if you want
    if (secret) {
      const incoming = req.header("X-WEBHOOK-SECRET");
      if (!incoming || incoming !== secret) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    const body = req.body;
    const intent = body?.queryResult?.intent?.displayName || body?.queryResult?.intent;
    const params = body?.queryResult?.parameters || {};

    // example intent names: "CheckFees", "ScholarshipFinder"
    if (intent === "CheckFees" || intent === "CheckFees - fallback") {
      const sid = params.studentId || params.student_id || params.roll || null;
      if (!sid) {
        // ask for student id
        return res.json({ fulfillmentText: "Please provide your student ID (e.g. STU001)." });
      }
      const student = await Student.findOne({ studentId: sid });
      if (!student) return res.json({ fulfillmentText: `No record found for ${sid}.` });
      const text = `${student.name}, your pending fees are ₹${student.feesPending}.`;
      return res.json({ fulfillmentText: text });
    }

    if (intent === "ScholarshipFinder") {
      // optionally use params (course, income, category)
      // a simple reply:
      return res.json({ fulfillmentText: "I can search scholarships. Tell me your course and family income." });
    }

    // fallback/default
    return res.json({ fulfillmentText: "Sorry, I didn't understand. I can check fees, scholarships, or connect you to counseling." });

  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ fulfillmentText: "Server error in webhook." });
  }
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
