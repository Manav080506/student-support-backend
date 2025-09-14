// models/Reminder.js
import mongoose from "mongoose";

const reminderSchema = new mongoose.Schema({
  type: { type: String, required: true }, // finance, mentorship, parent, health, badge
  message: { type: String, required: true },
  targetId: { type: String, default: "GENERIC" }, // studentId, parentId, mentorId
  createdAt: { type: Date, default: Date.now }
});

const Reminder = mongoose.model("Reminder", reminderSchema);
export default Reminder;
