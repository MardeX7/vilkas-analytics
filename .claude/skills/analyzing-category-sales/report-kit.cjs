/**
 * Report kit — charts, tokens and PDF rendering for sales reports.
 *
 * Colors are a VALIDATED categorical pair. Do not substitute hexes without
 * re-running the dataviz validator:
 *   node <dataviz-skill>/scripts/validate_palette.js "#2a78d6,#eb6834" --mode light
 *   node <dataviz-skill>/scripts/validate_palette.js "#3987e5,#d95926" --mode dark
 * Both pass all six checks (lightness band, chroma, CVD separation,
 * normal-vision floor, contrast) against surfaces #fcfcfb / #1a1a19.
 *
 * Every chart emits `var(--token)` fills, so the same SVG works in a light-only
 * PDF and in a theme-aware Artifact. Series order is fixed: s1 = earlier period,
 * s2 = later period. Never cycle it.
 */
const { execFileSync } = require('child_process')
const fs = require('fs')

// ---------------------------------------------------------------- formatting
const nf = (n, d = 0) => n.toLocaleString('fi-FI', { minimumFractionDigits: d, maximumFractionDigits: d })
const pct = (a, b) => { const v = 100 * (b / a - 1); return (v >= 0 ? '+' : '−') + nf(Math.abs(v), 0) + ' %' }
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// -------------------------------------------------------------------- tokens
const LIGHT = {
  ground: '#f2f2ef', panel: '#fcfcfb', ink: '#16181c', ink2: '#5a5f66', ink3: '#8b8f95',
  rule: '#dedfda', grid: '#e7e7e2', s1: '#2a78d6', s2: '#eb6834', up: '#2a78d6', dn: '#e34948',
}
const DARK = {
  ground: '#111110', panel: '#1a1a19', ink: '#f4f4f1', ink2: '#a8a89f', ink3: '#7d7d76',
  rule: '#2e2e2b', grid: '#282826', s1: '#3987e5', s2: '#d95926', up: '#3987e5', dn: '#e66767',
}
const decl = t => Object.entries(t).map(([k, v]) => `--${k}:${v}`).join(';')

/** Light-only token block. Use for PDF, where there is no viewer theme. */
const tokensPrint = () => `:root{color-scheme:light;${decl(LIGHT)}}`

/**
 * Theme-aware token block for Artifacts. Covers all three viewer states:
 * bare :root (light), OS dark, and an explicit data-theme stamp either way.
 */
const tokensWeb = () => `
:root{color-scheme:light;${decl(LIGHT)}}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;${decl(DARK)}}}
:root[data-theme="dark"]{color-scheme:dark;${decl(DARK)}}`

const V = k => `var(--${k})`

// -------------------------------------------------------------------- charts
/** Grouped bars: one group per category, two series. Value labels on every bar. */
function groupedBars({ labels, y1, y2, max, unit = '', W = 440, H = 205 }) {
  const m = { t: 18, r: 8, b: 34, l: 46 }, iw = W - m.l - m.r, ih = H - m.t - m.b
  const gw = iw / labels.length, bw = Math.min(28, (gw - 16) / 2), ticks = 4, step = max / ticks
  const y = v => m.t + ih - (v / max) * ih
  // Value labels sit centred on bars only `bw + 2` apart. Five-digit money values
  // are wider than that and collide, so compact them when they cannot fit.
  const widest = Math.max(...[...y1, ...y2].map(v => nf(v).length))
  const compact = widest * 5.4 > bw + 2   // ~5.4px per digit at font-size 9
  const barLabel = v => compact && Math.abs(v) >= 1000 ? nf(v / 1000, 1) + 'k' : nf(v)
  let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img">`
  for (let i = 0; i <= ticks; i++) {
    const v = step * i
    s += `<line x1="${m.l}" y1="${y(v)}" x2="${W - m.r}" y2="${y(v)}" stroke="${V('grid')}" stroke-width="1"/>`
    s += `<text x="${m.l - 7}" y="${y(v) + 3.5}" text-anchor="end" font-size="9.5" fill="${V('ink3')}">${nf(v)}</text>`
  }
  labels.forEach((lab, i) => {
    const cx = m.l + gw * i + gw / 2
    ;[{ v: y1[i], c: V('s1'), off: -bw - 1 }, { v: y2[i], c: V('s2'), off: 1 }].forEach(b => {
      const h = Math.max(0, (b.v / max) * ih), x = cx + b.off, yy = m.t + ih - h, r = Math.min(4, h / 2)
      // 4px rounded data-end, anchored to the baseline; 2px gap between the pair
      if (h > 0) s += `<path d="M${x} ${m.t + ih} L${x} ${yy + r} Q${x} ${yy} ${x + r} ${yy} L${x + bw - r} ${yy} Q${x + bw} ${yy} ${x + bw} ${yy + r} L${x + bw} ${m.t + ih} Z" fill="${b.c}"/>`
      s += `<text x="${x + bw / 2}" y="${yy - 5}" text-anchor="middle" font-size="9" fill="${V('ink2')}" font-weight="600">${barLabel(b.v)}</text>`
    })
    s += `<text x="${cx}" y="${H - 12}" text-anchor="middle" font-size="9.5" fill="${V('ink2')}">${esc(lab)}</text>`
  })
  s += `<line x1="${m.l}" y1="${m.t + ih}" x2="${W - m.r}" y2="${m.t + ih}" stroke="${V('rule')}" stroke-width="1"/>`
  return s + `<text x="2" y="${m.t - 6}" font-size="9" fill="${V('ink3')}">${esc(unit)}</text></svg>`
}

