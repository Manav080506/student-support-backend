import fetch from "node-fetch";
import stringSimilarity from "string-similarity";

let keywordFaqs = [];

/** Load keyword FAQs from Google Sheets */
export async function loadKeywordFaqs(sheetId, apiKey) {
  if (!sheetId || !apiKey) {
    console.warn("⚠️ Missing GOOGLE_SHEET_ID or GOOGLE_API_KEY — skipping keyword FAQs.");
    return [];
  }
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Keywords?key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.values || data.values.length < 2) return [];

    keywordFaqs = data.values.slice(1).map((row) => ({
      keywords: (row[0] || "").toLowerCase().split(",").map((k) => k.trim()).filter(Boolean),
      answer: row[1] || "",
      source: "sheets-keywords",
    }));

    console.log(`✅ Keyword FAQs loaded: ${keywordFaqs.length}`);
    return keywordFaqs;
  } catch (err) {
    console.error("❌ Failed to load keyword FAQs:", err.message);
    return [];
  }
}

/** Match keyword FAQ with fuzzy fallback */
export async function findKeywordFaq(query, sheetId, apiKey) {
  if (!query || !query.trim()) return null;
  if (!keywordFaqs.length) await loadKeywordFaqs(sheetId, apiKey);

  const lower = query.toLowerCase();

  // 1. Exact inclusion
  for (const item of keywordFaqs) {
    if (item.keywords.some((kw) => lower.includes(kw))) {
      return { ...item, matched: item.keywords, matchType: "exact" };
    }
  }

  // 2. Fuzzy similarity
  let best = null;
  for (const item of keywordFaqs) {
    for (const kw of item.keywords) {
      const score = stringSimilarity.compareTwoStrings(lower, kw);
      if (!best || score > best.score) best = { item, kw, score };
    }
  }
  if (best && best.score >= 0.6) {
    return { answer: best.item.answer, matched: [best.kw], score: best.score, source: "sheets-fuzzy", matchType: "fuzzy" };
  }
  return null;
}
