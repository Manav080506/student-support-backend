// cron/test-cron.js
import dotenv from "dotenv";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";

import Student from "../models/Student.js";
import Parent from "../models/Parent.js";
import Mentor from "../models/Mentor.js";
import Reminder from "../models/Reminder.js";
import Badge from "../models/Badge.js";
import { refreshFaqCache } from "../utils/getFaqData.js";
import { loadKeywordFaqs } from "../utils/getKeywordFaq.js";

dotenv.config();

async function runSyncCache() {
  try {
    console.log("⏳ Syncing FAQ + keyword cache...");
    await refreshFaqCache();
    await loadKeywordFaqs();

    const cacheFile = path.join(process.cwd(), "data", "faqs-cache.json");
    const payload = {
      ts: new Date(),
      faqs: "refreshed",
      keywords: "refreshed",
    };
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(payload, null, 2));
    console.log("✅ Cache synced and written to", cacheFile);
  } catch (err) {
    console.error("❌ Sync cache failed:", err.message || err);
  }
}

async function runReminders() {
  try {
    console.log("⏳ Running finance reminders...");
    const studs = await Student.find({ feesPending: { $gt: 0 } }).lean();
    for (const s of studs) {
      const message = `⚠️ Reminder: ${s.name} has pending fees of ₹${s.feesPending}`;
      await Reminder.create({ type: "finance", message, targetId: s.studentId, createdAt: new Date() });
      console.log("📌", message);
    }

    console.log("⏳ Running mentor nudges...");
    const mlist = await Mentor.find({}).lean();
    for (const m of mlist) {
      const message = `👨‍🏫 Mentor ${m.mentorId} has ${m.mentees?.length || 0} mentees. Check progress!`;
      await Reminder.create({ type: "mentorship", message, targetId: m.mentorId, createdAt: new Date() });
      console.log("📌", message);
    }

    console.log("⏳ Running parent weekly reports...");
    const plist = await Parent.find({}).lean();
    for (const p of plist) {
      const child = await Student.findOne({ studentId: p.studentId }).lean();
      const message = `📊 Weekly Report - Child: ${child?.name || p.studentId}, Attendance: ${child?.attendance ?? "N/A"}, Marks: ${child?.marks ?? "N/A"}`;
      await Reminder.create({ type: "parent", message, targetId: p.parentId, createdAt: new Date() });
      console.log("📌", message);
    }

    console.log("✅ Reminders done");
  } catch (err) {
    console.error("❌ Reminders failed:", err.message || err);
  }
}

async function runBadges() {
  try {
    console.log("⏳ Awarding consistency badges...");
    const message = "🎖️ Consistency Badge awarded for daily engagement!";
    await Reminder.create({ type: "badge", message, targetId: "GENERIC", createdAt: new Date() });
    await Badge.create({ studentId: "GENERIC", badgeName: "Consistency Badge", reason: "Daily engagement" });
    console.log("🏅", message);
    console.log("✅ Badges done");
  } catch (err) {
    console.error("❌ Badges failed:", err.message || err);
  }
}

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/student-support", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB");

    await runSyncCache();
    await runReminders();
    await runBadges();

    console.log("🎉 All cron jobs executed once.");
    process.exit(0);
  } catch (err) {
    console.error("❌ test-cron.js failed:", err.message || err);
    process.exit(1);
  }
}

main();
