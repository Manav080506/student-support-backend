// models/Student.js
import mongoose from "mongoose";

const studentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true },
  name: String,
  feesPending: Number,
  scholarships: [String],
  marks: Number,
  attendance: Number
});

const Student = mongoose.models.Student || mongoose.model("Student", studentSchema);
export default Student;
