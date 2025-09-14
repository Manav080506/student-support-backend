// utils/sheets-simple.js
import { GoogleSpreadsheet } from "google-spreadsheet";
import dotenv from "dotenv";
dotenv.config();

let sheetCache = []; // cached rows
let connected = false;

export async function initSheet() {
  if (!process.env.GOOGLE_SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    console.warn("Google Sheets env not fully set — skipping sheet init.");
    return;
  }
  try {
    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID);
    await doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    });
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0]; // first sheet
    const rows = await sheet.getRows();
    sheetCache = rows.map(r => ({
      question: r.Question || r.question || "",
      answer: r.Answer || r.answer || "",
      category: r.Category || r.category || "General"
    }));
    connected = true;
    console.log("✅ Google Sheet connected:", doc.title, "|", sheetCache.length, "rows");
  } catch (err) {
    console.error("❌ Google Sheets init error:", err.message);
    connected = false;
  }
}

export function getCachedSheetFaqs() {
  return sheetCache || [];
}

// optional manual refresh
export async function refreshSheetCache() {
  await initSheet();
}
