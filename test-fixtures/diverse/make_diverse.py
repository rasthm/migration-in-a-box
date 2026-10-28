"""Makes 20 test files from very different businesses (none of them hardware), for a mixed migration job.
Run: python make_diverse.py   (needs reportlab and openpyxl)

Some information is missing on purpose, the way real old records are:
  no item codes, no HSN, no unit column, no GSTIN, no date, odd column names ("Article", "Product"),
  a few rows with blank codes. The app must never invent bill numbers, dates or GSTINs; it may only
  fill Trade / Item type (AI) and item codes / S.No (made by the app), and it highlights those.
"""
import csv
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from openpyxl import Workbook

W, H = A4
LEFT, RIGHT = 36, W - 36


def money(v):
    return f"{v:,.2f}"


def text_width(c, s, size=9, bold=False):
    return c.stringWidth(s, "Helvetica-Bold" if bold else "Helvetica", size)


def bill(path, title, seller, seller_lines, meta, buyer, cols, rows, totals=(), notes=(), per_page=None):
    """cols: [(heading, relative width, 'l' or 'r')]. meta / buyer: [(label, value)] printed as "Label: value"."""
    c = canvas.Canvas(path, pagesize=A4)
    y = H - 50
    page = 1

    def put(x, s, size=9, bold=False, right=False):
        c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
        (c.drawRightString if right else c.drawString)(x, y, s)

    put(W / 2 - text_width(c, title, 13, True) / 2, title, 13, True)
    y -= 22
    # Seller name and address on the left, bill number / date on the right, line by line.
    put(LEFT, seller, 10, True)
    if meta:
        put(350, f"{meta[0][0]}: {meta[0][1]}")
    y -= 13
    right_lines = [f"{k}: {v}" for k, v in meta[1:]]
    for i in range(max(len(seller_lines), len(right_lines))):
        if i < len(seller_lines):
            put(LEFT, seller_lines[i])
        if i < len(right_lines):
            put(350, right_lines[i])
        y -= 13
    if buyer:
        y -= 8
        put(LEFT, "Bill To", bold=True)
        y -= 13
        for k, v in buyer:
            put(LEFT, f"{k}: {v}" if k else v)
            y -= 13
    y -= 10

    total_w = sum(w for _, w, _ in cols)
    xs, x = [], LEFT
    for _, w, align in cols:
        span = (RIGHT - LEFT) * w / total_w
        xs.append((x + span - 6) if align == "r" else x)
        x += span

    def header():
        nonlocal y
        for (h, _, align), hx in zip(cols, xs):
            put(hx, h, bold=True, right=align == "r")
        y -= 4
        c.setLineWidth(0.5)
        c.line(LEFT, y + 9, RIGHT, y + 9)
        y -= 12

    header()
    for i, r in enumerate(rows):
        if (per_page and i and i % per_page == 0) or y < 90:
            c.setFont("Helvetica", 8)
            c.drawCentredString(W / 2, 24, f"Page {page}")
            c.showPage()
            page += 1
            y = H - 50
            header()
        for (h, _, align), hx, v in zip(cols, xs, r):
            put(hx, str(v), right=align == "r")
        y -= 13
    c.line(LEFT, y + 9, RIGHT, y + 9)
    y -= 6
    for label, val in totals:
        bold = label.startswith(("Grand", "Net", "Total"))
        put(380, label, bold=bold)
        put(RIGHT - 4, val, bold=bold, right=True)
        y -= 13
    y -= 14
    for n in notes:
        put(LEFT, n, 8)
        y -= 12
    c.setFont("Helvetica", 8)
    c.drawCentredString(W / 2, 24, f"Page {page}")
    c.save()


def gst_totals(amounts, rate, inter=False, label="Taxable Value"):
    t = sum(amounts)
    if inter:
        g = round(t * rate / 100, 2)
        return [(label, money(t)), (f"IGST @ {rate}%", money(g)), ("Grand Total", money(t + g))]
    h = round(t * rate / 200, 2)
    return [(label, money(t)), (f"CGST @ {rate / 2:g}%", money(h)), (f"SGST @ {rate / 2:g}%", money(h)), ("Grand Total", money(t + 2 * h))]


def priced(items, qty_i, rate_i):
    """Adds Sl numbers and an Amount column; returns (rows, amounts)."""
    rows, amts = [], []
    for i, it in enumerate(items, 1):
        amt = it[qty_i] * it[rate_i]
        amts.append(amt)
        rows.append([str(i)] + [money(v) if j == rate_i else str(v) for j, v in enumerate(it)] + [money(amt)])
    return rows, amts


