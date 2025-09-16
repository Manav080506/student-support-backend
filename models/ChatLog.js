// models/ChatLog.js
import mongoose from "mongoose";

const chatLogSchema = new mongoose.Schema({
  query: String,
  response: String,
  intent: String,
  matchedQuestion: String,
  matchSource: { type: String, default: "none" },
  similarity: { type: Number, default: 0 },
  affirmation: String,
  latencyMs: Number,          // ⏱ time taken
  isOffline: { type: Boolean, default: false }, // ⚠️ was it from local cache?
  error: String,              // ❌ error message if any
  createdAt: { type: Date, default: Date.now }
});

const ChatLog = mongoose.model("ChatLog", chatLogSchema);
export default ChatLog;
