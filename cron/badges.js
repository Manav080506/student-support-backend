// cron/badges.js
import ChatLog from "../models/ChatLog.js";
import Badge from "../models/Badge.js";
import { updateCronState } from "../utils/cronState.js";

export default async function runBadges() {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Count chat logs per student in last week
    const stats = await ChatLog.aggregate([
      { $match: { createdAt: { $gte: oneWeekAgo } } },
      { $group: { _id: "$studentId", chats: { $sum: 1 } } },
    ]);

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
    updateCronState("badges", { awarded });
    return { ok: true, awarded };
  } catch (err) {
    console.error("❌ [Cron] runBadges error:", err?.message || err);
    updateCronState("badges", { awarded: 0, error: err.message });
    return { ok: false, error: err.message };
  }
}
