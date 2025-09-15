// models/Parent.js
import mongoose from "mongoose";

const parentSchema = new mongoose.Schema({
  parentId: { type: String, required: true, unique: true },
  name: { type: String, required: true },        // Parent’s name
  relation: { type: String, default: "Parent" }, // Father, Mother, etc.
  studentId: { type: String, required: true }    // Link to Student.studentId
});

const Parent = mongoose.models.Parent || mongoose.model("Parent", parentSchema);
export default Parent;
