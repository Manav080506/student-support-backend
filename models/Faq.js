// models/Faq.js
import mongoose from "mongoose";

const faqSchema = new mongoose.Schema({
  category: { type: String, required: true }, // e.g. "Finance", "Counseling"
  question: { type: String, required: true },
  answer: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const Faq = mongoose.models.Faq || mongoose.model("Faq", faqSchema);
export default Faq;
