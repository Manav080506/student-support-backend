import fs from "fs";
import path from "path";
import Faq from "../models/Faq.js";
import { fetchSimpleSheetsFaqs } from "./sheets-simple.js";
import { fetchAdvancedSheetsFaqs } from "./sheets-advanced.js";

// 🔹 Synonym map for smarter matching
const synonymMap = {
  // Finance
  "due": "fees",
  "fee": "fees",
  "pay": "fees",
  "payment": "fees",
  "dues": "fees",

  // Scholarships
  "scholarship": "scholarships",
  "scholarships": "scholarships",

  // Mentorship
  "mentor": "mentorship",
  "mentors": "mentorship",
  "guide": "mentorship",
  "teacher": "mentorship",
  "coaching": "mentorship",

  // Counseling
  "counsel": "counseling",
  "counselor": "counseling",
  "stress": "counseling",
  "anxious": "counseling",
  "anxiety": "counseling",
  "therapy": "counseling",

  // Distress / Crisis
  "suicide": "distress",
  "suicidal": "distress",
  "kill myself": "distress",
  "end my life": "distress",
  "self harm": "distress",
  "depressed": "distress",
  "depression": "distress",

  // Marketplace
  "buy": "marketplace",
  "purchase": "marketplace",
  "shopping": "marketplace",
  "items": "marketplace",
  "market": "marketplace"
};

export function normalizeQuery(query = "") {
  let text = query.toLowerCase();
  for (const [word, replacement] of Object.entries(synonymMap)) {
    text = text.replace(new RegExp(`\\b${word}\\b`, "g"), replacement);
  }
  return text;
}

const LOCAL_FAQ_PATH = path.join(process.cwd(), "utils", "localFaqs.json");
const CACHE_TTL = Number(process.env.FAQ_CACHE_TTL_MS || 1000 * 60 * 5);

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

  // 1) Local JSON
  try {
    const raw = fs.readFileSync(LOCAL_FAQ_PATH, "utf8");
    const arr = JSON.parse(raw);
    if (Array.isArray(arr))
      all = all.concat(arr.map((r) => ({ ...r, source: "local" })));
  } catch {
    console.warn("⚠️ No localFaqs.json found, skipping...");
  }

  // 2) Mongo
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
    console.error("❌ Error loading FAQs from mongo:", err?.message || err);
  }

  // 3) Google Sheets
  try {
    const s1 = await fetchSimpleSheetsFaqs();
    all = all.concat(s1.map((r) => ({ ...r, source: "sheets-simple" })));
  } catch (err) {
    console.error("❌ fetchSimpleSheetsFaqs failed:", err.message);
  }

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
  const normalized = normalizeQuery(query);
  const all = await loadAllSources();
  if (!all.length) return null;

  let best = null;
  for (const item of all) {
    const q = item.question || "";
    const a = item.answer || "";
    const s = scoreMatch(normalized, q, a);
    if (!best || s > best.score) best = { ...item, score: s };
  }

  if (!best || !best.answer || best.score < 0.5) return null;
  return best;
}

export async function refreshFaqCache() {
  await loadAllSources(true);
  return cache.data.length;
}

export default { findBestFaq, refreshFaqCache };
