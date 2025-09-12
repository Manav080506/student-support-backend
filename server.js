// server.js (students + parents + mentors + improved responses + APIs)
import express from "express";
import mongoose from "mongoose";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors());

// ==================
// MongoDB connection
// ==================
const mongoURI = process.env.MONGODB_URI;
mongoose
  .connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ==================
// Student Schema
// ==================
const studentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true },
  name: String,
  feesPending: Number,
  marks: Number,
  attendance: Number,
  scholarships: [{ course: String }],
  interests: [String],
});
const Student = mongoose.model("Student", studentSchema);

// ==================
// Parent Schema
// ==================
const parentSchema = new mongoose.Schema({
  parentId: { type: String, required: true, unique: true },
  name: String,
  relation: String, // Father, Mother, etc.
  studentId: { type: String, required: true }, // linked student
});
const Parent = mongoose.model("Parent", parentSchema);

// ==================
// Mentor Schema
// ==================
const mentorSchema = new mongoose.Schema({
  mentorId: { type: String, required: true, unique: true },
  name: String,
  field: String, // e.g., Computer Science
  mentees: [String], // list of studentIds
});
const Mentor = mongoose.model("Mentor", mentorSchema);

// ==================
// Health Route
// ==================
app.get("/", (req, res) => res.send("Student Support Backend is Running 🚀"));

// ==================
// Mentor APIs
// ==================

// Create a new mentor
app.post("/mentors", async (req, res) => {
  try {
    const { mentorId, name, field, mentees = [] } = req.body;
    if (!mentorId || !name || !field)
      return res.status(400).json({ error: "mentorId, name, and field required" });

    const exists = await Mentor.findOne({ mentorId });
    if (exists) return res.status(409).json({ error: "Mentor already exists" });

    const mentor = new Mentor({ mentorId, name, field, mentees });
    await mentor.save();
    res.status(201).json({ message: "Mentor created", mentor });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Get all mentors
app.get("/mentors", async (req, res) => {
  try {
    const mentors = await Mentor.find();
    res.json(mentors);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Get mentor by ID
app.get("/mentors/:id", async (req, res) => {
  try {
    const mentor = await Mentor.findOne({ mentorId: req.params.id });
    if (!mentor) return res.status(404).json({ error: "Mentor not found" });
    res.json(mentor);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Get mentor's mentee status
app.get("/mentors/:id/status", async (req, res) => {
  try {
    const mentor = await Mentor.findOne({ mentorId: req.params.id });
    if (!mentor) return res.status(404).json({ error: "Mentor not found" });

    if (mentor.mentees.length === 0) {
      return res.json({ message: "No mentees assigned to this mentor." });
    }

    const students = await Student.find({ studentId: { $in: mentor.mentees } });
    res.json({
      mentor: mentor.name,
      field: mentor.field,
      mentees: students.map((s) => ({
        name: s.name,
        studentId: s.studentId,
        feesPending: s.feesPending,
        attendance: s.attendance,
        marks: s.marks,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ==================
// Dialogflow Webhook
// ==================
app.post("/webhook", async (req, res) => {
  try {
    const intentName = req.body.queryResult.intent.displayName;
    const params = req.body.queryResult.parameters || {};
    let responseText = "I’m not sure how to help with that.";

    // Finance Intent (Student)
    if (intentName === "FinanceIntent") {
      const studentId = params.studentId?.toUpperCase();
      if (!studentId) {
        responseText = "Please provide your Student ID (e.g., STU001) so I can check the fees.";
      } else {
        const student = await Student.findOne({ studentId });
        if (student) {
          responseText = `Hey ${student.name}, I checked your record 📂. You currently have ₹${student.feesPending} pending fees. Would you like me to also check scholarships that can help reduce it?`;
        } else {
          responseText = `I couldn’t find details for Student ID ${studentId}. Please double-check and try again.`;
        }
      }
    }

    // Parent Status Intent
    else if (intentName === "ParentStatusIntent") {
      const parentId = params.parentId?.toUpperCase();
      if (!parentId) {
        responseText = "Please provide your Parent ID so I can check your child’s status.";
      } else {
        const parent = await Parent.findOne({ parentId });
        if (!parent) {
          responseText = `I couldn’t find details for Parent ID ${parentId}.`;
        } else {
          const student = await Student.findOne({ studentId: parent.studentId });
          if (student) {
            responseText = `Hello ${parent.name} (${parent.relation}), your child ${student.name} has ₹${student.feesPending} pending fees, ${student.attendance}% attendance, and scored ${student.marks} marks.`;
          } else {
            responseText = "Linked student record not found.";
          }
        }
      }
    }

    // Mentor Status Intent
    else if (intentName === "MentorStatusIntent") {
      const mentorId = params.mentorId?.toUpperCase();
      if (!mentorId) {
        responseText = "Please provide your Mentor ID so I can check your mentees’ status.";
      } else {
        const mentor = await Mentor.findOne({ mentorId });
        if (!mentor) {
          responseText = `I couldn’t find details for Mentor ID ${mentorId}.`;
        } else {
          if (mentor.mentees.length === 0) {
            responseText = `Mentor ${mentor.name}, you currently have no assigned mentees.`;
          } else {
            const students = await Student.find({ studentId: { $in: mentor.mentees } });
            if (students.length === 0) {
              responseText = `No records found for your mentees.`;
            } else {
              const menteeDetails = students
                .map(
                  (s) =>
                    `${s.name} → Fees Pending: ₹${s.feesPending}, Attendance: ${s.attendance}%, Marks: ${s.marks}`
                )
                .join("\n");
              responseText = `Hello ${mentor.name} 👩‍🏫 (Field: ${mentor.field}), here are your mentees’ details:\n${menteeDetails}`;
            }
          }
        }
      }
    }

    // Counseling Intent
    else if (intentName === "CounselingIntent") {
      responseText =
        "I understand you’re seeking counseling 💬. A counselor will reach out shortly. Meanwhile, would you like me to share some self-help resources on stress and mental health?";
    }

    // Distress Intent
    else if (intentName === "DistressIntent") {
      responseText =
        "⚠️ I hear you’re going through something tough. You are not alone. I’m notifying a counselor immediately. If this is an emergency, please call the helpline: 1800-599-0019. Would you like me to also send calming self-help tips?";
    }

    // Marketplace Intent
    else if (intentName === "MarketplaceIntent") {
      responseText =
        "🛒 Our marketplace currently has used textbooks, calculators, and hostel essentials available. Do you want me to fetch the latest listings for you?";
    }

    // Mentorship Intent (Student side)
    else if (intentName === "MentorshipIntent") {
      responseText =
        "👩‍🏫 We have mentors in Computer Science, Mechanical, and Commerce. Which area excites you the most so I can match you with the right mentor?";
    }

    // Fallback Intent
    else if (intentName === "Default Fallback Intent") {
      responseText =
        "🤔 I didn’t quite get that. But I can help with **fees, scholarships, counseling, mentorship, or the student marketplace**. Which one would you like to explore?";
    }

    res.json({ fulfillmentText: responseText });
  } catch (error) {
    console.error("Webhook error:", error);
    res.json({ fulfillmentText: "Something went wrong. Please try again later." });
  }
});

// ==================
// Start Server
// ==================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
