// cron/syncCache.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Faq from "../models/Faq.js";
import { fetchSimpleSheetsFaqs } from "../utils/sheets-simple.js";
import { fetchAdvancedSheetsFaqs } from "../utils/sheets-advanced.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache file path
const CACHE_FILE = path.join(process.cwd(), "data", "faqs-cache.json");

async function syncCache() {
  let all = [];

  // 1) Mongo
  try {
    const docs = await Faq.find().lean().limit(500);
    if (Array.isArray(docs)) {
      all = all.concat(
        docs.map((d) => ({
          question: d.question,
          answer: d.answer,
          source: "mongo",
        }))
      );
    }
  } catch (err) {
    console.error("❌ Error syncing from Mongo:", err.message);
  }

  // 2) Simple Sheets
  try {
    const s1 = await fetchSimpleSheetsFaqs();
    all = all.concat(s1.map((r) => ({ ...r, source: "sheets-simple" })));
  } catch (err) {
    console.error("❌ Simple Sheets sync failed:", err.message);
  }

  // 3) Advanced Sheets
  try {
    const s2 = await fetchAdvancedSheetsFaqs();
    all = all.concat(s2.map((r) => ({ ...r, source: "sheets-advanced" })));
  } catch (err) {
    console.error("❌ Advanced Sheets sync failed:", err.message);
  }

  // 4) Save to cache file
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(all, null, 2));
    console.log("✅ FAQ cache synced at", new Date().toISOString());
  } catch (err) {
    console.error("❌ Failed writing cache file:", err.message);
  }
}

export default syncCache;
