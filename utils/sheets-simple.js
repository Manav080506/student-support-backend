// utils/sheets-simple.js
import { GoogleSpreadsheet } from "google-spreadsheet";

const SHEET_ID = process.env.SHEET_ID; // sheet id only
const SHEET_API_KEY = process.env.SHEET_API_KEY; // optional read-only key for public sheet

export async function fetchSimpleSheetsFaqs() {
  if (!SHEET_ID) return [];
  try {
    const doc = new GoogleSpreadsheet(SHEET_ID);
    if (SHEET_API_KEY) await doc.useApiKey(SHEET_API_KEY);
    // if sheet is public, useApiKey or no auth may work
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    return rows.map(r => ({
      question: (r.Question || r.question || "").toString().trim(),
      answer: (r.Answer || r.answer || "").toString().trim()
    })).filter(x => x.question && x.answer);
  } catch (err) {
    console.error("sheets-simple error:", err?.message || err);
    return [];
  }
}
