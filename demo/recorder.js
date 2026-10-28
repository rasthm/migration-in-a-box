// Drives the app for the screen recording: a visible pointer, click ripples, captions and
// a dragged "files" card. Loaded into the page with:  await import('/demo/recorder.js')
// then:  window.runDemo(durationsMs)  -> scene start times (ms since epoch) in window.demoStarts.

const css = document.createElement('style')
css.textContent = `#demo-cursor{position:fixed;left:0;top:0;width:28px;height:28px;z-index:99999;pointer-events:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))}
#demo-cap{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99998;background:rgba(10,14,20,.9);color:#fff;font:600 20px system-ui;padding:12px 22px;border-radius:12px;border:1px solid #3b82f6;pointer-events:none;transition:opacity .4s;white-space:nowrap}
.demo-ripple{position:fixed;width:18px;height:18px;border-radius:50%;border:3px solid #60a5fa;z-index:99997;pointer-events:none;animation:demorip .6s ease-out forwards}
@keyframes demorip{from{transform:translate(-50%,-50%) scale(.5);opacity:1}to{transform:translate(-50%,-50%) scale(3.2);opacity:0}}
.demo-file{position:fixed;left:0;top:0;z-index:99996;background:#1e293b;color:#e2e8f0;border:1px solid #60a5fa;border-radius:8px;padding:8px 12px;font:14px system-ui;pointer-events:none;transition:transform 1.4s cubic-bezier(.4,0,.2,1),opacity .4s;box-shadow:0 6px 20px rgba(0,0,0,.5)}
.demo-hl{outline:3px solid #fbbf24 !important;outline-offset:3px;border-radius:6px}`
document.head.appendChild(css)
const cur = document.createElement('div')
cur.id = 'demo-cursor'
cur.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M3 2l7 19 2.5-7.5L20 11z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>'
document.body.appendChild(cur)
const cap = document.createElement('div')
cap.id = 'demo-cap'
cap.style.opacity = '0'
document.body.appendChild(cap)
window.confirm = () => true // the demo answers "OK" to the app's confirm questions
addEventListener('beforeunload', (e) => e.stopImmediatePropagation(), true)

const D = {
  x: innerWidth / 2,
  y: innerHeight / 2,
  wait: (ms) => new Promise((r) => setTimeout(r, ms)),
  caption(t) {
    cap.textContent = t
    cap.style.opacity = t ? '1' : '0'
  },
  async move(x, y, ms = 900) {
    cur.style.transition = `transform ${ms}ms cubic-bezier(.4,0,.2,1)`
    cur.style.transform = `translate(${x}px,${y}px)`
    this.x = x
    this.y = y
    await this.wait(ms + 80)
  },
  find(sel, text) {
    const els = [...document.querySelectorAll(sel)]
    return text ? els.find((e) => e.innerText?.trim().startsWith(text)) : els[0]
  },
  async to(el, dx = 0.5, dy = 0.5) {
    if (!el) return
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    await this.wait(400)
    const r = el.getBoundingClientRect()
    await this.move(r.left + r.width * dx, r.top + r.height * dy)
  },
  ripple() {
    const d = document.createElement('div')
    d.className = 'demo-ripple'
    d.style.left = this.x + 'px'
    d.style.top = this.y + 'px'
    document.body.appendChild(d)
    setTimeout(() => d.remove(), 700)
  },
  async click(el) {
    if (!el) return
    await this.to(el)
    this.ripple()
    await this.wait(150)
    el.click()
    await this.wait(450)
  },
  async hl(el, ms = 1500) {
    if (!el) return
    el.classList.add('demo-hl')
    await this.wait(ms)
    el.classList.remove('demo-hl')
  },
  async typeInto(el, text) {
    await this.click(el)
    const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set
    let v = ''
    for (const ch of text) {
      v += ch
      set.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      await this.wait(40)
    }
  },
  pick(sel, value) {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, value)
    sel.dispatchEvent(new Event('change', { bubbles: true }))
  },
  async dropFiles(names) {
    const zone = this.find('.drop-title').parentElement
    const zr = zone.getBoundingClientRect()
    const files = []
    for (const n of names) {
      const b = await (await fetch('/test-fixtures/' + n)).blob()
      files.push(new File([b], n.split('/').pop(), { type: n.endsWith('.pdf') ? 'application/pdf' : '' }))
    }
    const card = document.createElement('div')
    card.className = 'demo-file'
    card.innerHTML = `📄 ${names.length} files<br><span style="opacity:.7">${files.slice(0, 3).map((f) => f.name).join(', ')}…</span>`
    const sx = innerWidth * 0.55
    const sy = innerHeight * 0.7
    card.style.transition = 'none'
    card.style.transform = `translate(${sx}px,${sy}px)`
    document.body.appendChild(card)
    await this.move(sx + 20, sy + 20, 700)
    card.style.transition = ''
    const tx = zr.left + zr.width / 2 - 100
    const ty = zr.top + zr.height / 2 - 20
    cur.style.transition = 'transform 1.4s cubic-bezier(.4,0,.2,1)'
    cur.style.transform = `translate(${tx + 20}px,${ty + 20}px)`
    this.x = tx + 20
    this.y = ty + 20
    card.style.transform = `translate(${tx}px,${ty}px)`
    zone.classList.add('over')
    await this.wait(1500)
    const dt = new DataTransfer()
    files.forEach((f) => dt.items.add(f))
    card.style.opacity = '0'
    zone.classList.remove('over')
    this.ripple()
    zone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
    setTimeout(() => card.remove(), 500)
  },
}

