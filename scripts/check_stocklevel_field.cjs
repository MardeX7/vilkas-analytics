/**
 * Check stocklevel field name in ePages API
 */

const { supabase } = require('./db.cjs');

async function fetchFromEpages(apiUrl, accessToken, endpoint) {
  const response = await fetch(`${apiUrl}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.epages.v1+json'
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ePages API error ${response.status}: ${text}`);
  }

  return response.json();
}

async function check() {
  const { data: store } = await supabase
    .from('stores')
    .select('domain, epages_shop_id, access_token')
    .single();

  const domainWithoutWww = store.domain.replace(/^www\./, '');
  const apiUrl = `https://www.${domainWithoutWww}/rs/shops/${store.epages_shop_id}`;

  // LISTA-HAU
  console.log('=== LISTA-HAU (/products?page=1) ===');
  const listProducts = await fetchFromEpages(apiUrl, store.access_token, '/products?page=1&resultsPerPage=3');

  for (const p of listProducts.items) {
    console.log(`\nTuote: ${p.name?.substring(0, 40)}`);
    console.log('  stockLevel:', p.stockLevel);       // camelCase
    console.log('  stocklevel:', p.stocklevel);       // lowercase
    console.log('  availability:', p.availability);

    // Tulosta kaikki "stock" kentät
    const stockFields = Object.entries(p).filter(([k]) => k.toLowerCase().includes('stock'));
    if (stockFields.length > 0) {
      console.log('  Stock-kentät:', stockFields.map(([k, v]) => `${k}=${v}`).join(', '));
    }
  }

  // YKSITTÄINEN HAU
  const productId = listProducts.items[0].productId;
  console.log('\n\n=== YKSITTÄINEN HAU (/products/{id}) ===');
  const singleProduct = await fetchFromEpages(apiUrl, store.access_token, `/products/${productId}`);

  console.log(`Tuote: ${singleProduct.name?.substring(0, 40)}`);
  console.log('  stockLevel:', singleProduct.stockLevel);
  console.log('  stocklevel:', singleProduct.stocklevel);
  console.log('  availability:', singleProduct.availability);

  // Tulosta kaikki "stock" kentät
  const singleStockFields = Object.entries(singleProduct).filter(([k]) => k.toLowerCase().includes('stock'));
  if (singleStockFields.length > 0) {
    console.log('  Stock-kentät:', singleStockFields.map(([k, v]) => `${k}=${v}`).join(', '));
  }

  // Vertaa
  console.log('\n\n=== JOHTOPÄÄTÖS ===');
  console.log('Lista-haussa stockLevel:', typeof listProducts.items[0].stockLevel !== 'undefined' ? 'ON' : 'EI');
  console.log('Lista-haussa stocklevel:', typeof listProducts.items[0].stocklevel !== 'undefined' ? 'ON' : 'EI');
  console.log('Yksittäisessä stockLevel:', typeof singleProduct.stockLevel !== 'undefined' ? 'ON' : 'EI');
  console.log('Yksittäisessä stocklevel:', typeof singleProduct.stocklevel !== 'undefined' ? 'ON' : 'EI');
}

check().catch(console.error);
