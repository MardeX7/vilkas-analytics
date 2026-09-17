#!/usr/bin/env node
/**
 * Line-item coverage check. RUN THIS BEFORE ANY PERIOD-OVER-PERIOD COMPARISON.
 *
 * orders rows exist for periods where order_line_items rows do not. A product-level
 * query over such a period silently returns partial data and inflates growth.
 *
 * Coverage is measured in MONEY, not in order counts. A zero-value order has no
 * line items because it has no lines — counting orders reports that as a gap and
 * pushes the "safe from" date months later than it needs to be. The order-count
 * column is kept alongside only to diagnose what a money gap is made of.
 *
 * Usage: node check-coverage.cjs [startDate]      # default 2024-01-01
 */
const { supabase } = require('../../../scripts/db.cjs')

const STORES = {
  FI: '9a0ba934-bd6c-428c-8729-791d5c7ac7c2',
  SE: 'a28836f6-9487-4b67-9194-e907eaf94b69',
}

/**
 * Paginate a Supabase query. The ORDER IS NOT OPTIONAL: PostgREST gives no stable
 * row order without one, so `.range()` pages overlap and skip. Measured on this DB:
 * 518 of 13 149 orders came back twice and 518 distinct rows never came back at all.
 * `build` therefore receives the range AND must apply a deterministic sort.
 */
async function pageAll(build) {
  let out = [], from = 0
  while (true) {
    const { data, error } = await build(from, from + 999)
    if (error) throw error
    out = out.concat(data)
    if (data.length < 1000) break
    from += 1000
  }
  return out
}

const eur = n => Math.round(n).toLocaleString('fi-FI')

async function main() {
  const start = process.argv[2] || '2024-01-01'
  const orders = await pageAll((a, b) =>
    supabase.from('orders').select('id,store_id,order_number,creation_date,grand_total')
      .gte('creation_date', start).order('id', { ascending: true }).range(a, b))
  const items = await pageAll((a, b) =>
    supabase.from('order_line_items').select('order_id').order('id', { ascending: true }).range(a, b))
  const has = new Set(items.map(i => i.order_id))

  for (const [name, id] of Object.entries(STORES)) {
    const rows = orders.filter(o => o.store_id === id)
      .sort((a, b) => a.creation_date.localeCompare(b.creation_date))
    if (!rows.length) { console.log(`\n=== ${name}: no orders since ${start}`); continue }

    // The boundary that matters: the last order carrying money that has no lines.
    // Zero-value orders are excluded — they are not missing data.
    let boundary = null, lastMoneyGap = null
    for (let i = rows.length - 1; i >= 0; i--) {
      if (!has.has(rows[i].id) && (rows[i].grand_total || 0) > 0) {
        lastMoneyGap = rows[i]
        boundary = rows[i + 1]?.creation_date || 'NOW (no covered tail)'
        break
      }
    }

    const months = {}
    rows.forEach(o => {
      const k = o.creation_date.slice(0, 7)
      const m = months[k] = months[k] || { n: 0, ok: 0, tot: 0, cov: 0 }
      m.n++; m.tot += o.grand_total || 0
      if (has.has(o.id)) { m.ok++; m.cov += o.grand_total || 0 }
    })

    const gaps = rows.filter(o => !has.has(o.id))
    const gapMoney = gaps.reduce((s, o) => s + (o.grand_total || 0), 0)
    console.log(`\n=== ${name} — ${rows.length} orders, ${gaps.length} without line items ` +
      `(${eur(gapMoney)} of revenue, ${gaps.filter(o => !(o.grand_total > 0)).length} of them zero-value)`)
    console.log(`    revenue fully covered from: ${boundary || '(entire range)'}` +
      (lastMoneyGap ? `   [last money gap: #${lastMoneyGap.order_number} ${lastMoneyGap.creation_date.slice(0, 19)}]` : ''))

    Object.keys(months).sort().forEach(k => {
      const m = months[k]
      const pMoney = m.tot > 0 ? 100 * m.cov / m.tot : 100
      const pOrders = 100 * m.ok / m.n
      const flag = pMoney >= 99.95 ? '   ' : pMoney === 0 ? ' ✗✗' : ' ⚠ '
      const note = pMoney >= 99.95 && pOrders < 99.95 ? '  (order gap is zero-value — not a data gap)' : ''
      console.log(`   ${flag} ${k}  revenue ${pMoney.toFixed(1).padStart(5)} %  ` +
        `orders ${String(m.ok).padStart(4)}/${String(m.n).padStart(4)}${note}`)
    })
  }
  console.log('\nJudge on the REVENUE column. Any month below 100 % there in EITHER comparison')
  console.log('period disqualifies the DB for that comparison — fetch it from ePages instead')
  console.log('(fetch-epages-orders.cjs) and cross-validate on a window that is fully covered.')
}
main().catch(e => { console.error(e); process.exit(1) })