// Each scene lasts at least as long as its narration, so voice and picture stay together.
async function scene(ms, fn) {
  const t0 = Date.now()
  await fn()
  const left = ms - (Date.now() - t0)
  if (left > 0) await D.wait(left)
  return t0
}

window.runDemo = async (ms) => {
  const s = (window.demoStarts = {})
  window.scrollTo(0, 0)
  await D.move(innerWidth * 0.5, innerHeight * 0.45, 10)
  await D.wait(1500)

  s.intro = await scene(ms[0], async () => {
    D.caption('Migration-in-a-box: your files into one clean Excel')
    const badge = D.find('*', 'Runs in your browser.')
    await D.to(badge)
    await D.hl(badge, 2500)
    for (const h of ['1. Files', '2. Template', '3. Preview']) {
      await D.to(D.find('.panel-head h2', h))
      await D.wait(1200)
    }
  })
  s.drop = await scene(ms[1], async () => {
    D.caption('1. Drag your files in: PDFs, Excel, CSV, even scanned pages')
    await D.dropFiles([
      'realistic/invoice_electricals_01.pdf', 'realistic/invoice_electricals_02.pdf', 'realistic/invoice_electricals_03.pdf',
      'realistic/invoice_pipes_01.pdf', 'realistic/invoice_pipes_02.pdf', 'realistic/invoice_pipes_03.pdf',
      'sheets/stock_list.xlsx', 'scanned_invoice.pdf',
    ])
    await D.wait(2500)
    await D.to(D.find('li', 'invoice_electricals_02'), 0.85)
    await D.wait(900)
    await D.to(D.find('li', 'stock_list'), 0.85)
  })
  s.ocr = await scene(ms[2], async () => {
    D.caption('2. A scanned page? Read it with OCR, right on this computer')
    await D.click(D.find('button', 'Read scanned pages'))
    for (let i = 0; i < 40; i++) {
      await D.wait(500)
      if (/Read by OCR/.test(D.find('li', 'scanned_invoice')?.innerText ?? '')) break
    }
    await D.hl(D.find('li', 'scanned_invoice'), 2000)
  })
  s.auto = await scene(ms[3], async () => {
    D.caption('3. Auto mode suggests the right template')
    await D.click(D.find('button', 'Auto'))
    await D.wait(800)
    const sug = D.find('[role=status]', 'Suggested')
    await D.to(sug, 0.3)
    await D.hl(sug, 2200)
    await D.click(D.find('button', 'Use it'))
    await D.wait(600)
  })
  s.preview = await scene(ms[4], async () => {
    D.caption('One complete line per item: invoice details, item and totals')
    const wrap = document.querySelector('.table-wrap')
    await D.to(wrap, 0.3, 0.2)
    await D.hl(wrap, 3500)
    await D.to(wrap, 0.75, 0.3)
    await D.wait(2500)
    for (let i = 0; i < 50; i++) {
      wrap.scrollLeft += 28
      await D.wait(60)
    }
    await D.to(wrap, 0.6, 0.35)
    await D.wait(3000)
    D.caption('The proof line checks that every invoice adds up')
    const proof = D.find('[role=status]', 'Proof')
    await D.to(proof, 0.4)
    await D.hl(proof, 3000)
    wrap.scrollLeft = 0
  })
  s.build = await scene(ms[5], async () => {
    D.caption('4. Or build your own columns: click or drag fields')
    await D.click(D.find('button', 'Remove all columns'))
    await D.wait(500)
    for (const f of ['Invoice No', 'Invoice Date', 'Description of Goods', 'Qty', 'Amount']) {
      await D.click(D.find('.chip', f))
      await D.wait(250)
    }
    const sel = [...document.querySelectorAll('.column')]
      .find((c) => c.querySelector('.col-name')?.value === 'Invoice Date')
      ?.querySelector('select')
    if (sel) {
      await D.to(sel)
      D.ripple()
      D.pick(sel, 'date')
      await D.hl(sel, 1500)
    }
  })
  s.ai = await scene(ms[6], async () => {
    D.caption('5. Or describe it to the AI helper (only column names are sent)')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    await D.wait(600)
    const sum = D.find('summary', 'AI helper')
    await D.click(sum)
    await D.wait(300)
    await D.typeInto(document.querySelector('details[open] textarea'), 'One row per item with invoice number, date, item and amount')
    const pre = document.querySelector('details[open] pre')
    await D.to(pre, 0.4)
    await D.hl(pre, 2500)
    sum.click()
  })
  s.finish = await scene(ms[7], async () => {
    D.caption('6. Save it to your Library, then download the Excel')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    await D.wait(600)
    await D.click(D.find('summary', 'Library'))
    await D.wait(300)
    await D.click(D.find('button', 'Save this page'))
    await D.wait(800)
    const sheets = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.value === 'file'))
    await D.to(sheets)
    D.ripple()
    D.pick(sheets, 'file')
    await D.hl(sheets, 1200)
    const dl = D.find('button', 'Download Excel')
    await D.to(dl)
    await D.hl(dl, 1800)
    D.caption('Migration-in-a-box')
  })
  s.end = Date.now()
  window.demoDone = true
  document.title = 'DEMO ' + Object.values(s).join(',') // read back from the window title for the voice timing
}
