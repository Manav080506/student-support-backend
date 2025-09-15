// utils/sheets-advanced.js
import fetch from "node-fetch";

export async function fetchAdvancedSheetsFaqs() {
  if (!process.env.GOOGLE_SHEET_ID || !process.env.GOOGLE_API_KEY) {
    console.warn("⚠️ No GOOGLE_SHEET_ID or GOOGLE_API_KEY set — skipping advanced sheets.");
    return [];
  }

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEET_ID}/values/A:C?key=${process.env.GOOGLE_API_KEY}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Google Sheets API error: ${resp.status}`);
    const data = await resp.json();

    // data.values is an array of rows
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
