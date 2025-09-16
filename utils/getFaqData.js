// utils/getFaqData.js
import fs from "fs";
import path from "path";
import Faq from "../models/Faq.js";
import { fetchSimpleSheetsFaqs } from "./sheets-simple.js";
import { fetchAdvancedSheetsFaqs } from "./sheets-advanced.js";

const LOCAL_FAQ_PATH = path.join(process.cwd(), "utils", "localFaqs.json");
const CACHE_FILE = path.join(process.cwd(), "data", "faqs-cache.json");
const CACHE_TTL = Number(process.env.FAQ_CACHE_TTL_MS || 1000 * 60 * 5); // 5 min

let cache = { ts: 0, data: [] };

function tokenize(text = "") {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function scoreMatch(query, qText, aText) {
  const qTokens = tokenize(query);
  if (!qTokens.length) return 0;

  const qTextLower = qText.toLowerCase();
  let score = 0;

  if (qTextLower.includes(query.toLowerCase())) score += 2;

  const qTokensSet = new Set(tokenize(qText));
  const matches = qTokens.filter((t) => qTokensSet.has(t)).length;
  score += matches / qTokens.length;

  const aTokensSet = new Set(tokenize(aText));
  const aMatches = qTokens.filter((t) => aTokensSet.has(t)).length;
  score += (aMatches / qTokens.length) * 0.5;

  return score;
}

async function loadAllSources(force = false) {
  if (!force && Date.now() - cache.ts < CACHE_TTL && cache.data.length) {
    return cache.data;
  }

  let all = [];

  // 0) cached JSON file
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, "utf8");
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        all = all.concat(arr.map((r) => ({ ...r, source: "cache-file" })));
        console.log(`📂 Loaded ${arr.length} FAQs from cache file`);
      }
    }
  } catch (err) {
    console.warn("⚠️ Could not read cache file:", err.message);
  }

  // 1) local JSON
  try {
    const raw = fs.readFileSync(LOCAL_FAQ_PATH, "utf8");
    const arr = JSON.parse(raw);
    if (Array.isArray(arr))
      all = all.concat(arr.map((r) => ({ ...r, source: "local" })));
  } catch {
    console.warn("⚠️ No localFaqs.json found, skipping...");
  }

  // 2) mongo
  try {
    const docs = await Faq.find().lean().limit(500);
    if (Array.isArray(docs))
      all = all.concat(
        docs.map((d) => ({
          question: d.question,
          answer: d.answer,
          source: "mongo",
        }))
      );
  } catch (err) {
    console.error("❌ Error loading FAQs from mongo:", err.message);
  }

  // 3) simple sheets
  try {
    const s1 = await fetchSimpleSheetsFaqs();
    all = all.concat(s1.map((r) => ({ ...r, source: "sheets-simple" })));
  } catch (err) {
    console.error("❌ fetchSimpleSheetsFaqs failed:", err.message);
  }

  // 4) advanced sheets
  try {
    const s2 = await fetchAdvancedSheetsFaqs();
    all = all.concat(s2.map((r) => ({ ...r, source: "sheets-advanced" })));
  } catch (err) {
    console.error("❌ fetchAdvancedSheetsFaqs failed:", err.message);
  }

  cache = { ts: Date.now(), data: all };
  return all;
}

export async function findBestFaq(query) {
  if (!query || !query.trim()) return null;
  const all = await loadAllSources();
  if (!all.length) return null;

  let best = null;
  for (const item of all) {
    const q = item.question || "";
    const a = item.answer || "";
    const s = scoreMatch(query, q, a);
    if (!best || s > best.score) best = { ...item, score: s };
  }

  if (!best || best.score < 0.5) return null;
  return best;
}

export async function refreshFaqCache() {
  const all = await loadAllSources(true);
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(all, null, 2), "utf8");
    console.log(`💾 FAQ cache refreshed: ${all.length} entries written to ${CACHE_FILE}`);
  } catch (err) {
    console.warn("⚠️ Failed to write FAQ cache:", err.message);
  }
  return all.length;
}

export default { findBestFaq, refreshFaqCache };
