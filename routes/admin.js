// routes/admin.js
import express from "express";
import ChatLog from "../models/ChatLog.js";
import Faq from "../models/Faq.js";
import Badge from "../models/Badge.js";
import Reminder from "../models/Reminder.js";
import BadgeMeta from "../models/BadgeMeta.js";
import Student from "../models/Student.js";

const router = express.Router();

// ---------- Combined Dashboard ----------
router.get("/dashboard/perf", async (req, res) => {
  try {
    // Basic counts
    const [faqCount, badgeCount, reminderCount, chatlogCount, badgeMetaCount, studentCount] =
      await Promise.all([
        Faq.countDocuments(),
        Badge.countDocuments(),
        Reminder.countDocuments(),
        ChatLog.countDocuments(),
        BadgeMeta.countDocuments(),
        Student.countDocuments(),
      ]);

    // Performance metrics (last 500 logs)
    const logs = await ChatLog.find({}).sort({ createdAt: -1 }).limit(500).lean();

    let avgLatency = 0,
      offlineHits = 0,
      errorHits = 0,
      intentCounts = {};
    if (logs.length) {
      avgLatency = logs.reduce((sum, l) => sum + (l.latencyMs || 0), 0) / logs.length;
      offlineHits = logs.filter((l) => l.isOffline).length;
      errorHits = logs.filter((l) => l.matchSource === "error").length;
      logs.forEach((l) => {
        intentCounts[l.intent] = (intentCounts[l.intent] || 0) + 1;
      });
    }

    res.json({
      counts: {
        faqCount,
        badgeCount,
        reminderCount,
        chatlogCount,
        badgeMetaCount,
        studentCount,
      },
      performance: {
        totalLogs: logs.length,
        avgLatencyMs: Math.round(avgLatency),
        offlineUsagePercent: logs.length
          ? ((offlineHits / logs.length) * 100).toFixed(1) + "%"
          : "0%",
        errorCount: errorHits,
        intents: intentCounts,
      },
    });
  } catch (err) {
    console.error("❌ /admin/dashboard/perf error:", err.message);
    res.status(500).json({ error: "Failed to compute dashboard metrics" });
  }
});

export default router;