# ---------------------------------------------------------------- 1 Sarees (no item codes)
def f01():
    items = [("Kanchipuram Pure Silk Saree with Zari Border", "5007", 6, "Pcs", 14500), ("Banarasi Georgette Saree Red", "5407", 10, "Pcs", 3850),
             ("Chanderi Cotton Silk Saree", "5208", 15, "Pcs", 1650), ("Mysore Crepe Silk Saree Printed", "5007", 8, "Pcs", 5200),
             ("Linen Saree with Blouse Piece", "5309", 12, "Pcs", 2250), ("Organza Saree Embroidered", "5407", 7, "Pcs", 4100),
             ("Bandhani Cotton Saree Jaipur", "5208", 20, "Pcs", 980), ("Paithani Silk Saree Peacock Border", "5007", 3, "Pcs", 21500)]
    rows, a = priced(items, 2, 4)
    bill("01_saree_wholesale_invoice.pdf", "TAX INVOICE", "Sri Lakshmi Silks", ["Gandhi Road, Kanchipuram 631501", "GSTIN: 33AAQFS2231K1ZD"],
         [("Invoice No", "SLS/2627/0311"), ("Invoice Date", "02-10-2026")], [("", "Nalli Boutique, Chennai"), ("GSTIN", "33AABCN7781P1Z2"), ("Place of Supply", "Tamil Nadu")],
         [("Sl", 3, "l"), ("Description of Goods", 30, "l"), ("HSN", 6, "l"), ("Qty", 5, "r"), ("Unit", 5, "l"), ("Rate", 9, "r"), ("Amount", 10, "r")],
         rows, gst_totals(a, 5), ["Silk mark certified. Dry clean only."])


# ---------------------------------------------------------------- 2 Gold jewellery (weights, purity; codes on some)
def f02():
    items = [("GJ-1021", "22K Gold Necklace Temple Design", "916", 38.42, 6890, 4800), ("", "22K Gold Bangles (Pair) Plain", "916", 24.10, 6890, 2600),
             ("GJ-1107", "18K Diamond Ring 0.25ct", "750", 4.35, 5640, 9500), ("", "22K Gold Jhumka Earrings", "916", 9.80, 6890, 1500),
             ("GJ-1240", "Gold Chain 22K Rope 20 inch", "916", 15.20, 6890, 1200), ("", "Silver Anklets Pair 92.5", "925", 62.00, 92, 900)]
    rows, a = [], []
    for i, (code, d, pur, wt, rate, mk) in enumerate(items, 1):
        amt = round(wt * rate + mk, 2)
        a.append(amt)
        rows.append([str(i), code, d, "7113", pur, f"{wt:.2f}", money(rate), money(mk), money(amt)])
    bill("02_gold_jewellery_invoice.pdf", "TAX INVOICE", "Kalyan Jewels Retail", ["MG Road, Thrissur 680001", "GSTIN: 32AACCK8813L1ZW"],
         [("Invoice No", "KJ/TSR/26/1874"), ("Invoice Date", "05-10-2026")], [("", "Ms. Anjali Menon, Thrissur"), ("Place of Supply", "Kerala")],
         [("Sl", 3, "l"), ("Item Code", 7, "l"), ("Description", 24, "l"), ("HSN", 5, "l"), ("Purity", 5, "l"), ("Net Wt (g)", 7, "r"), ("Rate/g", 7, "r"), ("Making", 7, "r"), ("Amount", 9, "r")],
         rows, gst_totals(a, 3), ["BIS hallmarked. HUID printed on each piece."])


