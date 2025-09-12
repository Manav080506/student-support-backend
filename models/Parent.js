// models/Parent.js
import mongoose from "mongoose";

const parentSchema = new mongoose.Schema({
  parentId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  relation: String, // e.g., Father, Mother
  studentId: { type: String, required: true } // link to Student
});

const Parent = mongoose.model("Parent", parentSchema);
export default Parent;
