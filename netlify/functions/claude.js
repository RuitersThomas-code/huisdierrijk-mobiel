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
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

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

  // Google Sheets schrijven — zoek rij op via artikelId of titel
  if (body.action === "sheets_write") {
    try {
      const sheets = await getSheetsClient();

      // Haal alle data op
      const dataResp = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: SHEET_TAB,
      });
      const rows = dataResp.data.values || [];
      if (rows.length < 2) return { statusCode: 400, headers, body: JSON.stringify({ error: "Sheet leeg" }) };

      const sheetHeaders = rows[0];
      const colId    = sheetHeaders.indexOf("id");
      const colAfb   = sheetHeaders.indexOf("afbeelding_url");
      const colAlt   = sheetHeaders.indexOf("alt_tekst");

      if (colAfb === -1 || colAlt === -1) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: `Kolommen niet gevonden. Headers: ${sheetHeaders.join(', ')}` }) };
      }

      // Zoek de juiste rij op basis van artikel id
      let rowIndex = -1;
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][colId]) === String(body.artikelId)) {
          rowIndex = i + 1; // 1-based voor Sheets API
          break;
        }
      }

      if (rowIndex === -1) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: `Artikel ID ${body.artikelId} niet gevonden` }) };
      }

      const afbCol = kolomLetter(colAfb);
      const altCol = kolomLetter(colAlt);

      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_TAB}!${afbCol}${rowIndex}`,
        valueInputOption: "RAW",
        requestBody: { values: [[body.afbeeldingUrl]] },
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_TAB}!${altCol}${rowIndex}`,
        valueInputOption: "RAW",
        requestBody: { values: [[body.altTekst]] },
      });

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, rowIndex, afbCol, altCol }) };
    } catch(e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 400, headers, body: JSON.stringify({ error: "Onbekende actie" }) };
};
