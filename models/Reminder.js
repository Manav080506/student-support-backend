// models/Reminder.js
import mongoose from "mongoose";

const reminderSchema = new mongoose.Schema({
  type: { type: String, required: true },
  message: { type: String, required: true },
  targetId: { type: String, default: "GENERIC" },
  createdAt: { type: Date, default: Date.now },
});

const Reminder = mongoose.models.Reminder || mongoose.model("Reminder", reminderSchema);
export default Reminder;
