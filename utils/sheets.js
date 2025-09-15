// utils/sheets.js
import fetch from "node-fetch";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const API_KEY = process.env.GOOGLE_API_KEY;

export async function getSheetData(range = "Sheet1!A:Z") {
  if (!SHEET_ID || !API_KEY) {
    console.warn("⚠️ Missing SHEET_ID or API_KEY");
    return [];
  }
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.values) {
      console.error("❌ No data found in Google Sheet");
      return [];
    }

    const headers = data.values[0];
    return data.values.slice(1).map((row) => {
      const obj = {};
      headers.forEach((h, i) => (obj[h] = row[i] || ""));
      return obj;
    });
  } catch (err) {
    console.error("❌ Google Sheets fetch error:", err.message);
    return [];
  }
}
