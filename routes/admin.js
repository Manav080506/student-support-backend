// routes/admin.js
import express from "express";
import { getCronState } from "../utils/cronState.js";
import Faq from "../models/Faq.js";
import BadgeMeta from "../models/BadgeMeta.js";
import Reminder from "../models/Reminder.js";
import ChatLog from "../models/ChatLog.js";
import syncCache from "../cron/syncCache.js";

const router = express.Router();

// Protect routes with admin key
function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-key"] || req.query.adminKey;
  if (!key || key !== (process.env.ADMIN_KEY || "admin-secret")) {
    return res.status(401).json({ error: "Unauthorized - admin key required" });
  }
  next();
}

// ---- Perf metrics ----
router.get("/perf-metrics", requireAdmin, async (req, res) => {
  try {
    const cronStats = getCronState();

    const faqCount = await Faq.countDocuments();
    const badgeMetaCount = await BadgeMeta.countDocuments();
    const reminderCount = await Reminder.countDocuments();
    const chatLogCount = await ChatLog.countDocuments();

    res.json({
      ok: true,
      dbStats: { faqCount, badgeMetaCount, reminderCount, chatLogCount },
      cronStats,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---- Manual cache sync ----
router.post("/sync-cache", requireAdmin, async (req, res) => {
  try {
    const result = await syncCache();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
