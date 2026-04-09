const { google } = require('googleapis');

const SHEET_ID  = "1j-rzIr0Z_0922x6sBHOhAH9PWK8TWdPOwOUE1_l_42o";
const SHEET_TAB = "Sheet1";

async function getSheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

// Zet 0-based kolomindex om naar letter (0=A, 1=B, etc.)
function kolomLetter(index) {
  let letter = '';
  let n = index;
  while (n >= 0) {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  let body;
  try { body = JSON.parse(event.body); } catch(e) { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  // Claude API proxy
  if (!body.action || body.action === "claude") {
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": body.apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: body.model || "claude-haiku-4-5-20251001", max_tokens: body.max_tokens || 60, system: body.system || "", messages: body.messages || [] }),
      });
      const data = await resp.json();
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    } catch(e) { return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) }; }
  }

  // Google Sheets schrijven
  if (body.action === "sheets_write") {
    try {
      const sheets = await getSheetsClient();

      // Haal headers op (rij 1)
      const hResp = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_TAB}!1:1`,
      });
      const sheetHeaders = hResp.data.values?.[0] || [];

      const colAfbIndex = sheetHeaders.indexOf("afbeelding_url");
      const colAltIndex = sheetHeaders.indexOf("alt_tekst");

      if (colAfbIndex === -1 || colAltIndex === -1) {
        return { statusCode: 400, headers, body: JSON.stringify({
          error: `Kolommen niet gevonden. Headers: ${sheetHeaders.join(', ')}`
        })};
      }

      const row = body.rowIndex;
      const afbCol = kolomLetter(colAfbIndex);
      const altCol = kolomLetter(colAltIndex);

      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_TAB}!${afbCol}${row}`,
        valueInputOption: "RAW",
        requestBody: { values: [[body.afbeeldingUrl]] },
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_TAB}!${altCol}${row}`,
        valueInputOption: "RAW",
        requestBody: { values: [[body.altTekst]] },
      });

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, row, afbCol, altCol }) };
    } catch(e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 400, headers, body: JSON.stringify({ error: "Onbekende actie" }) };
};
