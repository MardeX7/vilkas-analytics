// Tests for api/lib/igProducts.js. Run: node --test scripts/test_ig_products.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { originalImage, stripHtml, eligible, buildCandidates } from '../api/lib/igProducts.js'

test('originalImage drops the _h thumbnail suffix', () => {
  assert.equal(originalImage('https://x/Shops/1682/a/rustcontrol_h.png'), 'https://x/Shops/1682/a/rustcontrol.png')
  assert.equal(originalImage('https://x/silicon5L_ml_h.png'), 'https://x/silicon5L_ml.png')
  assert.equal(originalImage('https://x/moss_green_h.webp'), 'https://x/moss_green.webp')
  assert.equal(originalImage('https://x/plain.jpg'), 'https://x/plain.jpg')
  assert.equal(originalImage(null), null)
})

test('stripHtml leaves readable text', () => {
  assert.equal(stripHtml('<p>Suojaa <strong>pellin</strong> ruosteelta.<br />Hyvä&nbsp;tartunta &amp; pinta.</p>'),
    'Suojaa pellin ruosteelta. Hyvä tartunta & pinta.')
  assert.equal(stripHtml(null), '')
})

test('eligible: for sale, has image, in stock unless stock is not tracked', () => {
  const base = { for_sale: true, image_url: 'u', stock_tracked: true, stock_level: 3 }
  assert.equal(eligible(base), true)
  assert.equal(eligible({ ...base, for_sale: false }), false)
  assert.equal(eligible({ ...base, image_url: null }), false)
  assert.equal(eligible({ ...base, stock_level: 0 }), false)
  assert.equal(eligible({ ...base, stock_level: null }), false)
  assert.equal(eligible({ ...base, stock_tracked: false, stock_level: 0 }), true)
})

test('buildCandidates ranks by units sold and attaches categories', () => {
  const products = [
    { id: 'a', product_number: '1', name: 'A', description: '<p>a</p>', image_url: 'https://x/a_h.png', for_sale: true, stock_tracked: true, stock_level: 5 },
    { id: 'b', product_number: '2', name: 'B', description: null, image_url: 'https://x/b_h.png', for_sale: true, stock_tracked: true, stock_level: 5 },
    { id: 'c', product_number: '3', name: 'C', description: null, image_url: 'https://x/c_h.png', for_sale: false, stock_tracked: true, stock_level: 5 },
  ]
  const links = [
    { product_id: 'a', categories: { category_path: 'Categories/X', display_name: 'X – long' } },
    { product_id: 'b', categories: { category_path: 'Categories/Y', display_name: 'Y' } },
  ]
  const lines = [
    { product_id: 'a', product_number: '1', quantity: 1 },
    { product_id: null, product_number: '2', quantity: 4 },   // matched by number
    { product_id: 'b', product_number: '2', quantity: 2 },
    { product_id: 'c', product_number: '3', quantity: 9 },    // not for sale: dropped
  ]
  const out = buildCandidates(products, links, lines)
  assert.deepEqual(out.map(p => [p.product_number, p.sold_90d]), [['2', 6], ['1', 1]])
  assert.equal(out[1].image_url, 'https://x/a.png')
  assert.equal(out[1].description, 'a')
  assert.deepEqual(out[1].categories, [{ path: 'Categories/X', name: 'X – long' }])
})
