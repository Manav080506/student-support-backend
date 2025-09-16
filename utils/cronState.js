// utils/cronState.js
// Tracks the last run info for each cron job

const cronState = {
  syncCache: { lastRun: null, count: 0 },
  reminders: { lastRun: null, processed: 0 },
  badges: { lastRun: null, awarded: 0 },
};

export function updateCronState(job, data = {}) {
  cronState[job] = {
    lastRun: new Date().toISOString(),
    ...data,
  };
}

export function getCronState() {
  return cronState;
}
