/**
 * Pure helpers for /api/ig-products: which products the Instagram generator
 * may feature and how well each sold. No database access here, so it is
 * tested with plain fixtures (scripts/test_ig_products.mjs).
 */

// products.image_url is ePages' 150 px thumbnail ("_h"). The same path
// without the suffix is the original: 458–1006 px in a sample of ten,
// 14.10.2026.
export function originalImage(url) {
  return url ? url.replace(/_h(\.[a-z]+)$/i, '$1') : url
}

export function stripHtml(html) {
  return (html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h\d)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// stock_tracked defaults to true; only an explicit false (made to order)
// lets a product with no stock through.
export function eligible(p) {
  if (!p.for_sale || !p.image_url) return false
  if (p.stock_tracked !== false && !(p.stock_level > 0)) return false
  return true
}

export function buildCandidates(products, links, lines) {
  const cats = new Map()
  for (const l of links) {
    const list = cats.get(l.product_id) || []
    list.push({ path: l.categories.category_path, name: l.categories.display_name })
    cats.set(l.product_id, list)
  }
  const byNumber = new Map(products.map(p => [p.product_number, p.id]))
  const sold = new Map()
  for (const li of lines) {
    const id = li.product_id || byNumber.get(li.product_number)
    if (!id) continue
    sold.set(id, (sold.get(id) || 0) + (li.quantity || 0))
  }
  return products
    .filter(eligible)
    .map(p => ({
      product_number: p.product_number,
      name: p.name,
      image_url: originalImage(p.image_url),
      categories: cats.get(p.id) || [],
      sold_90d: sold.get(p.id) || 0,
      description: stripHtml(p.description),
    }))
    .sort((a, b) => b.sold_90d - a.sold_90d || a.name.localeCompare(b.name))
}
