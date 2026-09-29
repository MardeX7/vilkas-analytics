/**
 * Backfill / recalculate kpi_index_snapshots for one store with the cron's own logic.
 *
 * The weekly/monthly snapshot is only ever written for the period that just ended, so a
 * store gets no history for YoY until a year has passed, and a snapshot computed from
 * incomplete data stays wrong. This reruns calculateKPIForStore for every period in a
 * range, oldest first, so each period's index scaling and deltas see the ones before it.
 *
 * Dry run by default. Pass --write to upsert.
 *
 * Usage:
 *   node scripts/backfill_kpi_snapshots.js <store_id> <week|month> <from YYYY-MM-DD> <to YYYY-MM-DD> [--write]
 *
 * Weeks are ISO Monday–Sunday; `from` is moved forward to a Monday. Only whole periods are
 * written: `to` is clamped to the last day whose orders are all synced, and a week or month
 * is included only if it ends on or before that. A partial period written here would never
 * be replaced, because the cron skips a period that already has a row.
 * Note: margins use today's products.cost_price; there is no cost history.
 */
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
require('dotenv').config({ path: path.join(root, '.env.local') })

const { createClient } = require('@supabase/supabase-js')
// Imported after dotenv so the module sees the environment it reads at load time
const { calculateKPIForStore } = await import('../api/cron/calculate-kpi.js')

const iso = d => d.toISOString().slice(0, 10)
const addDays = (d, n) => new Date(d.getTime() + n * 864e5)

// Orders arrive with the 06:00 UTC sync (vercel.json); same rule as the date picker.
function lastCompleteDay(now = new Date()) {
  const back = now.getUTCHours() < 7 ? 2 : 1
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - back))
}

function periods(granularity, from, to) {
  const out = []
  const requested = new Date(to + 'T00:00:00Z'), complete = lastCompleteDay()
  const end = requested < complete ? requested : complete
  if (granularity === 'week') {
    let d = new Date(from + 'T00:00:00Z')
    while (d.getUTCDay() !== 1) d = addDays(d, 1)
    for (; addDays(d, 6) <= end; d = addDays(d, 7)) out.push({ start: iso(d), end: iso(addDays(d, 6)) })
  } else {
    const f = new Date(from + 'T00:00:00Z')
    for (let y = f.getUTCFullYear(), m = f.getUTCMonth(); new Date(Date.UTC(y, m + 1, 0)) <= end; m++) {
      const s = new Date(Date.UTC(y, m, 1)), e = new Date(Date.UTC(y, m + 1, 0))
      out.push({ start: iso(s), end: iso(e), label: iso(s).slice(0, 7) })
    }
  }
  return out
}

async function main() {
  const [storeId, granularity, from, to] = process.argv.slice(2)
  const write = process.argv.includes('--write')
  const isDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !isNaN(new Date(d + 'T00:00:00Z'))
  if (!storeId || !['week', 'month'].includes(granularity) || !isDate(from) || !isDate(to)) {
    console.error('usage: node scripts/backfill_kpi_snapshots.js <store_id> <week|month> <from> <to> [--write]')
    process.exit(1)
  }

  const real = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: shop } = await real.from('shops').select('currency').eq('store_id', storeId).maybeSingle()
  const country = shop?.currency === 'SEK' ? 'SE' : 'FI'

  // In a dry run the snapshot upsert is swallowed; every read still hits the database.
  // (A dry run cannot show index/delta chaining, which reads earlier snapshots.)
  const supabase = write ? real : {
    from: t => {
      const q = real.from(t)
      if (t === 'kpi_index_snapshots') q.upsert = async () => ({ error: null })
      return q
    }
  }

  // The upsert key is (store_id, period_end, granularity). Rows cut differently (legacy
  // Sunday–Saturday weeks, months ending a day early) would not be replaced but joined by
  // a second row for the same period, and the dashboard reads snapshots by position.
  const { data: rows, error } = await real.from('kpi_index_snapshots')
    .select('period_start, period_end').eq('store_id', storeId).eq('granularity', granularity)
  if (error) throw error
  const odd = rows.filter(r => {
    const s = new Date(r.period_start + 'T00:00:00Z')
    return granularity === 'week'
      ? s.getUTCDay() !== 1 || iso(addDays(s, 6)) !== r.period_end
      : s.getUTCDate() !== 1 || iso(new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 0))) !== r.period_end
  })
  if (odd.length && write) {
    console.error(`${odd.length} existing ${granularity} rows are not calendar-aligned, e.g. ` +
      odd.slice(0, 3).map(r => `${r.period_start}..${r.period_end}`).join(', ') + '. Clean them up first.')
    process.exit(1)
  }

  const list = periods(granularity, from, to)
  console.log(`${write ? 'WRITE' : 'DRY RUN'} ${granularity} ${country} ${storeId}: ${list.length} periods`)
  for (const p of list) {
    const r = await calculateKPIForStore(supabase, storeId, granularity, true, country, p)
    console.log(`${p.start}..${p.end}  orders ${r.metrics.orders}  revenue ${r.metrics.revenue}  margin ${r.metrics.margin}  overall ${r.indexes.overall}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