# ---------------------------------------------------------------- 3 Pharmacy (batch, expiry, MRP; no HSN, no codes)
def f03():
    items = [("Paracetamol 650mg Tablet (Strip of 15)", "PCM6521", "08/2028", 120, "Strip", 28.5), ("Amoxicillin 500mg Capsule (10s)", "AMX5009", "03/2027", 60, "Strip", 72),
             ("Cough Syrup Dextromethorphan 100ml", "CSD1102", "11/2027", 40, "Btl", 98), ("ORS Powder Orange 21g Sachet", "ORS2210", "06/2028", 200, "Sachet", 21),
             ("Vitamin D3 60000 IU Capsule (4s)", "VTD6044", "01/2028", 50, "Strip", 125), ("Insulin Pen Needles 4mm (100)", "INN4100", "09/2029", 10, "Box", 1450),
             ("Digital Thermometer", "", "", 15, "Nos", 180), ("Hand Sanitizer 500ml", "HSZ5050", "12/2027", 30, "Btl", 210)]
    rows, a = [], []
    for i, (d, b, e, q, u, r) in enumerate(items, 1):
        a.append(q * r)
        rows.append([str(i), d, b, e, str(q), u, money(r), money(q * r)])
    bill("03_pharmacy_purchase_bill.pdf", "GST INVOICE", "MedPlus Distributors", ["Banjara Hills, Hyderabad 500034", "GSTIN: 36AAECM4410R1ZK", "DL No: TS/HYD/20B/2019/4471"],
         [("Bill No", "MPD-77812"), ("Bill Date", "07-10-2026")], [("", "Sai Ram Medicals, Warangal"), ("GSTIN", "36ABHPR6612M1ZS")],
         [("S.No", 3, "l"), ("Product", 28, "l"), ("Batch", 7, "l"), ("Expiry", 6, "l"), ("Qty", 5, "r"), ("Pack", 5, "l"), ("Rate", 8, "r"), ("Amount", 9, "r")],
         rows, gst_totals(a, 12, label="Sub Total"))


# ---------------------------------------------------------------- 4 Grocery distributor (IGST, codes present)
def f04():
    items = [("FG-201", "Basmati Rice Premium 25kg Bag", "1006", 20, "Bag", 2450), ("FG-214", "Toor Dal 30kg", "0713", 12, "Bag", 3720),
             ("FG-230", "Refined Sunflower Oil 15L Tin", "1512", 18, "Tin", 2180), ("FG-245", "Sugar 50kg", "1701", 10, "Bag", 2150),
             ("FG-260", "Wheat Atta Chakki Fresh 10kg", "1101", 40, "Bag", 395), ("FG-277", "Rock Salt 1kg Pack", "2501", 100, "Pkt", 32),
             ("FG-290", "Instant Noodles Masala (Case of 96)", "1902", 8, "Case", 1150), ("FG-305", "Tea Dust CTC 1kg", "0902", 25, "Pkt", 340)]
    rows, a = [], []
    for i, (code, d, h, q, u, r) in enumerate(items, 1):
        a.append(q * r)
        rows.append([str(i), code, d, h, str(q), u, money(r), money(q * r)])
    bill("04_grocery_distributor_invoice.pdf", "TAX INVOICE", "Annapurna Foods Pvt Ltd", ["APMC Yard, Vashi, Navi Mumbai 400703", "GSTIN: 27AAKCA9071J1ZP"],
         [("Invoice No", "AF/INV/26/5532"), ("Invoice Date", "08-10-2026"), ("Vehicle No", "MH-43-BX-2210")],
         [("", "Patel Kirana Stores, Surat"), ("GSTIN", "24AFTPP3318C1ZB"), ("Place of Supply", "Gujarat")],
         [("Sl", 3, "l"), ("Item Code", 6, "l"), ("Item Description", 27, "l"), ("HSN", 5, "l"), ("Qty", 5, "r"), ("UOM", 5, "l"), ("Rate", 8, "r"), ("Amount", 9, "r")],
         rows, gst_totals(a, 5, inter=True))


# ---------------------------------------------------------------- 5 Bakery supplies (no HSN, no codes)
def f05():
    items = [("Maida Flour 50kg", 10, "Bag", 1890), ("Icing Sugar 1kg", 25, "Pkt", 95), ("Instant Dry Yeast 500g", 12, "Pkt", 260),
             ("Dark Compound Chocolate 2kg Slab", 8, "Slab", 780), ("Whipping Cream Non-Dairy 1L", 30, "Ltr", 240), ("Cake Box 10x10 inch (Bundle of 50)", 6, "Bdl", 650),
             ("Vanilla Essence 500ml", 4, "Btl", 210), ("Butter Paper Roll 12 inch", 10, "Roll", 120)]
    rows, a = priced(items, 1, 3)
    bill("05_bakery_supplies_bill.pdf", "INVOICE", "Baker's Basket Wholesale", ["Frazer Town, Bengaluru 560005", "GSTIN: 29AAGFB2201E1ZT"],
         [("Invoice No", "BB-2310"), ("Invoice Date", "09-10-2026")], [("", "Sweet Crumbs Patisserie, Mysuru")],
         [("Sl", 3, "l"), ("Particulars", 30, "l"), ("Qty", 5, "r"), ("Unit", 5, "l"), ("Rate", 8, "r"), ("Amount", 9, "r")],
         rows, gst_totals(a, 18))


