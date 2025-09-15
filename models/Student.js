// models/Student.js
import mongoose from "mongoose";

const studentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true }, // STU001, STU002...
  name: { type: String, required: true },
  feesPending: { type: Number, default: 0 },
  scholarships: { type: [String], default: [] }
});

const Student = mongoose.models.Student || mongoose.model("Student", studentSchema);
export default Student;
