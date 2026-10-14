/**
 * Instagram product candidates (read-only)
 *
 * GET /api/ig-products?store=automaalit|billackering
 * Authorization: Bearer <IG_PRODUCTS_TOKEN>
 *
 * Called by the Instagram generator (~/dev/automaalit-instagram/products.py)
 * on the Mac mini, so that machine never holds the service role key. Returns
 * only what a product post needs: products for sale, with an image and in
 * stock, their categories and units sold in the last 90 days (cancelled and
 * returned orders left out). Writes nothing.
 */
import { createClient } from '@supabase/supabase-js'
import { createHash, timingSafeEqual } from 'node:crypto'
import { buildCandidates } from './lib/igProducts.js'

const DOMAINS = { automaalit: 'automaalit.net', billackering: 'billackering.eu' }
const PAGE = 1000

export const config = { maxDuration: 60 }

const digest = s => createHash('sha256').update(s).digest()

// Both sides hashed first: equal-length buffers whatever the header holds,
// so timingSafeEqual cannot throw.
function authorized(req) {
  const want = process.env.IG_PRODUCTS_TOKEN
  const got = /^Bearer (.+)$/.exec(req.headers.authorization || '')
  if (!want || !got) return false
  return timingSafeEqual(digest(got[1]), digest(want))
}

// Supabase returns at most 1000 rows per request (the project's default max-rows).
async function all(query) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query().range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...data)
    if (data.length < PAGE) return rows
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' })
  const { store: slug } = req.query
  if (typeof slug !== 'string' || !Object.hasOwn(DOMAINS, slug)) {
    return res.status(400).json({ error: 'store must be automaalit or billackering' })
  }
  const domain = DOMAINS[slug]

  try {
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )
    const { data: store, error } = await supabase.from('stores').select('id').eq('domain', domain).single()
    if (error) throw new Error(`store ${domain}: ${error.message}`)
    const since = new Date(Date.now() - 90 * 864e5).toISOString()
    const [products, links, lines] = await Promise.all([
      all(() => supabase.from('products')
        .select('id, product_number, name, description, image_url, for_sale, stock_tracked, stock_level')
        .eq('store_id', store.id).order('id')),
      all(() => supabase.from('product_categories')
        .select('id, product_id, categories!inner(store_id, category_path, display_name)')
        .eq('categories.store_id', store.id).order('id')),
      all(() => supabase.from('order_line_items')
        .select('id, product_id, product_number, quantity, orders!inner(store_id, creation_date, status)')
        .eq('orders.store_id', store.id)
        .gte('orders.creation_date', since)
        .not('orders.status', 'in', '(cancelled,returned)')
        .order('id')),
    ])
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({
      store: slug,
      generated_at: new Date().toISOString(),
      products: buildCandidates(products, links, lines),
    })
  } catch (e) {
    console.error('ig-products:', e)
    return res.status(500).json({ error: 'Product data unavailable' })
  }
}