# ---------------------------------------------------------------- 6 Books (ISBN as code)
def f06():
    items = [("978-93-5568-112-4", "NCERT Mathematics Class 10", 50, 165), ("978-81-219-2610-3", "Wren & Martin English Grammar", 30, 520),
             ("978-93-8919-457-9", "Oxford School Atlas 36th Edition", 40, 395), ("978-81-7525-944-6", "Lucent General Knowledge", 25, 280),
             ("", "Ruled Notebook 200 Pages (Pack of 6)", 60, 210), ("", "Geometry Box Student", 45, 120)]
    rows, a = [], []
    for i, (isbn, d, q, r) in enumerate(items, 1):
        a.append(q * r)
        rows.append([str(i), isbn, d, str(q), money(r), money(q * r)])
    bill("06_school_books_invoice.pdf", "BILL OF SUPPLY", "Vidya Book Depot", ["Ashok Rajpath, Patna 800004", "GSTIN: 10AAIPV5521Q1ZF"],
         [("Bill No", "VBD/26/0928"), ("Bill Date", "10-10-2026")], [("", "Gyan Bharti Public School, Gaya")],
         [("Sr", 3, "l"), ("ISBN", 12, "l"), ("Title", 30, "l"), ("Qty", 5, "r"), ("Price", 8, "r"), ("Amount", 9, "r")],
         rows, [("Total", money(sum(a)))], ["Printed books are exempt from GST."])


# ---------------------------------------------------------------- 7 Cosmetics (salon), 2 pages
def f07():
    items = [("Keratin Hair Spa Cream 1kg", "3305", 6, "Jar", 1250), ("Professional Shampoo 1L", "3305", 12, "Btl", 690), ("Hair Colour Cream Shade 4.0 (60g)", "3305", 48, "Tube", 210),
             ("Facial Kit Gold 5 Steps", "3304", 10, "Kit", 540), ("Waxing Liquid Rica 800ml", "3307", 8, "Tin", 980), ("Nail Polish Remover 500ml", "3304", 6, "Btl", 185),
             ("Sunscreen SPF 50 Gel 100g", "3304", 20, "Tube", 345), ("Kajal Pencil Black", "3304", 50, "Pcs", 85), ("Matte Lipstick Assorted", "3304", 40, "Pcs", 299),
             ("Compact Powder Natural Beige", "3304", 25, "Pcs", 250), ("Disposable Towels Roll (100)", "4818", 15, "Roll", 160), ("Hair Serum 100ml", "3305", 18, "Btl", 320),
             ("Bleach Cream Saffron 250g", "3304", 10, "Jar", 210), ("Beard Oil 30ml", "3305", 24, "Btl", 199), ("Neck Tray Plastic", "3924", 5, "Pcs", 140),
             ("Face Wash Neem 200ml", "3401", 30, "Tube", 175), ("Body Lotion Cocoa Butter 400ml", "3304", 12, "Btl", 260), ("Eyeliner Liquid Black", "3304", 36, "Pcs", 145)]
    rows, a = priced(items, 2, 4)
    bill("07_salon_cosmetics_invoice_2pages.pdf", "TAX INVOICE", "Glamour Beauty Supplies", ["Karol Bagh, New Delhi 110005", "GSTIN: 07AAJFG8890B1ZL"],
         [("Invoice No", "GBS/DL/26/1418"), ("Invoice Date", "11-10-2026")], [("", "Looks Unisex Salon, Noida"), ("GSTIN", "09AAKFL2234D1ZQ"), ("Place of Supply", "Uttar Pradesh")],
         [("Sl", 3, "l"), ("Description of Goods", 30, "l"), ("HSN", 5, "l"), ("Qty", 5, "r"), ("Unit", 5, "l"), ("Rate", 8, "r"), ("Amount", 9, "r")],
         rows, gst_totals(a, 18, inter=True), per_page=12)


