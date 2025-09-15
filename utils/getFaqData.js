// utils/getFaqData.js
import fs from "fs";
import path from "path";
import Faq from "../models/Faq.js";
import { GoogleSpreadsheet } from "google-spreadsheet";
import stringSimilarity from "string-similarity";

const LOCAL_FAQ_PATH = path.join(process.cwd(), "utils", "localFaqs.json");
const CACHE_TTL = Number(process.env.FAQ_CACHE_TTL_MS || 1000 * 60 * 5); // 5 min default

let cache = { ts: 0, data: [] };

// --- Token helpers ---
function tokenize(text = "") {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(Boolean);
}
function tokenScore(query, qText, aText) {
  const qTokens = tokenize(query);
  if (!qTokens.length) return 0;
  const qTextLower = qText.toLowerCase();
  let score = 0;
  // substring boost
  if (qTextLower.includes(query.toLowerCase())) score += 2;
  // token overlap
  const qTokensSet = new Set(tokenize(qText));
  const matches = qTokens.filter((t) => qTokensSet.has(t)).length;
  score += matches / qTokens.length;
  // also check answer
  const aTokensSet = new Set(tokenize(aText));
  const aMatches = qTokens.filter((t) => aTokensSet.has(t)).length;
  score += (aMatches / qTokens.length) * 0.5;
  return score;
}

// --- Load all sources ---
async function loadAllSources(force = false) {
  if (!force && Date.now() - cache.ts < CACHE_TTL && cache.data.length) return cache.data;

  let all = [];

  // 1) local JSON
  try {
    const raw = fs.readFileSync(LOCAL_FAQ_PATH, "utf8");
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) all = all.concat(arr.map((r) => ({ ...r, source: "local" })));
  } catch {}

  // 2) Mongo
  try {
    const docs = await Faq.find().lean().limit(500);
    if (Array.isArray(docs)) all = all.concat(docs.map((d) => ({
      question: d.question,
      answer: d.answer,
      source: "mongo",
    })));
  } catch (err) {
    console.error("Error loading FAQs from mongo:", err?.message || err);
  }

  // 3) (Optional) Google Sheets via simple method
  try {
    // you can plug in your simple/advanced sheet fetch here
    // e.g., rows = await fetchSimpleSheetsFaqs()
  } catch {}

  cache = { ts: Date.now(), data: all };
  return all;
}

// --- Hybrid search ---
export async function findBestFaq(query) {
  if (!query || !query.trim()) return null;
  const all = await loadAllSources();
  if (!all.length) return null;

  let best = null;

  // Fuzzy over questions
  const questions = all.map((q) => q.question);
  const fuzzyMatches = stringSimilarity.findBestMatch(query, questions);

  for (const item of all) {
    const fuzzyScore =
      (fuzzyMatches.bestMatch && fuzzyMatches.bestMatch.target === item.question)
        ? fuzzyMatches.bestMatch.rating
        : stringSimilarity.compareTwoStrings(query, item.question);
    const tokenBased = tokenScore(query, item.question, item.answer);

    const finalScore = (fuzzyScore * 0.7) + (tokenBased * 0.3);

    if (!best || finalScore > best.score) {
      best = { ...item, score: finalScore };
    }
  }

  if (!best || best.score < 0.5) return null; // threshold
  return best;
}

export async function refreshFaqCache() {
  await loadAllSources(true);
  return cache.data.length;
}
