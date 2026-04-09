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

function kolomLetter(n) {
  let s = ""; n++;
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
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
      const hResp = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SHEET_TAB}!1:1` });
      const sheetHeaders = hResp.data.values?.[0] || [];
      const colAfb = sheetHeaders.indexOf("afbeelding_url");
      const colAlt = sheetHeaders.indexOf("alt_tekst");
      if (colAfb === -1 || colAlt === -1) return { statusCode: 400, headers, body: JSON.stringify({ error: "Kolommen niet gevonden" }) };

      const row = body.rowIndex;
      await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${SHEET_TAB}!${kolomLetter(colAfb)}${row}`, valueInputOption: "RAW", requestBody: { values: [[body.afbeeldingUrl]] } });
      await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${SHEET_TAB}!${kolomLetter(colAlt)}${row}`, valueInputOption: "RAW", requestBody: { values: [[body.altTekst]] } });

      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    } catch(e) { return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) }; }
  }

  return { statusCode: 400, headers, body: JSON.stringify({ error: "Onbekende actie" }) };
};