# ---------------------------------------------------------------- 8 Sports goods (no GSTIN of buyer, codes on some)
def f08():
    items = [("SP-11", "English Willow Cricket Bat Size 6", 5, 7400), ("", "Leather Cricket Ball Red (Pack of 6)", 4, 2850), ("SP-23", "Football Size 5 FIFA Quality", 12, 1650),
             ("", "Badminton Racket Carbon Pair", 8, 2300), ("SP-41", "Shuttlecock Feather (Tube of 10)", 20, 980), ("", "Yoga Mat 6mm Anti-Skid", 25, 650),
             ("SP-57", "Skipping Rope Ball Bearing", 30, 240), ("", "Table Tennis Balls 3 Star (Box of 6)", 15, 420)]
    rows, a = [], []
    for i, (code, d, q, r) in enumerate(items, 1):
        a.append(q * r)
        rows.append([str(i), code, d, str(q), money(r), money(q * r)])
    bill("08_sports_goods_invoice.pdf", "TAX INVOICE", "Champion Sports Jalandhar", ["Basti Nau, Jalandhar 144002", "GSTIN: 03AAEFC4471N1ZB"],
         [("Invoice No", "CSJ-26-0715"), ("Invoice Date", "12-10-2026")], [("", "St. Mary's School Sports Dept, Ludhiana")],
         [("Sl", 3, "l"), ("Code", 6, "l"), ("Item Name", 32, "l"), ("Qty", 5, "r"), ("Rate", 9, "r"), ("Amount", 10, "r")],
         rows, gst_totals(a, 12))


# ---------------------------------------------------------------- 9 Toys (no HSN, no codes, no unit)
def f09():
    items = [("Remote Control Racing Car 1:18", 10, 1450), ("Wooden Building Blocks 50 pcs", 15, 699), ("Soft Teddy Bear 2 ft", 12, 850),
             ("Jigsaw Puzzle 500 pcs India Map", 20, 399), ("Doctor Set Pretend Play", 18, 449), ("Musical Keyboard 37 Keys", 6, 1890), ("Clay Dough 8 Colours", 30, 249)]
    rows, a = priced(items, 1, 2)
    bill("09_toys_retail_invoice.pdf", "TAX INVOICE", "Funskool Toy World", ["Linking Road, Bandra, Mumbai 400050", "GSTIN: 27AABFF3390G1ZM"],
         [("Invoice No", "FTW/7731"), ("Invoice Date", "13-10-2026")], [("", "Little Steps Play School, Thane")],
         [("No.", 3, "l"), ("Article", 32, "l"), ("Qty", 5, "r"), ("MRP", 9, "r"), ("Amount", 10, "r")],
         rows, gst_totals(a, 12))


# ---------------------------------------------------------------- 10 Office furniture
def f10():
    items = [("FN-ERG-01", "Ergonomic Mesh Office Chair High Back", "9401", 12, "Nos", 8900), ("FN-TBL-07", "Engineered Wood Workstation 4 Seater", "9403", 2, "Set", 46500),
             ("FN-CAB-03", "Steel Filing Cabinet 4 Drawer", "9403", 4, "Nos", 12800), ("FN-SOF-02", "3 Seater Fabric Sofa Reception", "9401", 1, "Nos", 32000),
             ("", "Conference Table Teak Finish 10 ft", "9403", 1, "Nos", 58000), ("", "Visitor Chair Cushioned", "9401", 10, "Nos", 2400)]
    rows, a = [], []
    for i, (code, d, h, q, u, r) in enumerate(items, 1):
        a.append(q * r)
        rows.append([str(i), code, d, h, str(q), u, money(r), money(q * r)])
    bill("10_office_furniture_invoice.pdf", "TAX INVOICE", "Godrej Interio Dealer - Workspace Solutions", ["Salt Lake Sector V, Kolkata 700091", "GSTIN: 19AABFW7720K1ZH"],
         [("Invoice No", "WS/KOL/26-27/228"), ("Invoice Date", "14-10-2026"), ("PO Number", "TCS-KOL-PO-88123")],
         [("", "Brightstar Infotech Pvt Ltd"), ("GSTIN", "19AAHCB5512E1ZC"), ("Place of Supply", "West Bengal")],
         [("Sl", 3, "l"), ("Product Code", 8, "l"), ("Item Description", 27, "l"), ("HSN", 5, "l"), ("Quantity", 6, "r"), ("UOM", 5, "l"), ("Unit Price", 9, "r"), ("Total", 10, "r")],
         rows, gst_totals(a, 18, label="Taxable Amount"))


