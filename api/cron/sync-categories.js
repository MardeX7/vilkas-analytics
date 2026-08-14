/**
 * Sync Product Categories from ePages (Multi-tenant)
 *
 * Runs weekly, Monday 06:20 UTC.
 *
 * Until now categories came from a one-off CSV import (Billackering, 2026-01-06)
 * and Automaalit had none at all, so the inventory page grouped products by the
 * first word of their name. This replaces that with the shop's real taxonomy.
 *
 * Only categories reachable from the root tree with visibleInNavigation = true
 * are kept. That is what separates the product taxonomy from campaign and
 * content categories ("Vappua", "uudet tuotteet", "HALLOWEEN -15%", guide pages)
 * without guessing from names — and it drops categories that no longer exist
 * upstream, such as the "Tillbehoer-old" ghost left behind by the CSV import.
 *
 * ePages has no endpoint listing a category's products in this version
 * (/categories/{id}/products returns 404), so assignments are read per product
 * via the `categories` link on the product resource.
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const config = {
  maxDuration: 300,
}

const CONCURRENCY = 5

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++
      if (index >= items.length) return
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

function epagesHeaders(store) {
  return {
    Authorization: `Bearer ${store.access_token}`,
    Accept: 'application/vnd.epages.v1+json',
  }
}

function apiBase(store) {
  const domain = (store.domain || '').replace(/^www\./, '')
  return `https://www.${domain}/rs/shops/${store.epages_shop_id}`
}

async function getJson(url, store) {
  const res = await fetch(url, { headers: epagesHeaders(store) })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

/**
 * Walk the category tree, keeping only what the shop actually shows as product
 * navigation. Returns a flat list carrying the top-level group each category
 * rolls up to, which is the level reporting aggregates on.
 */
async function collectCategories(store, locale) {
  const roots = await getJson(`${apiBase(store)}/categories`, store)
  const root = roots[0]
  if (!root) return []

  const collected = []

  const walk = async (categoryUrl, ancestry) => {
    const category = await getJson(`${categoryUrl}?locale=${locale}`, store)
    if (!category.visible || !category.visibleInNavigation) return

    const caption = category.navigationCaption || category.name || category.alias
    const path = [...ancestry, { alias: category.alias, caption }]

    // Depth 1 is the root container itself; real groups start below it.
    if (path.length > 1) {
      collected.push({
        epagesId: category.categoryId,
        alias: category.alias,
        caption,
        // level2 is the top-level group — what the inventory page reports on.
        level1: path[0].alias,
        level2: path[1]?.caption || caption,
        level3: path[2]?.caption || null,
        categoryPath: path.map(p => p.alias).join('/'),
      })
    }

    for (const link of category.subCategories || []) {
      if (link?.href) await walk(link.href, path)
    }
  }

  await walk(`${apiBase(store)}/categories/${root.categoryId}`, [])
  return collected
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Missing Supabase credentials' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const { data: stores, error: storesError } = await supabase
    .from('stores')
    .select('id, name, domain, epages_shop_id, access_token, locale')

  if (storesError || !stores?.length) {
    return res.status(500).json({ error: storesError?.message || 'No stores found' })
  }

  const results = []

  for (const store of stores) {
    if (!store.access_token || !store.epages_shop_id) {
      results.push({ store: store.name, skipped: true, reason: 'no ePages credentials' })
      continue
    }

    try {
      const locale = store.locale || 'fi_FI'
      const categories = await collectCategories(store, locale)

      if (!categories.length) {
        results.push({ store: store.name, skipped: true, reason: 'no navigable categories' })
        continue
      }

      // Products already synced by sync-products; epages_product_id is the join key.
      const products = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from('products')
          .select('id, epages_product_id')
          .eq('store_id', store.id)
          .not('epages_product_id', 'is', null)
          .order('id', { ascending: true })
          .range(from, from + 999)
        if (error) throw error
        if (!data?.length) break
        products.push(...data)
        if (data.length < 1000) break
      }

      const keptByEpagesId = new Map(categories.map(c => [c.epagesId, c]))

      const assignments = await mapWithConcurrency(products, CONCURRENCY, async (product) => {
        try {
          const list = await getJson(
            `${apiBase(store)}/categories/?productId=${product.epages_product_id}&locale=${locale}`,
            store
          )
          const items = Array.isArray(list) ? list : list.items || []
          return items
            .filter(c => keptByEpagesId.has(c.categoryId))
            .map(c => ({ productId: product.id, epagesCategoryId: c.categoryId }))
        } catch {
          // One unreadable product must not sink the whole shop's sync.
          return []
        }
      })

      // Replace wholesale: a category removed upstream has to disappear here too,
      // which is the entire point of moving off the frozen CSV import.
      const productIds = products.map(p => p.id)
      for (let i = 0; i < productIds.length; i += 200) {
        const { error } = await supabase
          .from('product_categories')
          .delete()
          .in('product_id', productIds.slice(i, i + 200))
        if (error) throw error
      }
      const { error: delCatError } = await supabase
        .from('categories')
        .delete()
        .eq('store_id', store.id)
      if (delCatError) throw delCatError

      const { data: insertedCategories, error: insCatError } = await supabase
        .from('categories')
        .insert(categories.map(c => ({
          store_id: store.id,
          category_path: c.categoryPath,
          level1: c.level1,
          level2: c.level2,
          level3: c.level3,
          display_name: c.caption,
        })))
        .select('id, category_path')
      if (insCatError) throw insCatError

      const idByPath = Object.fromEntries(insertedCategories.map(c => [c.category_path, c.id]))
      const pathByEpagesId = Object.fromEntries(categories.map(c => [c.epagesId, c.categoryPath]))

      const rows = assignments
        .flat()
        .map(a => ({
          product_id: a.productId,
          category_id: idByPath[pathByEpagesId[a.epagesCategoryId]],
        }))
        .filter(r => r.category_id)

      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from('product_categories').insert(rows.slice(i, i + 500))
        if (error) throw error
      }

      const covered = new Set(rows.map(r => r.product_id)).size
      console.log(`${store.name}: ${categories.length} categories, ${rows.length} assignments, ${covered}/${products.length} products covered`)
      results.push({
        store: store.name,
        success: true,
        categories: categories.length,
        assignments: rows.length,
        productsCovered: covered,
        productsTotal: products.length,
      })
    } catch (error) {
      console.error(`${store.name} category sync error:`, error.message)
      results.push({ store: store.name, success: false, error: error.message })
    }
  }

  return res.status(200).json({ success: true, results })
}
