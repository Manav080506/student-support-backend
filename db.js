// db.js
import mongoose from "mongoose";

const studentSchema = new mongoose.Schema({
  studentId: String,
  name: String,
  feesPending: Number,
  scholarships: [String],
});

const parentSchema = new mongoose.Schema({
  parentId: String,
  child: String,
  attendance: String,
  marks: String,
  feesPending: Number,
});

const mentorSchema = new mongoose.Schema({
  mentorId: String,
  mentees: [String],
});

export const Student = mongoose.model("Student", studentSchema);
export const Parent = mongoose.model("Parent", parentSchema);
export const Mentor = mongoose.model("Mentor", mentorSchema);
