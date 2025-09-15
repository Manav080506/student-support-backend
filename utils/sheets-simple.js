// utils/sheets-simple.js
import { GoogleSpreadsheet } from "google-spreadsheet";

let sheetCache = [];
let connected = false;

/**
 * Fetch FAQs from a Google Sheet using service account.
 * Returns array of {question, answer, category}
 */
export async function fetchSimpleSheetsFaqs() {
  if (
    !process.env.GOOGLE_SHEET_ID ||
    !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    !process.env.GOOGLE_PRIVATE_KEY
  ) {
    console.warn("⚠️ Missing Google Sheets env vars — skipping simple sheets.");
    return [];
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

    sheetCache = rows.map((r) => ({
      question: r.Question || r.question || "",
      answer: r.Answer || r.answer || "",
      category: r.Category || r.category || "General",
    }));

    connected = true;
    console.log("✅ Simple Sheets connected:", doc.title, "| Rows:", sheetCache.length);
    return sheetCache;
  } catch (err) {
    console.error("❌ fetchSimpleSheetsFaqs error:", err.message);
    connected = false;
    return [];
  }
}
