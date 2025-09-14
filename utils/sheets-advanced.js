// utils/sheets-advanced.js
import { google } from "googleapis";

const SHEET_ID = process.env.SHEET_ID;

function getJwtClientFromBase64() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT) return null;
  try {
    const raw = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT, "base64").toString("utf8");
    const creds = JSON.parse(raw);
    const jwt = new google.auth.JWT(
      creds.client_email,
      null,
      creds.private_key,
      ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    );
    return jwt;
  } catch (err) {
    console.error("Invalid GOOGLE_SERVICE_ACCOUNT:", err?.message || err);
    return null;
  }
}

export async function fetchAdvancedSheetsFaqs() {
  if (!SHEET_ID) return [];
  try {
    const jwt = getJwtClientFromBase64();
    if (!jwt) {
      // fallback: try API key path (if you have an API key)
      if (process.env.SHEET_API_KEY) {
        const sheets = google.sheets({ version: "v4", auth: process.env.SHEET_API_KEY });
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId: SHEET_ID,
          range: "Sheet1!A:B",
          key: process.env.SHEET_API_KEY
        });
        const rows = res.data.values || [];
        return rows.map(r => ({ question: (r[0]||"").toString(), answer: (r[1]||"").toString() })).filter(x => x.question && x.answer);
      }
      return [];
    }

    await jwt.authorize();
    const sheets = google.sheets({ version: "v4", auth: jwt });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "Sheet1!A:B"
    });
    const rows = res.data.values || [];
    return rows.map(r => ({ question: (r[0]||"").toString(), answer: (r[1]||"").toString() })).filter(x => x.question && x.answer);
  } catch (err) {
    console.error("sheets-advanced error:", err?.message || err);
    return [];
  }
}
