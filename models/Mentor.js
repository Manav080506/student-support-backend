// models/Mentor.js
import mongoose from "mongoose";

const mentorSchema = new mongoose.Schema({
  mentorId: { type: String, required: true, unique: true },
  name: { type: String, required: true },        // Mentor’s name
  field: { type: String, required: true },       // e.g., Computer Science, Mechanical
  mentees: { type: [String], default: [] }       // Array of Student IDs
});

const Mentor = mongoose.models.Mentor || mongoose.model("Mentor", mentorSchema);
export default Mentor;