/**
 * Two-series line chart. Labels ONLY the endpoints — labelling every point
 * collides whenever the two series share a value (they will).
 */
function lineChart({ labels, y1, y2, max, names = ['2025', '2026'], suffix = ' %', W = 440, H = 190 }) {
  const m = { t: 18, r: 34, b: 32, l: 44 }, iw = W - m.l - m.r, ih = H - m.t - m.b
  const x = i => m.l + (iw / (labels.length - 1)) * i, y = v => m.t + ih - (v / max) * ih
  const ticks = 4, step = max / ticks
  let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img">`
  for (let i = 0; i <= ticks; i++) {
    const v = step * i
    s += `<line x1="${m.l}" y1="${y(v)}" x2="${W - m.r}" y2="${y(v)}" stroke="${V('grid')}" stroke-width="1"/>`
    s += `<text x="${m.l - 7}" y="${y(v) + 3.5}" text-anchor="end" font-size="9.5" fill="${V('ink3')}">${nf(v)}${suffix}</text>`
  }
  ;[{ d: y1, c: V('s1') }, { d: y2, c: V('s2') }].forEach(se => {
    s += `<path d="${se.d.map((v, i) => (i ? 'L' : 'M') + x(i) + ' ' + y(v)).join(' ')}" fill="none" stroke="${se.c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
    se.d.forEach((v, i) => { s += `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${se.c}" stroke="${V('panel')}" stroke-width="2"/>` })
  })
  labels.forEach((lab, i) => s += `<text x="${x(i)}" y="${H - 11}" text-anchor="middle" font-size="9.5" fill="${V('ink2')}">${esc(lab)}</text>`)
  ;[{ d: y1, n: names[0] }, { d: y2, n: names[1] }].forEach((se, k) => {
    const i = se.d.length - 1, v = se.d[i], other = (k ? y1 : y2)[i]
    // Break ties deterministically: on equal endpoints series 1 goes above and
    // series 2 below. `v >= other` for both would stack them on the same spot.
    const above = k === 0 ? v >= other : v > other
    s += `<text x="${x(i) - 7}" y="${y(v) + (above ? -10 : 15)}" text-anchor="end" font-size="9" fill="${V('ink2')}" font-weight="600">${esc(se.n)}: ${nf(v, 1)}${suffix}</text>`
  })
  return s + `</svg>`
}

/**
 * Signed horizontal bars for change/movers. Diverging blue↔red (validated pair).
 * Rows: {label, value, note?}. Pass FULL labels — the chart truncates them to the
 * space actually left after the note gutter. Truncating in the caller cannot know
 * that width, and long names then collide with the note.
 */
function divBars({ rows, W = 460, labelW = 196, noteW = 0 }) {
  const rh = 21, m = { t: 22, r: 8, b: 8, l: labelW }, H = m.t + rows.length * rh + m.b
  const iw = W - m.l - m.r, max = Math.max(...rows.map(r => Math.abs(r.value)))
  const nw = noteW || (rows.some(r => r.note) ? 58 : 0)
  const maxChars = Math.max(6, Math.floor((labelW - 10 - nw) / 4.45)) // ~4.45px/char at 8.5px
  const fit = s => s.length > maxChars ? s.slice(0, maxChars - 1) + '…' : s
  const zx = m.l + iw * 0.42
  // Both directions reserve 46px for the value label. Negatives used to reserve 6,
  // so the longest bar's label ran past the axis and sat on top of the row label.
  const sc = v => (v / max) * (v >= 0 ? (W - m.r - zx - 46) : (zx - m.l - 46))
  let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img">`
  s += `<line x1="${zx}" y1="${m.t - 6}" x2="${zx}" y2="${H - m.b}" stroke="${V('rule')}" stroke-width="1"/>`
  s += `<text x="${zx}" y="${m.t - 11}" text-anchor="middle" font-size="8" fill="${V('ink3')}">0</text>`
  rows.forEach((r, i) => {
    const yy = m.t + i * rh, h = 13, w = sc(r.value), pos = r.value >= 0
    const x0 = pos ? zx + 1 : zx + w, ww = Math.abs(w) - 1, rr = Math.min(4, ww / 2)
    const col = pos ? V('up') : V('dn')
    if (ww > 0.5) s += pos
      ? `<path d="M${x0} ${yy} L${x0 + ww - rr} ${yy} Q${x0 + ww} ${yy} ${x0 + ww} ${yy + rr} L${x0 + ww} ${yy + h - rr} Q${x0 + ww} ${yy + h} ${x0 + ww - rr} ${yy + h} L${x0} ${yy + h} Z" fill="${col}"/>`
      : `<path d="M${zx - 1} ${yy} L${x0 + rr} ${yy} Q${x0} ${yy} ${x0} ${yy + rr} L${x0} ${yy + h - rr} Q${x0} ${yy + h} ${x0 + rr} ${yy + h} L${zx - 1} ${yy + h} Z" fill="${col}"/>`
    const lx = pos ? zx + Math.abs(w) + 5 : zx - Math.abs(w) - 5
    s += `<text x="${lx}" y="${yy + h - 2.5}" text-anchor="${pos ? 'start' : 'end'}" font-size="8.5" fill="${V('ink2')}" font-weight="600">${pos ? '+' : '−'}${nf(Math.abs(r.value))}</text>`
    s += `<text x="${m.l - 8}" y="${yy + h - 2.5}" text-anchor="end" font-size="8.5" fill="${V('ink')}">${esc(fit(r.label))}</text>`
    if (r.note) s += `<text x="2" y="${yy + h - 2.5}" font-size="8" fill="${V('ink3')}">${esc(r.note)}</text>`
  })
  return s + `</svg>`
}

