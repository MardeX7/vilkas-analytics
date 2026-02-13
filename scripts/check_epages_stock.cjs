/**
 * Check ePages API stock levels
 * Reads access_token from stores table
 */

const { supabase } = require('./db.cjs');

async function fetchFromEpages(apiUrl, accessToken, endpoint, params = {}) {
  const url = new URL(`${apiUrl}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

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

async function checkStock() {
  console.log('=== TARKISTETAAN EPAGES SALDOT ===\n');

  // Hae store tiedot (access_token)
  const { data: store, error: storeErr } = await supabase
    .from('stores')
    .select('id, name, domain, epages_shop_id, access_token')
    .single();

  if (storeErr || !store) {
    console.log('Store error:', storeErr?.message || 'ei löydy');
    return;
  }

  console.log('Store:', store.name);
  console.log('Domain:', store.domain);
  console.log('Token:', store.access_token ? 'OK' : 'PUUTTUU');
  console.log('');

  // Muodosta API URL
  const domainWithoutWww = store.domain.replace(/^www\./, '');
  const apiUrl = `https://www.${domainWithoutWww}/rs/shops/${store.epages_shop_id}`;

  console.log('API URL:', apiUrl);
  console.log('');

  try {
    // Hae tuotteet
    const response = await fetchFromEpages(apiUrl, store.access_token, '/products', {
      page: 1,
      resultsPerPage: 100
    });

    console.log(`Tuotteita: ${response.items.length}\n`);

    // Etsi tuotteita joilla on saldoa
    let withStock = 0;
    let withVariations = 0;

    for (const p of response.items) {
      if (p.stockLevel > 0) {
        withStock++;
        console.log(`SALDO > 0: ${p.name?.substring(0, 50)}`);
        console.log(`  stockLevel: ${p.stockLevel}`);
        console.log('');
      }

      // Tarkista onko variaatiotuote
      if (p.variationType || p.variationAttributes) {
        withVariations++;
        if (withVariations <= 3) {
          console.log(`VARIAATIOTUOTE: ${p.name?.substring(0, 50)}`);
          console.log(`  stockLevel: ${p.stockLevel}`);
          console.log(`  variationType: ${p.variationType}`);
          console.log(`  productId: ${p.productId}`);

          // Hae tuotteen täydet tiedot
          try {
            const full = await fetchFromEpages(apiUrl, store.access_token, `/products/${p.productId}`);
            console.log('  FULL DATA:');
            console.log(`    stockLevel: ${full.stockLevel}`);
            console.log(`    variationType: ${full.variationType}`);

            // Tarkista kaikki kentät jotka voisivat sisältää variaatioita
            if (full.variations) {
              console.log(`    variations: ${full.variations.length} kpl`);
              for (const v of full.variations.slice(0, 3)) {
                console.log(`      - ${v.value || v.name}: stock=${v.stockLevel}, id=${v.productId || v.variationId}`);
              }
            }

            // Links voivat sisältää linkin variaatioihin
            if (full.links) {
              const variationLinks = full.links.filter(l =>
                l.rel && (l.rel.includes('variation') || l.rel.includes('stock') || l.rel === 'product')
              );
              if (variationLinks.length > 0) {
                console.log('    Relevantti linkit:');
                for (const link of variationLinks.slice(0, 5)) {
                  console.log(`      - ${link.rel}: ${link.href}`);
                }
              }
            }

            // Tulosta kaikki kentät debuggausta varten
            console.log('    Kaikki kentät:', Object.keys(full).join(', '));

          } catch (e) {
            console.log(`    Error: ${e.message}`);
          }

          console.log('');
        }
      }
    }

    console.log('\n=== YHTEENVETO ===');
    console.log(`Tuotteita yhteensä: ${response.items.length}`);
    console.log(`Tuotteita joilla stock > 0: ${withStock}`);
    console.log(`Tuotteita joilla variaatioita: ${withVariations}`);

    // Jos ei löytynyt saldoa, hae lisää sivuja
    if (withStock === 0) {
      console.log('\nHaetaan lisää sivuja...');

      for (let page = 2; page <= 5; page++) {
        const pageResponse = await fetchFromEpages(apiUrl, store.access_token, '/products', {
          page,
          resultsPerPage: 100
        });

        if (pageResponse.items.length === 0) break;

        for (const p of pageResponse.items) {
          if (p.stockLevel > 0) {
            withStock++;
            if (withStock <= 5) {
              console.log(`Sivu ${page}: ${p.name?.substring(0, 40)} - saldo: ${p.stockLevel}`);
            }
          }
        }
      }

      console.log(`\nTuotteita joilla stock > 0 (sivut 1-5): ${withStock}`);
    }

  } catch (e) {
    console.log('Error:', e.message);
  }
}

checkStock().catch(console.error);
