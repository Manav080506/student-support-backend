// models/ChatLog.js
import mongoose from "mongoose";

const chatLogSchema = new mongoose.Schema({
  query: { type: String, required: true },
  response: { type: String, default: null },
  intent: { type: String, default: "Fallback" },
  matchedQuestion: { type: String, default: null },
  matchSource: {
    type: String,
    enum: ["faq", "sheet", "hardcoded", "none"],
    default: "none",
  },
  similarity: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

const ChatLog = mongoose.model("ChatLog", chatLogSchema);
export default ChatLog;
