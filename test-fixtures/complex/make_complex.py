"""Makes the complex test PDFs in this folder (run: python make_complex.py).

Four realistic Indian bills with everything printed, to check nothing gets lost or invented:
  - invoice_textiles_2pages.pdf   dress materials and tailoring items, 2 pages, item codes on SOME items, CGST/SGST
  - bill_medical_dressings.pdf    "Bill No" / "Bill Date" instead of Invoice, Particulars, Batch No, IGST
  - invoice_site_supplies.pdf     paint, cement, copper pipe AND copper wire, stationery, cleaning, safety items;
                                  every item has a Product Code; headings Quantity / UOM / Unit Price / Total
  - cash_memo_no_gstin.pdf        a small shop cash memo with no GSTIN at all (nothing may be invented)
"""
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

W, H = A4


def money(v):
    return f"{v:,.2f}"


class Doc:
    def __init__(self, path):
        self.c = canvas.Canvas(path, pagesize=A4)
        self.y = H - 50
        self.page = 1

    def text(self, x, s, size=9, bold=False, right=False):
        self.c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
        (self.c.drawRightString if right else self.c.drawString)(x, self.y, s)

    def down(self, n=13):
        self.y -= n

    def rule(self):
        self.c.setLineWidth(0.5)
        self.c.line(36, self.y + 9, W - 36, self.y + 9)

    def new_page(self):
        self.c.drawCentredString(W / 2, 24, f"Page {self.page}")
        self.c.showPage()
        self.page += 1
        self.y = H - 50

    def save(self):
        self.c.setFont("Helvetica", 8)
        self.c.drawCentredString(W / 2, 24, f"Page {self.page}")
        self.c.save()


def table(d, cols, rows, per_page=None, header_again=True):
    """cols: [(title, x, right_aligned)]. Rows are lists of strings."""

    def header():
        for t, x, r in cols:
            d.text(x, t, bold=True, right=r)
        d.down(4)
        d.rule()
        d.down(12)

    header()
    for i, r in enumerate(rows):
        if per_page and i and i % per_page == 0:
            d.new_page()
            if header_again:
                header()
        for (t, x, right), v in zip(cols, r):
            d.text(x, v, right=right)
        d.down()
    d.rule()
    d.down(6)


def totals(d, lines, x_label=380, x_val=W - 40):
    for label, val in lines:
        d.text(x_label, label, bold=label.startswith("Grand") or label.startswith("Net"))
        d.text(x_val, val, right=True, bold=label.startswith("Grand") or label.startswith("Net"))
        d.down()


def textiles():
    d = Doc("invoice_textiles_2pages.pdf")
    d.text(230, "TAX INVOICE", 13, True); d.down(22)
    d.text(36, "Lakshmi Textiles & Tailoring Supplies", 10, True); d.text(360, "Invoice No: LT/26-27/0142"); d.down()
    d.text(36, "14 Town Hall Road, Madurai 625001"); d.text(360, "Invoice Date: 03-10-2026"); d.down()
    d.text(36, "GSTIN: 33AAKFL4471M1Z5"); d.text(360, "Order Ref: PO-SV-2231"); d.down(20)
    d.text(36, "Buyer", bold=True); d.down()
    d.text(36, "Sri Vari Garments"); d.text(360, "Place of Supply: Tamil Nadu"); d.down()
    d.text(36, "Tiruppur 641601"); d.down()
    d.text(36, "GSTIN: 33BCDPS2210K1Z9"); d.down(22)
    items = [
        ("TX-101", "Cotton Shirting Fabric 58 inch White", "5208", 120, "Mtr", 145),
        ("TX-102", "Polyester Lining Fabric Black", "5407", 80, "Mtr", 62),
        ("", "Salwar Suit Dress Material Unstitched Printed", "5208", 25, "Set", 680),
        ("", "Rayon Kurti Dress Material 2.5m", "5408", 40, "Pcs", 310),
        ("TX-210", "Denim Fabric 12 oz Indigo", "5209", 60, "Mtr", 210),
        ("", "Chiffon Dupatta Plain", "5407", 50, "Pcs", 95),
        ("AC-301", "Plastic Shirt Buttons 14mm (Gross)", "9606", 30, "Pkt", 48),
        ("AC-302", "Metal Jeans Buttons Antique Brass", "9606", 20, "Pkt", 120),
        ("", "Nylon Zipper 7 inch Assorted", "9607", 200, "Pcs", 6),
        ("", "YKK Metal Zipper 22 inch", "9607", 60, "Pcs", 38),
        ("AC-320", "Polyester Sewing Thread 5000m Cone", "5401", 48, "Nos", 85),
        ("", "Cotton Elastic Tape 1 inch", "5806", 100, "Mtr", 9),
        ("", "Interlining Fusible 40 inch", "5903", 70, "Mtr", 44),
        ("TL-401", "Tailoring Scissors 10 inch", "8213", 6, "Nos", 340),
        ("TL-402", "Sewing Machine Needles DBx1 (Pack of 100)", "8452", 10, "Pkt", 260),
        ("", "Measuring Tape 60 inch", "9017", 24, "Nos", 25),
        ("", "Tailor Chalk Assorted", "9609", 30, "Box", 40),
        ("TX-115", "Linen Blend Trouser Fabric Grey", "5309", 45, "Mtr", 290),
        ("", "Lace Border 2 inch Golden", "5804", 150, "Mtr", 18),
        ("", "Embroidery Thread Silk Finish Assorted", "5401", 36, "Nos", 55),
        ("AC-350", "Hook and Eye Fasteners (Card of 12)", "8308", 50, "Pkt", 22),
        ("", "Garment Labels Woven (1000 pcs)", "5807", 4, "Box", 950),
    ]
    rows, total = [], 0
    for i, (code, desc, hsn, q, u, rate) in enumerate(items, 1):
        amt = q * rate
        total += amt
        rows.append([str(i), code, desc, hsn, str(q), u, money(rate), "5%", money(amt)])
    cols = [("Sl", 36, False), ("Item Code", 56, False), ("Description of Goods", 108, False), ("HSN/SAC", 330, False),
            ("Qty", 395, True), ("Unit", 402, False), ("Rate", 470, True), ("GST %", 480, False), ("Amount", W - 40, True)]
    table(d, cols, rows, per_page=14)
    cgst = round(total * 0.025, 2)
    totals(d, [("Taxable Value", money(total)), ("CGST @ 2.5%", money(cgst)), ("SGST @ 2.5%", money(cgst)),
               ("Grand Total", money(total + 2 * cgst))])
    d.down(14)
    d.text(36, "Bank: Indian Bank, Madurai Main. A/c 6012345678, IFSC IDIB000M001"); d.down()
    d.text(36, "Goods once sold will not be taken back. Subject to Madurai jurisdiction."); d.down(26)
    d.text(400, "for Lakshmi Textiles & Tailoring Supplies"); d.down(30); d.text(440, "Authorised Signatory")
    d.save()


