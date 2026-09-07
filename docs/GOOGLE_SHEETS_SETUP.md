# Google Sheets Setup Guide
> **2-minute setup** — do this once before the event

---

## Step 1 — Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a **new blank spreadsheet**.
2. Name it something like `Kollect GFF 2026 — Booth Sessions`.
3. Leave it open.

---

## Step 2 — Open the Apps Script Editor

1. In the sheet, click **Extensions → Apps Script**.
2. Delete the default `myFunction()` boilerplate entirely.

---

## Step 3 — Paste the Script

1. Open [`server/googleAppsScript.js`](../server/googleAppsScript.js) from this project.
2. Copy **all** of its contents.
3. Paste it into the Apps Script editor.
4. Click **Save** (💾 or `Ctrl+S`).

---

## Step 4 — Deploy as a Web App

1. Click **Deploy → New deployment**.
2. Click the **gear icon (⚙)** next to "Select type" → choose **Web app**.
3. Fill in the settings:
   - **Description**: `Kollect Booth Telemetry`
   - **Execute as**: `Me`
   - **Who has access**: `Anyone`
4. Click **Deploy**.
5. Click **Authorize access** → sign in with your Google account → click **Allow**.
6. Copy the **Web app URL** — it looks like:
   ```
   https://script.google.com/macros/s/AKfycby.../exec
   ```

---

## Step 5 — Add the URL to `.env`

Open `.env` in this project and add:

```env
GOOGLE_SHEET_WEBHOOK_URL=https://script.google.com/macros/s/AKfycby.../exec
```

Replace the URL with the one you copied in Step 4.

Then **restart the server**:
```bash
npm start
```

---

## Step 6 — Verify It Works

Run a quick health check:
```bash
curl "https://script.google.com/macros/s/AKfycby.../exec"
```
You should see: `{"status":"ok","sheet":"Attendee Sessions"}`

Then open the demo in a browser, enter a name and phone number, and click **Start the simulation**. Within a few seconds you should see a new row appear in your Google Sheet.

---

## Fallback — Download CSV

If there are any network issues during the event, all data is also saved locally on the server.  
Download a backup CSV at any time by visiting:

```
http://localhost:3001/api/telemetry/export-csv
```

Or if hosted:
```
https://your-domain/api/telemetry/export-csv
```

---

## Re-deploying After Changes

If you change the Apps Script code, you **must create a new deployment version**:
1. Click **Deploy → Manage deployments**.
2. Click the pencil (✏️) icon on your existing deployment.
3. Under Version, select **New version**.
4. Click **Deploy**.
5. The URL stays the same — no need to update `.env`.
