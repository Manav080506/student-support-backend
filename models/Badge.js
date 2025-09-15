// models/Badge.js
import mongoose from "mongoose";

const badgeSchema = new mongoose.Schema({
  studentId: { type: String, required: true, index: true },
  badgeName: { type: String, required: true },
  reason: { type: String, default: "" },
  awardedAt: { type: Date, default: () => new Date() },
});

const Badge = mongoose.models.Badge || mongoose.model("Badge", badgeSchema);
export default Badge;
