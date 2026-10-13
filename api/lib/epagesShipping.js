/**
 * ePages delivery fee
 *
 * What the customer paid for delivery is in shippingData.price ({ amount, taxType })
 * on both the order list and the order detail. There is no top-level shippingPrice:
 * the syncs read that until 2026-10-13, so orders.shipping_price was 0 on every row.
 *
 * The amount follows the order's tax model: VAT-inclusive on a GROSS order, net on
 * a NET one (B2B net price display shows 7.89 for the 9.90 fee). The VAT on it is in
 * shippingData.taxes. orders.shipping_price is stored VAT-inclusive, like
 * grand_total; a VAT-exempt order keeps the net amount, which is what it paid.
 */

const RPC_CHUNK = 500

/**
 * VAT-inclusive delivery fee of an ePages order (list item or detail).
 * @param {object} order - ePages order
 * @returns {number} 0 when delivery was free or the order has no delivery
 */
export function shippingPriceGross(order) {
  const price = order.shippingData?.price
  const amount = parseFloat(price?.amount) || 0
  if (price?.taxType !== 'NET') return amount
  const taxes = Array.isArray(order.shippingData.taxes) ? order.shippingData.taxes : []
  const tax = taxes.reduce((sum, t) => sum + (parseFloat(t?.price?.amount) || 0), 0)
  return Math.round((amount + tax) * 100) / 100
}

/**
 * Write the delivery fee of the given ePages orders to the stored rows.
 * Orders not in the table are skipped, never created.
 * @returns {Promise<{matched: number, changed: number}>}
 */
export async function writeOrderShippingPrices(supabase, storeId, orders) {
  const rows = orders.map(order => ({ epages_order_id: order.orderId, shipping_price: shippingPriceGross(order) }))
  let matched = 0
  let changed = 0
  for (let i = 0; i < rows.length; i += RPC_CHUNK) {
    const { data, error } = await supabase.rpc('sync_order_shipping_prices', {
      p_store_id: storeId,
      p_rows: rows.slice(i, i + RPC_CHUNK)
    })
    if (error) throw new Error(`sync_order_shipping_prices: ${error.message}`)
    matched += data.matched
    changed += data.changed
  }
  return { matched, changed }
}