/** Legend markup. Always ship one for >= 2 series — identity must not be colour-only. */
const legend = (a, b) => `<div class="lg"><span><i style="background:${V('s1')}"></i>${esc(a)}</span><span><i style="background:${V('s2')}"></i>${esc(b)}</span></div>`

// ------------------------------------------------------------------ print CSS
/** A4 stylesheet. Sections avoid internal breaks; .pb forces a new page. */
const PRINT_CSS = `
@page{size:A4;margin:14mm 13mm 12mm 13mm}
*{box-sizing:border-box}
body{font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;background:var(--panel);color:var(--ink);
  font-size:10.2px;line-height:1.5;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
h1{font-size:21px;margin:0 0 3px;letter-spacing:-.3px}
h2{font-size:13px;margin:0 0 9px;padding-bottom:5px;border-bottom:2px solid var(--ink)}
section{margin-bottom:15px;break-inside:avoid}
.pb{break-before:page}
table{width:100%;border-collapse:collapse;font-size:9.4px}
th{text-align:right;padding:4px 5px;border-bottom:1px solid var(--rule);font-size:8.8px;color:var(--ink2)}
th:first-child,td:first-child{text-align:left}
td{padding:4px 5px;border-bottom:1px solid var(--grid)}
td.n{text-align:right;font-variant-numeric:tabular-nums}
td.up{color:var(--up);font-weight:650} td.dn{color:var(--dn);font-weight:650}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.panel{border:1px solid var(--rule);padding:9px 10px 6px}
.lg{display:flex;gap:13px;font-size:9px;color:var(--ink2);margin:2px 0 6px}
.lg i{display:inline-block;width:9px;height:9px;margin-right:4px;vertical-align:-1px}
.note{font-size:8.8px;color:var(--ink3);line-height:1.45}
svg{display:block;max-width:100%}`

/** Wrap body markup into a complete document. mode: 'print' | 'web'. */
function htmlDoc({ title, body, css = '', mode = 'print' }) {
  const tokens = mode === 'print' ? tokensPrint() : tokensWeb()
  const base = mode === 'print' ? PRINT_CSS : ''
  return `<!doctype html>
<html lang="fi">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>${tokens}${base}${css}</style>
</head>
<body>
${body}
</body>
</html>`
}

// --------------------------------------------------------------- PDF renderer
/** Locate a Chromium-family binary. No other PDF toolchain is installed here. */
function chromePath() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ]
  const found = candidates.find(p => fs.existsSync(p))
  if (!found) throw new Error('No Chromium-family browser found; cannot render PDF.\nTried:\n' + candidates.join('\n'))
  return found
}

/**
 * Render an HTML file to PDF and report the page count.
 * Forced breaks + 1 = expected pages; anything more means a section overflowed.
 */
function renderPdf(htmlPath, pdfPath) {
  execFileSync(chromePath(), [
    '--headless', '--disable-gpu', '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPath}`, `file://${require('path').resolve(htmlPath)}`,
  ], { stdio: 'ignore' })
  const buf = fs.readFileSync(pdfPath)
  const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length
  return { pdfPath, bytes: buf.length, pages }
}

/** Screenshot an HTML file so you can actually look at it before shipping. */
function screenshot(htmlPath, pngPath, { width = 760, height = 3200, scale = 2 } = {}) {
  execFileSync(chromePath(), [
    '--headless', '--disable-gpu', '--hide-scrollbars',
    `--screenshot=${pngPath}`, `--window-size=${width},${height}`,
    `--force-device-scale-factor=${scale}`, `file://${require('path').resolve(htmlPath)}`,
  ], { stdio: 'ignore' })
  return pngPath
}

module.exports = {
  nf, pct, esc, LIGHT, DARK, tokensPrint, tokensWeb,
  groupedBars, lineChart, divBars, legend,
  PRINT_CSS, htmlDoc, chromePath, renderPdf, screenshot,
}
