// utils/sheets-advanced.js
import fetch from "node-fetch";

/**
 * Fetch FAQs from Google Sheets using API key.
 * Returns array of {question, answer, category}
 */
export async function fetchAdvancedSheetsFaqs() {
  if (!process.env.GOOGLE_SHEET_ID || !process.env.GOOGLE_API_KEY) {
    console.warn("⚠️ Missing GOOGLE_SHEET_ID or GOOGLE_API_KEY — skipping advanced sheets.");
    return [];
  }

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEET_ID}/values/A:C?key=${process.env.GOOGLE_API_KEY}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Google Sheets API error: ${resp.status}`);
    const data = await resp.json();

    const rows = data.values || [];
    return rows.slice(1).map((r) => ({
      question: r[0] || "",
      answer: r[1] || "",
      category: r[2] || "General",
    }));
  } catch (err) {
    console.error("❌ fetchAdvancedSheetsFaqs error:", err.message);
    return [];
  }
}