def medical():
    d = Doc("bill_medical_dressings.pdf")
    d.text(200, "GST BILL OF SUPPLY", 13, True); d.down(22)
    d.text(36, "CareWell Surgicals", 10, True); d.text(360, "Bill No: CWS/1189"); d.down()
    d.text(36, "Plot 7, MIDC, Pune 411019"); d.text(360, "Bill Date: 11-10-2026"); d.down()
    d.text(36, "GSTIN: 27AACCC5512R1ZQ"); d.text(360, "Drug Lic No: MH-PZ5-118204"); d.down(20)
    d.text(36, "Billed To", bold=True); d.down()
    d.text(36, "Shanti Nursing Home"); d.text(360, "Place of Supply: Karnataka"); d.down()
    d.text(36, "Belagavi 590001"); d.down()
    d.text(36, "GSTIN: 29AAFTS7744H1Z1"); d.down(22)
    items = [
        ("Cotton Crepe Bandage 10cm x 4m", "3005", "CB2609", 200, "Roll", 42),
        ("Sterile Gauze Swabs 10x10cm (Pack of 100)", "3005", "GZ2611", 40, "Pkt", 185),
        ("Absorbent Cotton Wool Roll 500g", "3005", "AC2608", 60, "Roll", 160),
        ("Adhesive Plaster Roll 7.5cm", "3005", "AP2610", 80, "Roll", 58),
        ("Paraffin Gauze Dressing 10x10cm", "3005", "PG2605", 100, "Pcs", 22),
        ("Surgical Gloves Latex Size 7 (Pair)", "4015", "SG2612", 500, "Pair", 14),
        ("Disposable Syringe 5ml with Needle", "9018", "DS2607", 1000, "Pcs", 4),
        ("Povidone Iodine Solution 500ml", "3004", "PI2603", 24, "Btl", 210),
        ("Surgical Face Mask 3 Ply (Box of 50)", "6307", "FM2609", 30, "Box", 120),
        ("Elastic Adhesive Bandage 10cm", "3005", "EA2606", 50, "Roll", 135),
    ]
    rows, total = [], 0
    for i, (desc, hsn, batch, q, u, rate) in enumerate(items, 1):
        amt = q * rate
        total += amt
        rows.append([str(i), desc, hsn, batch, str(q), u, money(rate), money(amt)])
    cols = [("S.No", 36, False), ("Particulars", 66, False), ("HSN", 300, False), ("Batch No", 340, False),
            ("Qty", 420, True), ("Unit", 428, False), ("Rate", 505, True), ("Amount", W - 40, True)]
    table(d, cols, rows)
    igst = round(total * 0.12, 2)
    totals(d, [("Sub Total", money(total)), ("IGST @ 12%", money(igst)), ("Grand Total", money(total + igst))])
    d.down(14)
    d.text(36, "Store below 25 C. Check batch and expiry before use."); d.down(26)
    d.text(420, "for CareWell Surgicals"); d.down(30); d.text(440, "Authorised Signatory")
    d.save()


