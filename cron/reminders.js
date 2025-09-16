// cron/reminders.js
import Reminder from "../models/Reminder.js";

export default async function runReminders() {
  try {
    const now = new Date();
    const upcoming = await Reminder.find({
      dueAt: { $lte: now },        // due reminders
      completed: { $ne: true },    // not already completed
    }).lean();

    if (!upcoming.length) {
      console.log("📭 [Cron] No reminders due at", now.toISOString());
      return { ok: true, processed: 0 };
    }

    for (const r of upcoming) {
      console.log(`📌 [Reminder] ${r.targetId}: ${r.message}`);
      // TODO: optionally integrate email/FCM/SMS push here
    }

    return { ok: true, processed: upcoming.length };
  } catch (err) {
    console.error("❌ [Cron] runReminders error:", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}
