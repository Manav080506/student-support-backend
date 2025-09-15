// models/BadgeMeta.js
import mongoose from "mongoose";

const badgeMetaSchema = new mongoose.Schema({
  badgeName: { type: String, required: true, unique: true },
  description: { type: String, default: "" },
  icon: { type: String, default: "🏅" },
});

const BadgeMeta = mongoose.models.BadgeMeta || mongoose.model("BadgeMeta", badgeMetaSchema);
export default BadgeMeta;
