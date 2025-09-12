// server.js
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import Faq from "./models/Faq.js";

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
// Schema + Model
// =============================
const studentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true },
  name: String,
  feesPending: Number,
  scholarships: [{ course: String }],
  interests: [String],
});
const Student = mongoose.model("Student", studentSchema);

// =============================
// Health Route
// =============================
app.get("/", (req, res) => res.send("Student Support Backend is Running 🚀"));

// =============================
// CRUD APIs
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
// Webhook for Dialogflow
// =============================
app.post("/webhook", async (req, res) => {
  try {
    const intentName = req.body.queryResult.intent.displayName;
    let fulfillmentMessages = [];

    // Finance Intent
    if (intentName === "FinanceIntent") {
      let studentId = req.body.queryResult.parameters.studentId;
      if (studentId) {
        studentId = studentId.toString().toUpperCase();
        if (!studentId.startsWith("STU")) {
          studentId = `STU${studentId.replace("STU", "")}`;
        }
      }

      if (!studentId) {
        fulfillmentMessages.push({ text: { text: ["Please provide your Student ID (e.g., STU001)."] } });
      } else {
        const student = await Student.findOne({ studentId });
        if (student) {
          fulfillmentMessages.push({
            card: {
              title: `Fee Details`,
              subtitle: `${student.name} has ₹${student.feesPending} pending.`,
              buttons: [
                { text: "Pay Now", postback: "https://payment-portal.com" },
                { text: "Check Scholarships", postback: "ScholarshipFinder" },
              ],
            },
          });
        } else {
          fulfillmentMessages.push({ text: { text: ["I couldn’t find fee details for this student."] } });
        }
      }
    }

    // Counseling Intent
    else if (intentName === "CounselingIntent") {
      fulfillmentMessages.push({
        text: { text: ["I understand you’re seeking counseling."] },
      });
      fulfillmentMessages.push({
        text: { text: ["Would you like me to connect you with a live counselor or share self-help resources?"] },
      });
      fulfillmentMessages.push({
        quickReplies: {
          title: "Choose an option:",
          quickReplies: ["Connect me to counselor", "Share resources"],
        },
      });
    }

    // Distress Intent
    else if (intentName === "DistressIntent") {
      const distressLog = {
        studentId: req.body.queryResult.parameters.studentId || "unknown",
        message: req.body.queryResult.queryText,
        timestamp: new Date(),
      };
      console.log("🚨 Distress Alert:", distressLog);

      fulfillmentMessages.push({
        text: {
          text: [
            "💙 I sense you’re in distress. You are not alone.",
            "I’ve flagged this for our counselor team to reach out.",
            "If it’s an emergency, please call the helpline: 1800-599-0019",
          ],
        },
      });
      fulfillmentMessages.push({
        quickReplies: {
          title: "Would you like me to share stress relief tips?",
          quickReplies: ["Yes, show tips", "No, thanks"],
        },
      });
    }

    // Marketplace Intent
    else if (intentName === "MarketplaceIntent") {
      fulfillmentMessages.push({
        card: {
          title: "Campus Marketplace",
          subtitle: "Currently available items:",
          buttons: [
            { text: "Books", postback: "Books section" },
            { text: "Electronics", postback: "Electronics section" },
            { text: "Hostel Essentials", postback: "Essentials section" },
          ],
        },
      });
    }

    // Mentorship Intent
    else if (intentName === "MentorshipIntent") {
      fulfillmentMessages.push({
        text: { text: ["We have mentors available in Computer Science, Mechanical, and Commerce."] },
      });
      fulfillmentMessages.push({
        quickReplies: {
          title: "Which stream are you interested in?",
          quickReplies: ["Computer Science", "Mechanical", "Commerce"],
        },
      });
    }

    // Default fallback
    else {
      fulfillmentMessages.push({
        text: { text: ["I can guide you in Finance, Counseling, Mentorship, Marketplace, or Distress support."] },
      });
    }

    // Send back to Dialogflow
    res.json({ fulfillmentMessages });
  } catch (error) {
    console.error("Webhook error:", error);
    res.json({
      fulfillmentText: "Something went wrong. Please try again later.",
    });
  }
});

// =============================
// Start Server
// =============================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
