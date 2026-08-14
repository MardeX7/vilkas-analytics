/**
 * Cost Price Import
 *
 * Receives a compact cost list parsed from an ePages product export (CSV) and
 * updates products.cost_price for the CURRENT shop.
 *
 * Body: { store_id, costs: [{ product_number, cost }] }
 *
 * Safe by design:
 * - updates ONLY real costs (> 0); never invents defaults
 * - skips unchanged rows
 * - wrong-file guard: if the file matches < 70% of the store's products it is
 *   rejected without writing (prevents uploading the other shop's export, which
 *   shares ~230 product numbers but in the wrong currency)
 * - reports products where the new cost exceeds the sale price
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const config = {
  maxDuration: 60,
}

const MIN_MATCH_RATE = 0.70

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { store_id, costs } = req.body || {}

  if (!store_id) return res.status(400).json({ error: 'store_id puuttuu' })
  if (!Array.isArray(costs) || costs.length === 0) {
    return res.status(400).json({ error: 'Tiedostosta ei löytynyt ostohintoja.' })
  }
  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Puuttuvat Supabase-tunnukset' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Build incoming cost map (real costs only)
  const incoming = new Map()
  for (const c of costs) {
    const pn = (c.product_number ?? '').toString().trim()
    const cost = Number(c.cost)
    if (pn && Number.isFinite(cost) && cost > 0) incoming.set(pn, cost)
  }
  if (incoming.size === 0) {
    return res.status(400).json({ error: 'Tiedostossa ei ollut kelvollisia ostohintoja.' })
  }

  try {
    // Fetch all products for this store (paginated)
    const products = []
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('products')
        .select('id, product_number, name, price_amount, cost_price')
        .eq('store_id', store_id)
        .range(from, from + 999)
      if (error) return res.status(500).json({ error: error.message })
      products.push(...data)
      if (data.length < 1000) break
      from += 1000
    }
    if (products.length === 0) {
      return res.status(404).json({ error: 'Kaupalle ei löytynyt tuotteita.' })
    }

    // Wrong-file guard
    const matched = products.filter(p => incoming.has(p.product_number)).length
    const matchRate = matched / products.length
    if (matchRate < MIN_MATCH_RATE) {
      return res.status(200).json({
        wrongFile: true,
        matched,
        total: products.length,
        matchRate: Math.round(matchRate * 100),
        message: `Tiedosto täsmää vain ${Math.round(matchRate * 100)} % tämän kaupan tuotteista – tämä näyttää toisen kaupan vienniltä. Vaihda kauppa sivupalkista tai valitse oikean kaupan tiedosto. Mitään ei muutettu.`,
      })
    }

    // Compute updates
    const updates = []
    const costGtPrice = []
    let unchanged = 0
    for (const p of products) {
      const nc = incoming.get(p.product_number)
      if (nc == null) continue
      if (p.cost_price != null && Math.abs(p.cost_price - nc) < 0.005) { unchanged++; continue }
      updates.push({ id: p.id, cost_price: nc })
      if (p.price_amount > 0 && nc > p.price_amount) {
        costGtPrice.push({ product_number: p.product_number, name: p.name, cost: nc, price: p.price_amount })
      }
    }

    // Apply in batches
    let updated = 0
    let errors = 0
    for (let i = 0; i < updates.length; i += 50) {
      const batch = updates.slice(i, i + 50)
      const results = await Promise.all(
        batch.map(u => supabase.from('products').update({ cost_price: u.cost_price }).eq('id', u.id))
      )
      const errs = results.filter(r => r.error).length
      errors += errs
      updated += batch.length - errs
    }

    return res.json({
      success: true,
      updated,
      unchanged,
      errors,
      matched,
      total: products.length,
      costGtPriceCount: costGtPrice.length,
      costGtPrice: costGtPrice.slice(0, 20),
      imported_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Cost import error:', err)
    return res.status(500).json({ error: err.message })
  }
}
