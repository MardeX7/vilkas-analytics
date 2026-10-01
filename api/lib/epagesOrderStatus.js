/**
 * ePages order status
 *
 * An ePages order has no status field. Its state is a set of timestamps on the
 * order itself: rejectedOn, paidOn, dispatchedOn, deliveredOn, returnedOn,
 * closedOn. Both the order list and the order detail carry them.
 *
 * Rejected orders become 'cancelled', which the sales views and queries exclude.
 * That matches ePages' own sales figures: they leave rejected orders out and
 * keep returned ones in (verified 2026-10-01 against Shop Conductor get_sales).
 */

const PAGE_SIZE = 100
const RPC_CHUNK = 500

/**
 * Status columns of an orders row, from an ePages order (list item or detail).
 * @param {object} order - ePages order
 * @returns {{status: string, paid_on: string|null, dispatched_on: string|null, delivered_on: string|null, closed_on: string|null}}
 */
export function orderStatusColumns(order) {
  const dispatchedOn = order.dispatchedOn || order.partiallyDispatchedOn || null

  // 'closed' is an order closed without being dispatched or delivered (old
  // Billackering orders mostly); ePages still counts it as a sale
  let status = 'pending'
  if (order.rejectedOn) status = 'cancelled'
  else if (order.returnedOn) status = 'returned'
  else if (order.deliveredOn) status = 'delivered'
  else if (dispatchedOn) status = 'shipped'
  else if (order.closedOn) status = 'closed'
  else if (order.paidOn) status = 'paid'

  return {
    status,
    paid_on: order.paidOn || null,
    dispatched_on: dispatchedOn,
    delivered_on: order.deliveredOn || null,
    closed_on: order.closedOn || null
  }
}

/**
 * Read orders from the ePages order list (no detail calls) filtered by update or
 * creation time.
 * @returns {Promise<object[]>} ePages list items
 */
export async function fetchOrderList({ apiUrl, accessToken, updatedFrom, createdAfter, createdBefore }) {
  const orders = []
  for (let page = 1; ; page++) {
    const url = new URL(`${apiUrl}/orders`)
    url.searchParams.append('page', page)
    url.searchParams.append('resultsPerPage', PAGE_SIZE)
    // ePages ignores sortBy/sortDirection: the list comes newest first (by
    // creationDate, or by lastUpdatedOnDate with updatedFrom). An order placed or
    // updated while paging can therefore repeat or be skipped at a page boundary;
    // the next run's overlapping window picks a skipped one up.
    if (updatedFrom) url.searchParams.append('updatedFrom', updatedFrom)
    if (createdAfter) url.searchParams.append('createdAfter', createdAfter)
    if (createdBefore) url.searchParams.append('createdBefore', createdBefore)

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.epages.v1+json'
      }
    })
    if (!response.ok) {
      throw new Error(`ePages orders ${response.status}: ${await response.text()}`)
    }

    const items = (await response.json()).items || []
    orders.push(...items)
    if (items.length < PAGE_SIZE) break
  }
  return orders
}

/**
 * Write the status columns of the given ePages orders to the stored rows.
 * Orders not in the table are skipped, never created.
 * @returns {Promise<{matched: number, changed: number}>}
 */
export async function writeOrderStatuses(supabase, storeId, orders) {
  const rows = orders.map(order => ({ epages_order_id: order.orderId, ...orderStatusColumns(order) }))
  let matched = 0
  let changed = 0
  for (let i = 0; i < rows.length; i += RPC_CHUNK) {
    const { data, error } = await supabase.rpc('sync_order_statuses', {
      p_store_id: storeId,
      p_rows: rows.slice(i, i + RPC_CHUNK)
    })
    if (error) throw new Error(`sync_order_statuses: ${error.message}`)
    matched += data.matched
    changed += data.changed
  }
  return { matched, changed }
}

/**
 * Rewrite the status columns of stored orders that ePages has updated since
 * `updatedFrom`. Orders created earlier are rejected or dispatched later, and the
 * daily sync only fetches orders by creation date.
 * @returns {Promise<{fetched: number, matched: number, changed: number}>}
 */
export async function refreshOrderStatuses(supabase, { apiUrl, accessToken, storeId, updatedFrom }) {
  const orders = await fetchOrderList({ apiUrl, accessToken, updatedFrom })
  return { fetched: orders.length, ...await writeOrderStatuses(supabase, storeId, orders) }
}
