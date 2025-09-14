// utils/sheets.js
import fetch from "node-fetch";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const API_KEY = process.env.GOOGLE_API_KEY;

/**
 * Fetch all rows from the first sheet
 */
export async function getSheetData(range = "Sheet1!A:Z") {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.values) {
      console.error("❌ No data found in Google Sheet");
      return [];
    }

    // First row = headers
    const headers = data.values[0];
    const rows = data.values.slice(1).map(row => {
      let obj = {};
      headers.forEach((h, i) => (obj[h] = row[i] || ""));
      return obj;
    });

    return rows;
  } catch (err) {
    console.error("❌ Google Sheets fetch error:", err.message);
    return [];
  }
}
