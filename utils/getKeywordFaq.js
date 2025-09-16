// utils/getKeywordFaq.js
import fs from "fs";
import path from "path";
import { GoogleSpreadsheet } from "google-spreadsheet";

const LOCAL_KEYWORD_PATH = path.join(process.cwd(), "utils", "keywordFaqs.json");

// Load from Google Sheets (if creds exist)
async function fetchKeywordFaqsFromSheets() {
  if (!process.env.GOOGLE_SHEETS_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
    console.warn("⚠️ Missing Google Sheets env vars — skipping keyword FAQs from sheets.");
    return [];
  }

  try {
    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_ID);
    await doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    });
    await doc.loadInfo();

    const sheet = doc.sheetsByTitle["Keywords"]; // sheet/tab name
    if (!sheet) return [];

    const rows = await sheet.getRows();
    return rows.map((row) => ({
      keywords: (row.Keywords || "").toLowerCase().split(",").map((k) => k.trim()),
      answer: row.Answer || "",
      source: "sheets-keywords",
    }));
  } catch (err) {
    console.error("❌ Error loading keyword FAQs from Sheets:", err.message);
    return [];
  }
}

// Load from local JSON
function fetchKeywordFaqsFromJson() {
  try {
    const raw = fs.readFileSync(LOCAL_KEYWORD_PATH, "utf8");
    const arr = JSON.parse(raw);
    return arr.map((row) => ({
      keywords: (row.Keywords || "").toLowerCase().split(",").map((k) => k.trim()),
      answer: row.Answer || "",
      source: "local-keywords",
    }));
  } catch (err) {
    console.warn("⚠️ No local keywordFaqs.json found, skipping...");
    return [];
  }
}

let keywordCache = [];

export async function loadKeywordFaqs() {
  const jsonData = fetchKeywordFaqsFromJson();
  const sheetData = await fetchKeywordFaqsFromSheets();
  keywordCache = [...jsonData, ...sheetData];
  return keywordCache;
}

export async function findKeywordFaq(query) {
  if (!query || !query.trim()) return null;
  if (!keywordCache.length) await loadKeywordFaqs();

  const lower = query.toLowerCase();

  for (const item of keywordCache) {
    if (item.keywords.some((kw) => lower.includes(kw))) {
      return { answer: item.answer, matched: item.keywords, source: item.source };
    }
  }
  return null;
}
