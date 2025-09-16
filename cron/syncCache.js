// cron/syncCache.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Faq from "../models/Faq.js";
import { fetchSimpleSheetsFaqs } from "../utils/sheets-simple.js";
import { fetchAdvancedSheetsFaqs } from "../utils/sheets-advanced.js";
import { updateCronState } from "../utils/cronState.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_FILE = path.join(process.cwd(), "data", "faqs-cache.json");

export default async function syncCache() {
  let all = [];

  try {
    // 1) Mongo
    const docs = await Faq.find().lean().limit(500);
    all = all.concat(docs.map((d) => ({
      question: d.question,
      answer: d.answer,
      source: "mongo"
    })));
  } catch (err) {
    console.error("❌ [Cron] Mongo sync failed:", err.message);
  }

  try {
    // 2) Simple Sheets
    const s1 = await fetchSimpleSheetsFaqs();
    all = all.concat(s1.map((r) => ({ ...r, source: "sheets-simple" })));
  } catch (err) {
    console.error("❌ [Cron] Simple Sheets sync failed:", err.message);
  }

  try {
    // 3) Advanced Sheets
    const s2 = await fetchAdvancedSheetsFaqs();
    all = all.concat(s2.map((r) => ({ ...r, source: "sheets-advanced" })));
  } catch (err) {
    console.error("❌ [Cron] Advanced Sheets sync failed:", err.message);
  }

  // Save to file
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(all, null, 2));
    console.log(`✅ [Cron] FAQ cache synced (${all.length} FAQs)`);
    updateCronState("syncCache", { count: all.length });
  } catch (err) {
    console.error("❌ [Cron] Failed writing cache file:", err.message);
    updateCronState("syncCache", { count: 0, error: err.message });
  }

  return { ok: true, count: all.length };
}
