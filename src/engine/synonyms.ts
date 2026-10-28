import { normalizeHeader } from './pdfExtract'

// Headings and document details that mean the same thing on different bills ("Qty" / "Quantity",
// "Bill No" / "Invoice No"). Files from different sellers then share one Excel column. Keys are
// normalizeHeader() forms. Table headings and document details are kept apart: "Total" in a table
// is the line amount, while "Total" printed under it is the bill total.

interface Group {
  name: string // the column name used when files disagree
  keys: string[]
}

const TABLE_GROUPS: Group[] = [
  { name: 'Qty', keys: ['qty', 'quantity', 'qnty', 'qtynos', 'pairs'] },
  { name: 'Unit', keys: ['unit', 'uom', 'units', 'pack'] },
  { name: 'Rate', keys: ['rate', 'unitprice', 'price', 'raters', 'rateinr', 'priceperunit', 'unitrate'] },
  { name: 'Amount', keys: ['amount', 'total', 'linetotal', 'value', 'amt', 'amountrs', 'amountinr', 'totalamount'] },
  { name: 'HSN/SAC', keys: ['hsn', 'hsnsac', 'hsncode', 'sac', 'hsnsaccode'] },
  { name: 'Item Code', keys: ['itemcode', 'productcode', 'code', 'sku', 'partno', 'partnumber', 'modelno', 'styleno', 'articleno', 'designno', 'isbn'] },
  { name: 'GST %', keys: ['gst', 'gstrate', 'tax', 'taxrate'] },
  { name: 'Disc %', keys: ['disc', 'discount'] },
  { name: 'Batch No', keys: ['batchno', 'batch', 'lotno'] },
]

const FIELD_GROUPS: Group[] = [
  { name: 'Invoice / Bill No', keys: ['invoiceno', 'invoicenumber', 'invno', 'billno', 'billnumber', 'memono', 'cashmemono', 'voucherno', 'proformano'] },
  { name: 'Invoice / Bill Date', keys: ['invoicedate', 'billdate', 'date', 'dated', 'memodate', 'voucherdate'] },
  { name: 'Taxable Value', keys: ['taxablevalue', 'taxableamount', 'subtotal'] },
  { name: 'Grand Total', keys: ['grandtotal', 'nettotal', 'netamount', 'amountpayable', 'total', 'totalamount'] },
]

const groupOf = (groups: Group[], label: string) => {
  const key = normalizeHeader(label)
  return groups.find((g) => g.keys.includes(key))
}

// The first of `available` that means the same as `wanted` (exact match first).
function find(groups: Group[], wanted: string, available: string[]): string | undefined {
  const key = normalizeHeader(wanted)
  const exact = available.find((a) => normalizeHeader(a) === key)
  if (exact !== undefined) return exact
  const g = groupOf(groups, wanted)
  return g ? available.find((a) => g.keys.includes(normalizeHeader(a))) : undefined
}

export const findHeading = (wanted: string, headings: string[]) => find(TABLE_GROUPS, wanted, headings)
export const findDetail = (wanted: string, details: string[]) => find(FIELD_GROUPS, wanted, details)

// One key per meaning, for de-duplicating columns across files.
export const headingKey = (h: string) => groupOf(TABLE_GROUPS, h)?.name ?? normalizeHeader(h)
export const detailKey = (d: string) => groupOf(FIELD_GROUPS, d)?.name ?? normalizeHeader(d)
export const headingName = (h: string) => groupOf(TABLE_GROUPS, h)?.name
export const detailName = (d: string) => groupOf(FIELD_GROUPS, d)?.name
