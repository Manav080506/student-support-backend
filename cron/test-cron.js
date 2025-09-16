// cron/test-cron.js
import dotenv from "dotenv";
import mongoose from "mongoose";

import syncCache from "./syncCache.js";
import runReminders from "./reminders.js";
import runBadges from "./badges.js";

dotenv.config();

async function main() {
  try {
    // 1. Connect to MongoDB
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/student-support",
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }
    );
    console.log("✅ Connected to MongoDB");

    // 2. Run cron jobs
    console.log("⏳ Running syncCache...");
    await syncCache();

    console.log("⏳ Running reminders...");
    await runReminders();

    console.log("⏳ Running badges...");
    await runBadges();

    // 3. Done
    console.log("🎉 All cron jobs executed once.");
    process.exit(0);
  } catch (err) {
    console.error("❌ test-cron.js failed:", err.message || err);
    process.exit(1);
  }
}

main();
