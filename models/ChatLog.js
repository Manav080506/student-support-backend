// models/ChatLog.js
import mongoose from "mongoose";

const chatLogSchema = new mongoose.Schema({
  query: { type: String, required: true },
  response: { type: String, required: true },
  intent: { type: String, required: true },
  matchedQuestion: { type: String, default: null },
  matchSource: { type: String, default: "none" },
  similarity: { type: Number, default: 0 },
  affirmation: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

const ChatLog = mongoose.models.ChatLog || mongoose.model("ChatLog", chatLogSchema);
export default ChatLog;
