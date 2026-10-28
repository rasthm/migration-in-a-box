import type { Extractor, Template, TemplateColumn } from '../types'

// Free templates the user can start from. Each one names the headings it expects; a column
// whose heading is missing in a file stays empty and the preview warns about it.

const col = (name: string, extractor: Extractor, type: TemplateColumn['type'] = 'text'): TemplateColumn => ({
  id: name,
  name,
  type,
  extractor,
})
const table = (header: string, type: TemplateColumn['type'] = 'text') => col(header, { kind: 'tableColumn', header }, type)
const doc = (label: string, name = label, type: TemplateColumn['type'] = 'text') => col(name, { kind: 'docField', label }, type)

export interface Starter {
  template: Template
  expects: string // shown under the picker
}

export const STARTERS: Starter[] = [
  {
    expects: 'Invoices with Description of Goods, HSN/SAC, Qty, Rate, GST %, Amount and Invoice No / Date / GSTIN printed above',
    template: {
      id: 'starter-invoice-items',
      name: 'Invoice items (one row per item, invoice details on every row)',
      rowMode: 'tableRows',
      columns: [
        doc('Invoice No'),
        doc('Invoice Date', 'Invoice Date', 'date'),
        doc('GSTIN', 'Seller GSTIN'),
        doc('GSTIN (2)', 'Buyer GSTIN'),
        table('Description of Goods'),
        col('Item type', { kind: 'classify', header: 'Description of Goods', what: 'type' }),
        col('Material', { kind: 'classify', header: 'Description of Goods', what: 'material' }),
        table('HSN/SAC'),
        table('Qty', 'number'),
        table('Rate', 'number'),
        table('GST %'),
        table('Amount', 'number'),
        doc('Taxable Value', 'Taxable Value', 'number'),
        doc('CGST', 'CGST', 'number'),
        doc('SGST', 'SGST', 'number'),
        doc('Grand Total', 'Grand Total', 'number'),
        col('File name', { kind: 'fileName' }),
      ],
    },
  },
  {
    expects: 'Invoices with Invoice No / Date / GSTIN above the table and Taxable Value / CGST / SGST / Grand Total below',
    template: {
      id: 'starter-invoice-summary',
      name: 'Invoice summary (one row per invoice)',
      rowMode: 'onePerFile',
      columns: [
        doc('Invoice No'),
        doc('Invoice Date', 'Invoice Date', 'date'),
        doc('GSTIN', 'Seller GSTIN'),
        doc('GSTIN (2)', 'Buyer GSTIN'),
        doc('Place of Supply'),
        doc('Taxable Value', 'Taxable Value', 'number'),
        doc('CGST rate'),
        doc('CGST', 'CGST', 'number'),
        doc('SGST rate'),
        doc('SGST', 'SGST', 'number'),
        doc('Grand Total', 'Grand Total', 'number'),
        col('Pages', { kind: 'pageCount' }),
        col('File name', { kind: 'fileName' }),
      ],
    },
  },
  {
    expects: 'Purchase orders with Item Code, Item Name, Quantity, Unit Price, Line Total and PO Number / PO Date / Vendor above',
    template: {
      id: 'starter-purchase-order',
      name: 'Purchase order lines',
      rowMode: 'tableRows',
      columns: [
        doc('PO Number'),
        doc('PO Date', 'PO Date', 'date'),
        doc('Vendor'),
        doc('Delivery by', 'Delivery by', 'date'),
        table('Item Code'),
        table('Item Name'),
        col('Item type', { kind: 'classify', header: 'Item Name', what: 'type' }),
        table('Quantity', 'number'),
        table('Unit Price', 'number'),
        table('Line Total', 'number'),
      ],
    },
  },
  {
    expects: 'Price lists with Particulars, Unit, Rate (Rs.) and MRP columns',
    template: {
      id: 'starter-price-list',
      name: 'Price list / product catalogue',
      rowMode: 'tableRows',
      columns: [
        table('Particulars'),
        col('Item type', { kind: 'classify', header: 'Particulars', what: 'type' }),
        col('Material', { kind: 'classify', header: 'Particulars', what: 'material' }),
        table('Unit', 'unit'),
        table('Rate (Rs.)', 'number'),
        table('MRP', 'number'),
        col('Page', { kind: 'pageNumber' }),
        col('File name', { kind: 'fileName' }),
      ],
    },
  },
  {
    expects: 'Any files: lists every file with its folder and page count (good for cataloguing a big folder)',
    template: {
      id: 'starter-file-catalogue',
      name: 'File catalogue (one row per file)',
      rowMode: 'onePerFile',
      columns: [col('File name', { kind: 'fileName' }), col('Folder / path', { kind: 'filePath' }), col('Pages', { kind: 'pageCount' })],
    },
  },
]
