// models/Mentor.js
import mongoose from "mongoose";

const mentorSchema = new mongoose.Schema({
  mentorId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  field: { type: String, required: true },
  mentees: [String] // list of Student IDs
});

const Mentor = mongoose.model("Mentor", mentorSchema);
export default Mentor;