def site():
    d = Doc("invoice_site_supplies.pdf")
    d.text(230, "TAX INVOICE", 13, True); d.down(22)
    d.text(36, "BuildMart Trading Co.", 10, True); d.text(360, "Invoice No: BMT-2026-0877"); d.down()
    d.text(36, "NH 48, Hosur 635109"); d.text(360, "Invoice Date: 15-10-2026"); d.down()
    d.text(36, "GSTIN: 33AAHFB6625C1ZK"); d.text(360, "PO Number: GC/PO/554"); d.down(20)
    d.text(36, "Bill To", bold=True); d.down()
    d.text(36, "Greenfield Constructions"); d.text(360, "Place of Supply: Tamil Nadu"); d.down()
    d.text(36, "Krishnagiri 635001"); d.down()
    d.text(36, "GSTIN: 33AADCG9081E1Z3"); d.down(22)
    items = [
        ("BM-P-001", "Asian Paints Apex Exterior Emulsion 20L", "3209", 6, "Bkt", 6850, 0),
        ("BM-P-014", "Wall Putty White 40kg Bag", "3214", 20, "Bag", 790, 5),
        ("BM-C-002", "UltraTech OPC 53 Grade Cement 50kg", "2523", 100, "Bag", 395, 0),
        ("BM-PL-110", "Copper Pipe 15mm Type L (3m length)", "7411", 12, "Nos", 1180, 0),
        ("BM-EL-205", "Copper Wire 1.5 sq mm FR 90m Coil", "8544", 8, "Coil", 1490, 2),
        ("BM-PL-131", "CPVC Elbow 25mm", "3917", 150, "Nos", 21, 0),
        ("BM-EL-240", "Modular Switch 6A One Way", "8536", 60, "Nos", 82, 0),
        ("BM-S-501", "A4 Copier Paper 75 GSM Ream", "4802", 25, "Rem", 265, 0),
        ("BM-S-517", "Ball Point Pen Blue (Box of 10)", "9608", 12, "Box", 70, 0),
        ("BM-H-610", "Phenyl Floor Cleaner 5L", "3808", 10, "Can", 240, 0),
        ("BM-H-622", "Hard Broom Coconut Stick", "9603", 20, "Nos", 65, 0),
        ("BM-SF-701", "Safety Helmet ISI Yellow", "6506", 30, "Nos", 155, 0),
        ("BM-SF-715", "Safety Shoes Steel Toe Size 8", "6403", 10, "Pair", 940, 0),
        ("BM-T-802", "Measuring Tape Steel 5m", "9017", 8, "Nos", 180, 0),
        ("BM-HW-905", "Tower Bolt 6 inch SS", "8302", 40, "Nos", 75, 0),
    ]
    rows, total = [], 0
    for i, (code, desc, hsn, q, u, rate, disc) in enumerate(items, 1):
        amt = round(q * rate * (1 - disc / 100), 2)
        total += amt
        rows.append([str(i), code, desc, hsn, str(q), u, money(rate), f"{disc}%" if disc else "-", money(amt)])
    cols = [("No.", 36, False), ("Product Code", 56, False), ("Item Description", 122, False), ("HSN", 330, False),
            ("Quantity", 400, True), ("UOM", 406, False), ("Unit Price", 480, True), ("Disc %", 488, False), ("Total", W - 40, True)]
    table(d, cols, rows)
    cgst = round(total * 0.09, 2)
    totals(d, [("Taxable Amount", money(total)), ("CGST @ 9%", money(cgst)), ("SGST @ 9%", money(cgst)),
               ("Grand Total", money(total + 2 * cgst))])
    d.down(14)
    d.text(36, "E. & O.E. Delivery: Site, Krishnagiri. Payment within 30 days."); d.down(26)
    d.text(430, "for BuildMart Trading Co."); d.down(30); d.text(440, "Authorised Signatory")
    d.save()


def cash_memo():
    d = Doc("cash_memo_no_gstin.pdf")
    d.text(240, "CASH MEMO", 13, True); d.down(22)
    d.text(36, "Ravi Stores", 10, True); d.text(380, "Memo No: 4471"); d.down()
    d.text(36, "Market Road, Salem"); d.text(380, "Date: 16-10-2026"); d.down(22)
    items = [("Steel Bucket 16L", 2, 320), ("Plastic Mug", 6, 35), ("LED Bulb 9W", 10, 95), ("Detergent Powder 1kg", 5, 110)]
    rows, total = [], 0
    for i, (desc, q, rate) in enumerate(items, 1):
        total += q * rate
        rows.append([str(i), desc, str(q), money(rate), money(q * rate)])
    cols = [("S.No", 36, False), ("Item", 70, False), ("Qty", 330, True), ("Rate", 430, True), ("Amount", W - 40, True)]
    table(d, cols, rows)
    totals(d, [("Total", money(total))])
    d.down(20)
    d.text(36, "Thank you. Visit again.")
    d.save()


if __name__ == "__main__":
    textiles()
    medical()
    site()
    cash_memo()
    print("made 4 PDFs")
