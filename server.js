// server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// ✅ Connect to MongoDB Atlas
const mongoURI = process.env.MONGODB_URI; // from Render Environment
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("✅ MongoDB Connected"))
.catch((err) => console.error("❌ MongoDB connection error:", err));

// ✅ Define Schema
const studentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true },
  name: String,
  feesPending: Number,
  scholarships: [{ course: String }],
  interests: [String]
});

const Student = mongoose.model("Student", studentSchema);

// ✅ Routes
app.get("/", (req, res) => {
  res.send("Student Support Backend is Running 🚀");
});

// Get all students
app.get("/students", async (req, res) => {
  try {
    const students = await Student.find();
    res.json(students);
  } catch (err) {
    console.error("Error fetching students:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get student by ID
app.get("/students/:id", async (req, res) => {
  try {
    const student = await Student.findOne({ studentId: req.params.id });
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }
    res.json(student);
  } catch (err) {
    console.error("Error fetching student:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Start Server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
