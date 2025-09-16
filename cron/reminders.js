// cron/reminders.js
import Reminder from "../models/Reminder.js";
import { updateCronState } from "../utils/cronState.js";

export default async function runReminders() {
  try {
    const now = new Date();
    const upcoming = await Reminder.find({
      dueAt: { $lte: now },
      completed: { $ne: true },
    }).lean();

    if (!upcoming.length) {
      console.log("📭 [Cron] No reminders due at", now.toISOString());
      updateCronState("reminders", { processed: 0 });
      return { ok: true, processed: 0 };
    }

    for (const r of upcoming) {
      console.log(`📌 [Reminder] ${r.targetId}: ${r.message}`);
      // TODO: integrate email/FCM/SMS notifications if needed
    }

    updateCronState("reminders", { processed: upcoming.length });
    return { ok: true, processed: upcoming.length };
  } catch (err) {
    console.error("❌ [Cron] runReminders error:", err?.message || err);
    updateCronState("reminders", { processed: 0, error: err.message });
    return { ok: false, error: err.message };
  }
}
