// utils/sheets-simple.js
import fetch from "node-fetch";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const API_KEY = process.env.GOOGLE_API_KEY;

/**
 * Fetch FAQs from the Google Sheet using API key
 * Expected format: first row = headers (Question, Answer, Category)
 */
export async function fetchSimpleSheetsFaqs(range = "Sheet1!A:C") {
  if (!SHEET_ID || !API_KEY) {
    console.warn("⚠️ Missing SHEET_ID or API_KEY in environment");
    return [];
  }

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.values || !data.values.length) {
      console.warn("⚠️ No data found in Google Sheet");
      return [];
    }

    // First row = headers
    const headers = data.values[0];
    const rows = data.values.slice(1);

    return rows.map(row => {
      let obj = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] || "";
      });
      return {
        question: obj.Question || obj.question || "",
        answer: obj.Answer || obj.answer || "",
        category: obj.Category || obj.category || "General"
      };
    }).filter(r => r.question && r.answer);

  } catch (err) {
    console.error("❌ Google Sheets fetch error:", err.message);
    return [];
  }
}
