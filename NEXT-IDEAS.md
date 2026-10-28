# Migration-in-a-box: what is in, and ideas for next

## Added in this round (advisor approved)

- **Document details on every row.** Invoice No, Invoice Date, GSTIN (seller, and buyer as "GSTIN (2)"), Place of Supply, PO Number, Vendor, and the lines under the table (Taxable Value, CGST, CGST rate, SGST, SGST rate, Grand Total) are read as fields. Add them as columns and they repeat on each item row, so every Excel line is complete. Values are copied as printed; nothing is calculated.
- **Item type and Material** worked out from the description by keywords (Copper Cable → Cable / wire + Copper, PVC Pipe → Pipe + PVC, GI Tee → Pipe fitting + GI). No match leaves the cell blank. The word lists are in `src/engine/classify.ts` and are easy to extend.
- **Remove all columns** under "Add all table columns" (asks first).
- **Free templates:** Invoice items, Invoice summary, Purchase order lines, Price list / catalogue, File catalogue.
- **Accuracy check:** if the item amounts don't add up to the Taxable Value / Sub Total printed on the document, the preview warns that an item may be missing or misread.

## Round 2: all 12 ideas built (advisor approved)

| # | Idea | Why it helps | Size | Status |
|---|---|---|---|---|
| 1 | **Teach a word**: from the preview, set the item type / material for an item that came out blank, and remember the word in the Library | Customers have their own product names | Small | Done: "Teach a word" in the template |
| 2 | **Row count proof sheet**: a second sheet in the Excel with each file, how many items, the printed total and whether they matched | "Prove accuracy" is what people pay for | Small | Done: "Proof" sheet in every Excel |
| 3 | **Duplicate finder**: warn when the same invoice number appears in two files | Common mistake when moving old data | Small | Done: warning in the preview |
| 4 | **Date clean-up**: write every date as one format (DD-MM-YYYY) whatever the PDF used | New systems reject mixed dates | Small | Done: column type "Date" |
| 5 | **Unit clean-up**: Nos / Pcs / Pc / No. become one spelling | Same | Small | Done: column type "Unit" |
| 6 | **Auto mode**: pick the best free template from the headings found | Fewer clicks for a first-time user | Medium | Done: Auto button |
| 7 | **Excel and CSV input**, not only PDF | Many old systems export Excel | Medium | Done: .xlsx, .xls, .csv, .ods |
| 8 | **Group sheets**: one Excel sheet per item type or per file | Easier review | Medium | Done: "Sheets" choice by Download |
| 9 | **Per-item price for the job**: show "N items × Rs 1.5 = Rs X" for a job quote (no payment inside the app) | Matches the per-item pricing plan | Small | Done: under the preview |
| 10 | **OCR for scanned pages**, in the browser | `scanned_page.pdf` shows "Needs OCR" today | Large | Done: "Read scanned pages" button (needs internet once) |
| 11 | **Run patterns in a worker with a time limit** | Real protection before the AI agent writes patterns | Medium | Done: 0.5 s limit per pattern |
| 12 | **AI agent**: describe the Excel you want, get a template (shows exactly what leaves the browser first) | Biggest time saver, biggest privacy decision | Large | Done: "AI helper" (needs your API key) |
