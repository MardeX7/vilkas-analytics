/**
 * Run the ePages range sync (api/cron/sync-epages-range.js) locally, without the
 * 5-minute serverless limit. Each order is fetched one by one for its line items,
 * so a month of orders can outlast a Vercel invocation.
 *
 * WRITES to the database: upserts orders and inserts their line items.
 * --skip-existing leaves orders that are already stored alone (fills gaps only).
 *
 * Usage:
 *   node scripts/sync_orders_range.js <store_id> <start ISO> <end ISO> [--skip-existing]
 * Example (Billackering, November 2025 in Stockholm time):
 *   node scripts/sync_orders_range.js a28836f6-9487-4b67-9194-e907eaf94b69 \
 *     2025-11-01T00:00:00+01:00 2025-12-01T00:00:00+01:00 --skip-existing
 */
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
require('dotenv').config({ path: path.join(root, '.env.local') })

// Imported after dotenv so the module sees the environment it reads at load time
const { default: handler } = await import('../api/cron/sync-epages-range.js')

const args = process.argv.slice(2)
const [store_id, start_date, end_date] = args.filter(a => !a.startsWith('--'))
if (!store_id || !start_date || !end_date) {
  console.error('Usage: node scripts/sync_orders_range.js <store_id> <start ISO> <end ISO> [--skip-existing]')
  process.exit(1)
}

const res = {
  statusCode: 200,
  status(code) { this.statusCode = code; return this },
  json(body) { console.log(this.statusCode, JSON.stringify(body, null, 2)); return this }
}

await handler({
  method: 'POST',
  body: { store_id, start_date, end_date, skip_existing: args.includes('--skip-existing') }
}, res)
