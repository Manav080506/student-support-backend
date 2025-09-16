// routes/admin.js
import express from "express";
import ChatLog from "../models/ChatLog.js";

const router = express.Router();

// ... existing admin routes

// ---------- Performance Metrics ----------
router.get("/chatlogs/perf", async (req, res) => {
  try {
    const logs = await ChatLog.find({}).sort({ createdAt: -1 }).limit(500).lean();

    if (!logs.length) {
      return res.json({ message: "No chat logs yet" });
    }

    const avgLatency =
      logs.reduce((sum, l) => sum + (l.latencyMs || 0), 0) / logs.length;

    const offlineHits = logs.filter((l) => l.isOffline).length;
    const errorHits = logs.filter((l) => l.matchSource === "error").length;

    const intentCounts = {};
    logs.forEach((l) => {
      intentCounts[l.intent] = (intentCounts[l.intent] || 0) + 1;
    });

    res.json({
      totalLogs: logs.length,
      avgLatencyMs: Math.round(avgLatency),
      offlineUsagePercent: ((offlineHits / logs.length) * 100).toFixed(1) + "%",
      errorCount: errorHits,
      intents: intentCounts,
    });
  } catch (err) {
    console.error("❌ /admin/chatlogs/perf error:", err.message);
    res.status(500).json({ error: "Failed to compute performance metrics" });
  }
});

export default router;
