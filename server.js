import express from "express";
import mongoose from "mongoose";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Connect using environment variable MONGODB_URI (set later in Render)
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.warn("Warning: MONGODB_URI is not set. The app will fail to connect until it is provided.");
}
mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(()=>console.log("Connected to MongoDB"))
  .catch(err=>console.error("MongoDB connect error:", err));

// Define Student model
const studentSchema = new mongoose.Schema({
  studentId: String,
  name: String,
  feesPending: Number,
  scholarships: Array,
  interests: Array
});
const Student = mongoose.model("Student", studentSchema);

// Root - health check
app.get("/", (req, res) => {
  res.send("Student Support Backend is Running 🚀");
});

// Simple GET endpoint: get student by ID
app.get("/students/:id", async (req, res) => {
  try {
    const student = await Student.findOne({ studentId: req.params.id });
    if (!student) return res.status(404).json({ error: "Student not found" });
    res.json(student);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Dialogflow webhook endpoint
// Dialogflow ES sends JSON with queryResult.parameters
app.post("/webhook", async (req, res) => {
  try {
    // Try to get studentId from parameters or fallback
    const studentId =
      req.body?.queryResult?.parameters?.studentId ||
      req.body?.studentId ||
      "STU001"; // default for demo

    const student = await Student.findOne({ studentId });
    if (!student) {
      return res.json({ fulfillmentText: "Sorry, I could not find your record." });
    }

    const reply = `${student.name}, you have ₹${student.feesPending} pending.`;
    return res.json({ fulfillmentText: reply });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.json({ fulfillmentText: "Sorry, something went wrong." });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
