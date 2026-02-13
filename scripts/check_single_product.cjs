/**
 * Check single ePages product full details
 */

const { supabase } = require('./db.cjs');

async function fetchFromEpages(apiUrl, accessToken, endpoint) {
  const url = new URL(`${apiUrl}${endpoint}`);

  const response = await fetch(url.toString(), {
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

async function checkProduct() {
  // Hae store tiedot
  const { data: store } = await supabase
    .from('stores')
    .select('domain, epages_shop_id, access_token')
    .single();

  const domainWithoutWww = store.domain.replace(/^www\./, '');
  const apiUrl = `https://www.${domainWithoutWww}/rs/shops/${store.epages_shop_id}`;

  // Hae ensimmäinen tuote
  const products = await fetchFromEpages(apiUrl, store.access_token, '/products?page=1&resultsPerPage=1');
  const product = products.items[0];

  console.log('=== TUOTTEEN PÄÄTIEDOT ===');
  console.log('Nimi:', product.name);
  console.log('ProductID:', product.productId);
  console.log('');

  // Tulosta kaikki kentät
  console.log('=== KAIKKI KENTÄT ===');
  for (const [key, value] of Object.entries(product)) {
    if (key === 'description' || key === 'shortDescription') {
      console.log(`${key}: ${(value || '').substring(0, 50)}...`);
    } else if (typeof value === 'object' && value !== null) {
      console.log(`${key}:`, JSON.stringify(value, null, 2).substring(0, 200));
    } else {
      console.log(`${key}:`, value);
    }
  }

  // Hae tuotteen täydet tiedot
  console.log('\n=== TUOTTEEN TÄYDET TIEDOT ===');
  const fullProduct = await fetchFromEpages(apiUrl, store.access_token, `/products/${product.productId}`);

  console.log('\nKentät:', Object.keys(fullProduct).join(', '));
  console.log('\n--- Varastoon liittyvät kentät ---');
  console.log('stockLevel:', fullProduct.stockLevel);
  console.log('stockLevelMutable:', fullProduct.stockLevelMutable);
  console.log('minStockLevel:', fullProduct.minStockLevel);
  console.log('availabilityText:', fullProduct.availabilityText);
  console.log('available:', fullProduct.available);
  console.log('forSale:', fullProduct.forSale);

  console.log('\n--- Hintaan liittyvät kentät ---');
  console.log('priceInfo:', JSON.stringify(fullProduct.priceInfo, null, 2));

  console.log('\n--- Variaatiot ---');
  if (fullProduct.variationAttributes) {
    console.log('variationAttributes:', JSON.stringify(fullProduct.variationAttributes, null, 2));
  }
  if (fullProduct.variations) {
    console.log('variations:', JSON.stringify(fullProduct.variations?.slice(0, 3), null, 2));
  }
  if (fullProduct.variationType) {
    console.log('variationType:', fullProduct.variationType);
  }

  console.log('\n--- Links ---');
  if (fullProduct.links) {
    for (const link of fullProduct.links) {
      console.log(`  ${link.rel}: ${link.href}`);
    }
  }

  // Hae muutama tuote lisää nähdäksemme erilaisia
  console.log('\n\n=== MUUT TUOTTEET (stockLevel) ===');
  const moreProducts = await fetchFromEpages(apiUrl, store.access_token, '/products?page=2&resultsPerPage=10');
  for (const p of moreProducts.items) {
    console.log(`${p.name?.substring(0, 40).padEnd(40)} | stock: ${String(p.stockLevel).padEnd(5)} | forSale: ${p.forSale}`);
  }
}

checkProduct().catch(console.error);