# ---------------------------------------------------------------- 11 Mobile accessories (no codes)
def f11():
    items = [("Fast Charger 33W Type-C", "8504", 50, "Pcs", 549), ("Braided USB-C Cable 1m", "8544", 100, "Pcs", 149), ("Tempered Glass iPhone 15", "7007", 80, "Pcs", 99),
             ("Silicone Back Cover Samsung S24", "3926", 60, "Pcs", 199), ("Bluetooth Earbuds TWS", "8518", 30, "Pcs", 1299), ("Power Bank 10000mAh", "8507", 25, "Pcs", 899),
             ("Car Mobile Holder Magnetic", "8708", 20, "Pcs", 349)]
    rows, a = priced(items, 2, 4)
    bill("11_mobile_accessories_invoice.pdf", "TAX INVOICE", "Gadget Hub Wholesale", ["Gaffar Market, Karol Bagh, Delhi 110005", "GSTIN: 07AAKFG6631M1ZS"],
         [("Invoice No", "GHW/26/3391"), ("Invoice Date", "15-10-2026")], [("", "Mobile Point, Jaipur"), ("GSTIN", "08ACXPM4420N1Z7"), ("Place of Supply", "Rajasthan")],
         [("Sl", 3, "l"), ("Description of Goods", 28, "l"), ("HSN", 5, "l"), ("Qty", 5, "r"), ("Unit", 5, "l"), ("Rate", 8, "r"), ("Amount", 9, "r")],
         rows, gst_totals(a, 18, inter=True))


# ---------------------------------------------------------------- 12 Agriculture inputs
def f12():
    items = [("Hybrid Tomato Seeds 10g", 40, "Pkt", 450), ("Urea 45kg Bag", 30, "Bag", 267), ("DAP Fertilizer 50kg", 20, "Bag", 1350), ("Neem Oil Pesticide 1L", 15, "Btl", 380),
             ("Drip Irrigation Lateral Pipe 16mm (Roll 400m)", 4, "Roll", 3200), ("Vermicompost Organic 25kg", 25, "Bag", 300), ("Knapsack Sprayer 16L", 6, "Nos", 1850)]
    rows, a = priced(items, 1, 3)
    bill("12_agri_inputs_bill.pdf", "CASH / CREDIT BILL", "Kisan Seva Kendra", ["Mandi Road, Nashik 422001", "GSTIN: 27ABCPK2210H1ZE", "Fert. Lic No: NSK/FL/1187"],
         [("Bill No", "KSK-1902"), ("Date", "16-10-2026")], [("", "Shri Ramesh Patil, Niphad")],
         [("Sl", 3, "l"), ("Particulars", 32, "l"), ("Qty", 5, "r"), ("Unit", 5, "l"), ("Rate", 8, "r"), ("Amount", 9, "r")],
         rows, [("Total", money(sum(a)))])


# ---------------------------------------------------------------- 13 Footwear
def f13():
    items = [("FW-RN-41", "Running Shoes Men Mesh Grey", "7, 8, 9, 10", 24, 1899), ("FW-SN-12", "Canvas Sneakers Unisex White", "6, 7, 8", 30, 999),
             ("", "Leather Formal Shoes Oxford Black", "7, 8, 9", 18, 2799), ("", "Kolhapuri Chappal Women Tan", "5, 6, 7", 40, 549),
             ("FW-SL-03", "Rubber Slippers Daily Wear", "6 to 10", 100, 149), ("", "School Shoes Black Velcro Kids", "1 to 5", 60, 599)]
    rows, a = [], []
    for i, (code, d, sizes, q, r) in enumerate(items, 1):
        a.append(q * r)
        rows.append([str(i), code, d, sizes, str(q), money(r), money(q * r)])
    bill("13_footwear_invoice.pdf", "TAX INVOICE", "Agra Footwear Traders", ["Hing Ki Mandi, Agra 282003", "GSTIN: 09AAHFA5512P1ZT"],
         [("Invoice No", "AFT/26/0644"), ("Invoice Date", "17-10-2026")], [("", "Shoe Palace, Lucknow"), ("GSTIN", "09ACMPS7721R1ZD")],
         [("Sl", 3, "l"), ("Article No", 7, "l"), ("Item Description", 28, "l"), ("Sizes", 7, "l"), ("Pairs", 5, "r"), ("Rate", 8, "r"), ("Amount", 9, "r")],
         rows, gst_totals(a, 12))


