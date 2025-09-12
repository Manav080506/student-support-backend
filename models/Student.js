// models/Student.js
import mongoose from "mongoose";

const studentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  feesPending: { type: Number, default: 0 },
  scholarships: [{ course: String }],
  interests: [String],
});

const Student = mongoose.model("Student", studentSchema);
export default Student;
