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

// ------------------- Webhook (Dialogflow) -------------------
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    if (!body.queryResult) {
      return res.type("text/plain").send("Webhook called but no queryResult found.");
    }

    const intentName = body.queryResult.intent.displayName;
    const params = body.queryResult.parameters || {};
    console.log("👉 Webhook hit | Intent:", intentName, "| Params:", JSON.stringify(params));

    let responseText = "I'm not sure how to help with that.";

    // ------------------- Finance Intent -------------------
    if (intentName === "FinanceIntent") {
      let studentId = params.studentId;

      // Handle array case: ["001"]
      if (Array.isArray(studentId)) {
        studentId = studentId[0];
      }

      // Ensure string
      if (typeof studentId === "number") {
        studentId = studentId.toString();
      }

      // Add STU prefix if missing
      if (studentId && !studentId.startsWith("STU")) {
        studentId = `STU${studentId}`;
      }

      const student = await Student.findOne({ studentId });
      responseText = student
        ? `Student ${student.name} has ₹${student.feesPending} pending fees.`
        : "I couldn’t find fee details for this student.";
    }

    // ------------------- Counseling Intent -------------------
    else if (intentName === "CounselingIntent") {
      responseText = "A counselor will reach out soon. Meanwhile, would you like self-help resources on stress and mental health?";
    }

    // ------------------- Distress Intent -------------------
    else if (intentName === "DistressIntent") {
      console.log("🚨 Distress Alert:", body.queryResult.queryText);
      responseText = "I sense you’re in distress. You are not alone. A counselor will contact you immediately. If it’s an emergency, please call 1800-599-0019.";
    }

    // ------------------- Marketplace Intent -------------------
    else if (intentName === "MarketplaceIntent") {
      responseText = "Our marketplace currently has: used textbooks, calculators, and hostel essentials.";
    }

    // ------------------- Mentorship Intent -------------------
    else if (intentName === "MentorshipIntent") {
      responseText = "We have mentors available in Computer Science, Mechanical, and Commerce. Please tell me your field of interest so I can match you with the right mentor.";
    }

    // ------------------- Parent Status Intent -------------------
    else if (intentName === "ParentStatusIntent") {
      let parentId = params.parentId;
      if (Array.isArray(parentId)) parentId = parentId[0];
      if (parentId) parentId = parentId.toUpperCase();

      const parent = await Parent.findOne({ parentId });
      if (parent) {
        const student = await Student.findOne({ studentId: parent.studentId });
        responseText = student
          ? `Hello ${parent.name} (${parent.relation}), your child ${student.name} has ₹${student.feesPending} fees pending, scored ${student.marks}, and has ${student.attendance}% attendance.`
          : "Parent found, but no linked student record.";
      } else {
        responseText = "I couldn’t find details for that parent ID.";
      }
    }

    // ------------------- Mentor Status Intent -------------------
    else if (intentName === "MentorStatusIntent") {
      let mentorId = params.mentorId;
      if (Array.isArray(mentorId)) mentorId = mentorId[0];
      if (mentorId) mentorId = mentorId.toUpperCase();

      const mentor = await Mentor.findOne({ mentorId });
      if (mentor) {
        const students = await Student.find({ studentId: { $in: mentor.mentees } });
        responseText = students.length
          ? `Hello ${mentor.name}, here are your mentees:\n` +
            students.map(s => `${s.name} → Fees: ₹${s.feesPending}, Marks: ${s.marks}, Attendance: ${s.attendance}%`).join("\n")
          : `Hello ${mentor.name}, you currently have no mentees assigned.`;
      } else {
        responseText = "I couldn’t find details for that mentor ID.";
      }
    }

    // ------------------- Default -------------------
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
