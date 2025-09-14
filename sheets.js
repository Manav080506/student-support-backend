// sheets.js
import { google } from "googleapis";

const SHEET_ID = "1QoLAe1-n6-O62LQSYqgNB--jfS10IMubsObvU_e49rI"; // your sheet ID
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;

export async function getSheetAnswer(query) {
  try {
    const sheets = google.sheets({ version: "v4", auth: API_KEY });
    const range = "FAQ!A:B"; // Assuming Sheet tab is called FAQ with columns [Question, Answer]

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range,
    });

    const rows = response.data.values || [];
    for (const row of rows) {
      const q = row[0]?.toLowerCase();
      const a = row[1];
      if (query.toLowerCase().includes(q)) {
        return a;
      }
    }
    return null;
  } catch (err) {
    console.error("❌ Sheets fetch error:", err.message);
    return null;
  }
}
