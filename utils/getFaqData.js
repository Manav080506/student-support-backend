import fs from "fs";
import path from "path";
import Faq from "../models/Faq.js";
import { fetchSimpleSheetsFaqs } from "./sheets-simple.js";
import { fetchAdvancedSheetsFaqs } from "./sheets-advanced.js";

const LOCAL_FAQ_PATH = path.join(process.cwd(), "utils", "localFaqs.json");
const CACHE_TTL = Number(process.env.FAQ_CACHE_TTL_MS || 1000 * 60 * 5); // 5m default
const MIN_SCORE = Number(process.env.FAQ_MIN_SCORE || 0.5); // 👈 configurable

let cache = { ts: 0, data: [] };

function tokenize(text = "") {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(Boolean);
}

// Simple scoring: token overlap + substring
function scoreMatch(query, qText, aText) {
  const qTokens = tokenize(query);
  if (!qTokens.length) return 0;
  const qTextLower = qText.toLowerCase();
  let score = 0;

  if (qTextLower.includes(query.toLowerCase())) score += 2;
  const qTokensSet = new Set(tokenize(qText));
  const matches = qTokens.filter(t => qTokensSet.has(t)).length;
  score += matches / qTokens.length;

  const aTokensSet = new Set(tokenize(aText));
  const aMatches = qTokens.filter(t => aTokensSet.has(t)).length;
  score += (aMatches / qTokens.length) * 0.5;

  return score;
}

async function loadAllSources(force = false) {
  if (!force && Date.now() - cache.ts < CACHE_TTL && cache.data.length) return cache.data;

  let all = [];

  // Local
  try {
    const raw = fs.readFileSync(LOCAL_FAQ_PATH, "utf8");
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) all = all.concat(arr.map(r => ({ ...r, source: "local" })));
  } catch {}

  // Mongo
  try {
    const docs = await Faq.find().lean().limit(500);
    if (Array.isArray(docs)) all = all.concat(docs.map(d => ({ question: d.question, answer: d.answer, source: "mongo" })));
  } catch (err) {
    console.error("Error loading FAQs from mongo:", err?.message || err);
  }

  // Sheets
  try { all = all.concat((await fetchSimpleSheetsFaqs()).map(r => ({ ...r, source: "sheets-simple" }))); } catch {}
  try { all = all.concat((await fetchAdvancedSheetsFaqs()).map(r => ({ ...r, source: "sheets-advanced" }))); } catch {}

  cache = { ts: Date.now(), data: all };
  return all;
}

// 🔹 Fuzzy finder
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

  if (!best || best.score < MIN_SCORE) return null; // 👈 strict threshold
  return best;
}

export async function refreshFaqCache() {
  await loadAllSources(true);
  return cache.data.length;
}

export default { findBestFaq, refreshFaqCache };