# ---------------------------------------------------------------- 14 Handicrafts export proforma (USD-free, INR)
def f14():
    items = [("Hand Block Printed Cotton Cushion Cover 16x16", 200, "Pcs", 180), ("Brass Diya Set of 5", 150, "Set", 420), ("Jute Shopping Bag Embroidered", 300, "Pcs", 95),
             ("Madhubani Painting on Handmade Paper A3", 40, "Pcs", 650), ("Marble Inlay Coaster Set of 4", 80, "Set", 560), ("Leather Journal Handmade A5", 120, "Pcs", 340)]
    rows, a = priced(items, 1, 3)
    bill("14_handicrafts_export_proforma.pdf", "PROFORMA INVOICE", "Crafts of India Exports", ["Sanganer, Jaipur 302029", "GSTIN: 08AAGFC1182L1ZQ", "IEC: 1314001234"],
         [("Proforma No", "COIE/PI/26/77"), ("Date", "18-10-2026")], [("", "Maison du Monde Import, Lyon, France")],
         [("Sl", 3, "l"), ("Description of Goods", 32, "l"), ("Qty", 5, "r"), ("Unit", 5, "l"), ("Rate", 8, "r"), ("Amount", 9, "r")],
         rows, [("Total (Ex-Works)", money(sum(a)))], ["Export under LUT, no GST charged."])


# ---------------------------------------------------------------- 15 Tea and spices (codes, HSN)
def f15():
    items = [("TS-A01", "Assam CTC Tea BOP Grade 25kg Sack", "0902", 10, "Sack", 6250), ("TS-D07", "Darjeeling First Flush Loose Leaf 1kg", "0902", 8, "Kg", 2400),
             ("SP-C11", "Black Pepper Malabar Garbled 10kg", "0904", 6, "Bag", 6400), ("SP-C15", "Green Cardamom 8mm Bold 1kg", "0908", 12, "Kg", 2850),
             ("SP-T20", "Turmeric Powder Erode 5kg", "0910", 15, "Pkt", 760), ("", "Kashmiri Chilli Powder 1kg", "0904", 20, "Pkt", 420), ("", "Cinnamon Sticks Ceylon 500g", "0906", 10, "Pkt", 390)]
    rows, a = [], []
    for i, (code, d, h, q, u, r) in enumerate(items, 1):
        a.append(q * r)
        rows.append([str(i), code, d, h, str(q), u, money(r), money(q * r)])
    bill("15_tea_spices_invoice.pdf", "TAX INVOICE", "Malabar Spice & Tea Co.", ["Mattancherry, Kochi 682002", "GSTIN: 32AAFFM9921C1Z4"],
         [("Invoice No", "MSTC/26/2208"), ("Invoice Date", "19-10-2026")], [("", "The Tea Room Cafe, Bengaluru"), ("GSTIN", "29AAGFT4410K1ZW"), ("Place of Supply", "Karnataka")],
         [("Sl", 3, "l"), ("Item Code", 6, "l"), ("Description of Goods", 28, "l"), ("HSN", 5, "l"), ("Qty", 5, "r"), ("Unit", 5, "l"), ("Rate", 8, "r"), ("Amount", 9, "r")],
         rows, gst_totals(a, 5, inter=True))


# ---------------------------------------------------------------- 16 Restaurant produce cash memo (no GSTIN, no unit column)
def f16():
    items = [("Onion Nashik (kg)", 50, 34), ("Tomato Hybrid (kg)", 40, 28), ("Paneer Fresh (kg)", 12, 360), ("Coriander Leaves (bunch)", 30, 10),
             ("Milk Toned (litre)", 60, 54), ("Curd (kg)", 15, 70), ("Green Chilli (kg)", 5, 60)]
    rows, a = priced(items, 1, 2)
    bill("16_restaurant_produce_cash_memo.pdf", "CASH MEMO", "Fresh Farm Vegetables", ["Market Yard, Pune 411037"], [("Memo No", "2291"), ("Date", "19-10-2026")], [],
         [("Sl", 3, "l"), ("Item", 30, "l"), ("Qty", 6, "r"), ("Rate", 8, "r"), ("Amount", 9, "r")], rows, [("Total", money(sum(a)))], ["Thank you."])


