# Migration-in-a-box

Turns PDFs, Excel and CSV files into one clean Excel file. The files are read in the browser and never uploaded.
AI (Claude Haiku 5.5) sorts the items and, if you ask, chooses the columns.

**Live demo:** https://migration-in-a-box.orbit-fm.workers.dev. Reading files, building the Excel and keyword sorting work for everyone. The AI features are locked behind a passcode.

## Two ways to use it

**Simple view (default):** one page with three columns side by side. **1. Add files** on the left, **2. Choose how** in the middle, **3. Check & download** on the right.
Drop files and AI builds the Excel by itself. Typing what you want, or picking a ready format, is optional.

- **Removing a file:** each file in the list has a ✕. It takes the file off the list (the file on your computer is not touched), and the Excel rebuilds without it.
- **Arranging the columns:** in "3. Check & download", drag the column bubbles (or the table headings) into any order. You can also click a bubble and press ← →. The Excel uses the same order, and it is remembered for next time ("Redo with AI" keeps it). "Reset order" goes back to the app's order.
- **All rows are shown** in the preview, not only the first 100.
- **Speaking instead of typing:** in "Choose how", press 🎤 Speak and say what you want. English, Hindi, Tamil, Telugu, Malayalam, Kannada, Marathi, Bengali and Gujarati are available. This uses the browser's own speech-to-text (Chrome and Edge; Chrome sends the audio to Google), and it doesn't work in Firefox.

- **Everything printed is kept:**
  - Every table column and every detail printed on the bills: Invoice / Bill No, date, seller and buyer GSTIN, PO number, batch no, taxes, totals.
  - Look-alike names share one column: Qty / Quantity, Rate / Unit Price, Invoice No / Bill No / Memo No, and Particulars / Item Description.
  - Each item row carries its own bill's number and date.
  - A detail a bill doesn't print is left blank and listed in one note. Nothing is ever made up.
- **Trade and item type by AI:** AI sees the items in document order, so it has context. It names any trade the items need: Electrical, Plumbing, Textiles / clothing, Medical supplies, Stationery, Paint, Cleaning supplies, Safety equipment… A copper pipe is Plumbing, a copper wire is Electrical. If AI can't be reached, built-in keyword lists and HSN codes are used instead.
- **Material** comes only from what the description says (Copper, PVC, Cotton, Nylon…). AI never adds it.
- **S.No and Item Code:**
  - Printed codes are kept.
  - Blank ones get a code made by the app, prefixed by trade (TEX-0001, MED-0001, PLB-0001…).
  - The same item always gets the same code, and the Excel marks which codes were made by the app.
- **Highlighting:** cells the AI filled in (trade, item type) are purple, and cells the app made itself (item codes, keyword sorting) are green, both in the preview and in the downloaded Excel. The Proof sheet has the colour key. Cells with no colour are exactly as printed.
- **Please check** lists the items AI wasn't sure about. Confirming one saves the answer.
- **One sheet per trade:** under "Sheets", pick "One sheet per Trade".

**Advanced view** (button at top right): pages, Library, the full column builder, patterns and "Teach a word", all as before.

## Run on your laptop

```
npm install
npm run dev      # http://localhost:5173
```

The AI key is read from `.env` (copy `.env.example`). The key is named `ANTHROPIC_API_KEY` with **no `VITE_` prefix**, so it never goes into the browser code. The browser calls `/api/ai`, and only the server side holds the key.

## Online version (Cloudflare Workers)

```
npm run deploy       # builds and uploads to https://migration-in-a-box.orbit-fm.workers.dev
npm run deploy:key   # copies ANTHROPIC_API_KEY and APP_PASSCODE from .env into Worker secrets (never printed)
```

Online, AI asks for the `APP_PASSCODE` from `.env` once per tab, so strangers can't spend your credit. After changing the key or passcode in `.env`, run `npm run deploy:key` again.

## What is sent to AI

- **Sorting:** only item descriptions the rules couldn't place, plus the HSN code if one is printed. Each description is sent once. No files, prices, invoice numbers, GSTIN or names.
- **"What do you want?" box:** your sentence plus the table headings found.

## Structure

- `server/ai.ts` holds the key. It accepts only two request shapes: `sort` and `template`.
- `vite.config.ts` serves `/api/ai` on the laptop. `worker/index.ts` serves it online. `wrangler.jsonc` is the Worker config.
- `src/engine/classify.ts`: trade, item type and material rules, plus HSN → trade. The word lists are easy to extend.
- `src/engine/aiSort.ts`: sends each distinct item once, in batches of 60 (the first alone so trade names stay consistent, then 4 at a time), and saves the answers with the template.
- `src/engine/aiBuild.ts`: the "Let AI build my Excel" steps, and adding S.No, Item Code, Trade, Item type and Material.
- `src/engine/runTemplate.ts`: runs a template and builds the output table, including the codes made by the app.
- `src/components/SimpleFlow.tsx` is the one-page simple view (it runs AI by itself when files are read). `ConversionPageView.tsx` and `TemplateBuilder.tsx` are the advanced view.
- `src/engine/synonyms.ts`: headings and details that mean the same thing on different bills.
- `test-fixtures/`: sample PDFs and sheets.
  - `complex/` has four harder bills: a 2-page textiles invoice, a medical bill with Bill No and IGST, mixed site supplies, and a cash memo with no GSTIN. `complex/make_complex.py` remakes them.
  - `sheets/mixed_items.csv` mixes plumbing and electrical items with blank codes.
  - `diverse/` holds 20 files from very different businesses: sarees, gold and fashion jewellery, pharmacy, groceries, bakery, books, salon cosmetics, sports, toys, furniture, mobile accessories, farm inputs, footwear, handicrafts, tea and spices, a vegetable cash memo, a florist, a garments stock list (.xlsx), and a general-store purchase register (.xlsx). Some details are missing on purpose. `diverse/make_diverse.py` remakes them.
