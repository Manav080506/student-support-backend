import mongoose from "mongoose";

const ChatLogSchema = new mongoose.Schema({
  query: String,
  response: String,
  intent: String,
  matchedQuestion: { type: String, default: null },
  matchSource: { type: String, default: "none" },
  similarity: { type: Number, default: 0 },
  affirmation: { type: String, default: null }, // 👈 NEW FIELD
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("ChatLog", ChatLogSchema);
