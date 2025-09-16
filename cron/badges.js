// cron/badges.js
import ChatLog from "../models/ChatLog.js";
import Badge from "../models/Badge.js";

export default async function runBadges() {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Count chat logs by student in last week
    const pipeline = [
      { $match: { createdAt: { $gte: oneWeekAgo } } },
      { $group: { _id: "$studentId", chats: { $sum: 1 } } },
    ];
    const stats = await ChatLog.aggregate(pipeline);

    let awarded = 0;
    for (const s of stats) {
      if (s.chats >= 5) {
        await Badge.create({
          studentId: s._id || "GENERIC",
          badgeName: "Consistency Badge",
          reason: "5+ interactions in last week",
        }).catch(() => {});
        awarded++;
      }
    }

    console.log(`🏅 [Cron] Awarded ${awarded} consistency badges`);
    return { ok: true, awarded };
  } catch (err) {
    console.error("❌ [Cron] runBadges error:", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}