# ---------------------------------------------------------------- 17 Florist / event decor (no date printed)
def f17():
    items = [("Marigold Garland Orange 5 ft", 120, 45), ("Rose Bunch Red (20 stems)", 40, 260), ("Mogra Veni Jasmine", 200, 20), ("Orchid Purple Stem", 60, 85),
             ("Table Centrepiece Arrangement", 25, 650), ("Stage Backdrop Floral Decor", 1, 18000)]
    rows, a = priced(items, 1, 2)
    bill("17_florist_event_bill.pdf", "INVOICE", "Phoolwala Event Florists", ["Chandni Chowk, Delhi 110006", "GSTIN: 07AAMFP5531J1Z9"], [("Invoice No", "PEF-0417")],
         [("", "Sharma Wedding, Farm House Chattarpur")],
         [("S.No", 3, "l"), ("Description", 32, "l"), ("Qty", 6, "r"), ("Rate", 9, "r"), ("Amount", 10, "r")], rows, gst_totals(a, 18))


# ---------------------------------------------------------------- 18 Readymade garments stock (Excel, sizes, codes on some)
def f18():
    wb = Workbook()
    ws = wb.active
    ws.title = "Stock"
    ws.append(["Style No", "Product", "Colour", "Size", "Qty", "MRP", "Value"])
    data = [("RG-501", "Men Cotton Formal Shirt Slim Fit", "Sky Blue", "40", 24, 1299), ("RG-502", "Men Cotton Formal Shirt Slim Fit", "White", "42", 30, 1299),
            ("", "Women Kurti Rayon Printed", "Mustard", "M", 40, 899), ("", "Women Kurti Rayon Printed", "Teal", "L", 35, 899),
            ("RG-610", "Kids Denim Jeans Stretch", "Blue", "8-9Y", 20, 749), ("", "Men Polo T-Shirt Pique", "Navy", "XL", 45, 599),
            ("RG-722", "Women Leggings Cotton Lycra", "Black", "Free", 60, 349), ("", "Men Track Pants Polyester", "Grey", "L", 28, 699)]
    for code, p, col, size, q, mrp in data:
        ws.append([code, p, col, size, q, mrp, q * mrp])
    wb.save("18_garments_stock_list.xlsx")


# ---------------------------------------------------------------- 19 Fashion jewellery (CSV, no HSN, no codes, no date)
def f19():
    with open("19_fashion_jewellery_purchase.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Item", "Qty", "Rate", "Amount"])
        for d, q, r in [("Oxidised Silver Jhumka Earrings", 50, 120), ("Kundan Choker Necklace Set", 20, 650), ("American Diamond Ring Adjustable", 40, 180),
                        ("Pearl Mala 3 Line", 15, 520), ("Lac Bangles Set of 12 Rajasthani", 60, 95), ("Anklet Payal Ghungroo", 30, 140), ("Maang Tikka Bridal", 25, 260)]:
            w.writerow([d, q, r, q * r])


# ---------------------------------------------------------------- 20 General store purchase register (Excel, many suppliers, gaps)
def f20():
    wb = Workbook()
    ws = wb.active
    ws.title = "Purchases"
    ws.append(["Bill No", "Bill Date", "Supplier", "Product Name", "HSN", "Qty", "Unit", "Rate", "Amount"])
    data = [("A-1101", "03-10-2026", "Hindustan Distributors", "Detergent Powder 1kg", "3402", 40, "Pkt", 110), ("A-1101", "03-10-2026", "Hindustan Distributors", "Toothpaste 150g", "3306", 60, "Pcs", 95),
            ("SR-88", "06-10-2026", "Sai Ram Agencies", "Mosquito Repellent Refill", "3808", 48, "Pcs", 72), ("SR-88", "06-10-2026", "Sai Ram Agencies", "Agarbatti Sandal 100 sticks", "3307", 100, "Pkt", 45),
            ("", "", "Local Purchase", "Steel Tiffin Box 3 Tier", "", 10, "Nos", 420), ("", "", "Local Purchase", "Umbrella Folding 3 Fold", "", 15, "Nos", 260),
            ("K/552", "12-10-2026", "Krishna Plastics", "Plastic Storage Container 5L", "3924", 24, "Nos", 135), ("K/552", "12-10-2026", "Krishna Plastics", "Water Bottle 1L BPA Free", "3924", 36, "Nos", 89)]
    for b, d, s, p, h, q, u, r in data:
        ws.append([b, d, s, p, h, q, u, r, q * r])
    wb.save("20_general_store_purchase_register.xlsx")


if __name__ == "__main__":
    for f in (f01, f02, f03, f04, f05, f06, f07, f08, f09, f10, f11, f12, f13, f14, f15, f16, f17, f18, f19, f20):
        f()
    print("made 20 files")
