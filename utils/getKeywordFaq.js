// utils/getKeywordFaq.js
import { GoogleSpreadsheet } from "google-spreadsheet";

let keywordCache = [];

// Load from Google Sheets
async function fetchKeywordFaqsFromSheets() {
  if (!process.env.GOOGLE_SHEETS_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
    console.warn("⚠️ Missing Google Sheets env vars — skipping keyword FAQs.");
    return [];
  }

  try {
    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_ID);
    await doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    });
    await doc.loadInfo();

    const sheet = doc.sheetsByTitle["Keywords"]; // Tab name = "Keywords"
    if (!sheet) {
      console.warn("⚠️ No 'Keywords' sheet found.");
      return [];
    }

    const rows = await sheet.getRows();
    return rows.map((row) => ({
      keywords: (row.Keywords || "")
        .toLowerCase()
        .split(",")
        .map((k) => k.trim()),
      answer: row.Answer || "",
      source: "sheets-keywords",
    }));
  } catch (err) {
    console.error("❌ Error loading keyword FAQs from Sheets:", err.message);
    return [];
  }
}

export async function loadKeywordFaqs() {
  keywordCache = await fetchKeywordFaqsFromSheets();
  console.log(`✅ Keyword FAQs loaded: ${keywordCache.length} entries`);
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
