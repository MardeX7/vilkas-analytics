---
name: analyzing-category-sales
description: Use when comparing product or product-category sales across time periods or between the Automaalit.net and Billackering.eu stores — questions like "did X sell more this summer", period-over-period growth, store-vs-store comparisons, or a request for a sales report as PDF or shareable link.
---

# Analyzing category sales

## Core principle

**`orders` coverage is not `order_line_items` coverage. Verify before you compare.**

An order row can exist for a period where its line-item rows do not. Any product-level
query over such a period returns partial data, silently, and inflates growth.

## Step 1 — Check coverage (never skip)

```bash
node .claude/skills/analyzing-category-sales/check-coverage.cjs 2025-01-01
```

Judge on the **revenue** column, not the order count. Any month below 100 % there in
either comparison period disqualifies the DB for that comparison.

An order-count gap on a fully-covered month is a zero-value order — it has no line
items because it has no lines. The script labels those rather than flagging them.
Measuring coverage by order count instead pushes the safe-from date months later for
no gain: it would put Billackering at 2026-04-02 rather than the true 2025-07-26.

Known gap (verified 2026-09-02): Billackering has **no line items before
2025-07-26 15:25:43** — 1 952 orders and 3,0 M SEK of revenue. From that timestamp on,
revenue coverage is complete in both stores; the only later gaps are one zero-value
order each.

## Step 2 — Define the product set from categories

`products.category_name` is **null** for both stores. Use the join instead:

`categories.category_path` (e.g. `Categories/Spray`, `Categories/Spraymaalit1`) →
`product_categories.category_id` → `product_categories.product_id` → `products.id`

Category paths differ per store — FI and SE have separate trees. Apply **today's**
category set to both years so the definition is identical on each side.

## Step 3 — Aggregate

`order_line_items` has no `store_id`; join through `orders.id`.
`orders.status` is `pending` on every row — do not filter on it.

**Paginate on a sort key that determines row order uniquely.** PostgREST has no stable
row order otherwise, so `.range()` pages silently overlap and skip: 518 of 13 149
orders came back twice here, and 518 others never came back.

`.order('id', { ascending: true })` is the easy answer. A composite key is equally
fine *if you have verified it is unique* — but a timestamp alone almost never is:
`gsc_search_analytics` holds 3 600–4 400 rows per `date`, so a 1000-row page boundary
lands inside a tie every time, and `.order('date')` leaves the order arbitrary within
each day. Add `id` as the final sort key when in doubt.

Assert the unique-row count against a `{ count: 'exact', head: true }` query before
trusting any paginated result.

## Step 4 — If coverage failed, fetch from ePages

```bash
node .claude/skills/analyzing-category-sales/fetch-epages-orders.cjs \
  SE 2025-05-01T00:00:00.000Z 2025-08-21T00:00:00.000Z se2025.json
```

Read-only; writes nothing to Supabase. Then **fetch both sides of the comparison from
the same source** so method differences cannot masquerade as growth.

**Cross-validate before believing it:** recompute one window where DB coverage is 100 %
from both sources. Expect a 0 difference. Anything else means the mapping is wrong —
see the field notes at the top of the fetch script (`sku` ≠ `product_number`; match on
`productId` ↔ `products.epages_product_id`).

## Step 5 — Report

SEK and EUR are **not** converted: compare via percentage changes and revenue shares,
never sum across stores. Truncate the final month to the same day in both years.

`report-kit.cjs` carries the charts, the validated palette, the A4 print CSS and the
renderer. Build the body markup, then:

```js
const K = require('.claude/skills/analyzing-category-sales/report-kit.cjs')
const body = `<h1>…</h1>
<section><h2>Kuukausittain</h2>${K.legend('2025','2026')}
<div class="grid2"><div class="panel">${K.groupedBars({labels, y1, y2, max, unit:'kpl'})}</div></div>
</section>
<section class="pb">${K.divBars({rows})}</section>`   // .pb = force a page break
fs.writeFileSync('report.html', K.htmlDoc({title:'…', body, mode:'print'}))
console.log(K.renderPdf('report.html', 'out.pdf'))     // -> {bytes, pages}
K.screenshot('report.html', 'preview.png')             // then LOOK at it
```

Charts: `groupedBars` (two periods per category), `lineChart` (shares — endpoints
labelled only), `divBars` (signed change). All emit `var(--token)` fills, so the same
markup serves a light PDF and a theme-aware page (`mode:'web'`).

Two checks before shipping: forced breaks + 1 must equal `pages`, and read the
screenshot for clipped axis labels and cut-off table columns — both have shipped before.

For a shareable link, publish an Artifact with `capabilities: {downloads: true}` and
embed the PDF as base64; a plain `<a download>` link is inert in the viewer sandbox.

## Red flags

| Signal | What it means |
| --- | --- |
| Growth above ~100 % on an established product | Almost certainly a coverage gap, not sales |
| A SKU dropping to 0 | Look for a renamed or split variant absorbing it before calling it a decline |
| Totals match but units are 0 | Code mapping failed — you matched on the wrong field |
| A month's totals shift between two runs of the same query | The paginated sort key does not determine row order uniquely (no `.order()`, or a timestamp alone). Sort on `id`, or on a key you have verified unique; check against an exact count. |
| Revenue matches exactly, quantities do not | Unit mismatch, not a bug: ePages gives the ordered amount with a unit (`0.5 l`), the DB stores `1`. Hits litre-priced mixed paint — base coats, acrylics. Report revenue; compare volume only within one source. |
| "The DB has the orders" | Orders ≠ line items. Run Step 1. |

## Real-world impact

2026-09-02: a spray summer comparison read **+261 %** from the DB. After the ePages
backfill and cross-validation, the true figure was **+25 %**.
