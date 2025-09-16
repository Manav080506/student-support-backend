// cron/syncCache.js
import fs from "fs";
import path from "path";
import { refreshFaqCache } from "../utils/getFaqData.js";

const CACHE_FILE = path.join(process.cwd(), "data", "faqs-cache.json");

function ensureDir() {
  const dir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log("📂 Created missing data/ directory");
  }
}

export default async function syncCache() {
  try {
    console.log("⏳ [Cron] Refreshing FAQ cache...");
    const allFaqs = await refreshFaqCache();

    ensureDir();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(allFaqs, null, 2), "utf8");

    console.log(`✅ [Cron] Cached ${allFaqs.length} FAQs to ${CACHE_FILE}`);
  } catch (err) {
    console.error("❌ [Cron] Failed writing cache file:", err.message);
  }
}
