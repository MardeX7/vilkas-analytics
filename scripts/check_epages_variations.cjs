/**
 * Check ePages API for variation products and stock levels
 */

const EPAGES_CONFIG = {
  apiUrl: 'https://www.billackering.eu/rs/shops/billackering',
  accessToken: 'XH5IrE6QIY3PLL6pX5bUr7n1jcmgeuYq'
};

async function fetchFromEpages(endpoint, params = {}) {
  const url = new URL(`${EPAGES_CONFIG.apiUrl}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${EPAGES_CONFIG.accessToken}`,
      'Accept': 'application/vnd.epages.v1+json'
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ePages API error ${response.status}: ${text}`);
  }

  return response.json();
}

async function checkVariations() {
  console.log('=== TARKISTETAAN EPAGES VARIAATIOTUOTTEET ===\n');

  // Hae muutama tuote
  const response = await fetchFromEpages('/products', {
    page: 1,
    resultsPerPage: 20
  });

  console.log(`Haettu ${response.items.length} tuotetta\n`);

  // Käy läpi tuotteet ja etsi variaatioita
  let hasVariations = 0;
  let hasStock = 0;

  for (const p of response.items) {
    const hasVariation = p.variationAttributes || p.variations || p.variationType;
    const stockLevel = p.stockLevel;

    if (hasVariation) {
      hasVariations++;
      console.log('─────────────────────────────────────────────');
      console.log('TUOTE:', p.name?.substring(0, 50));
      console.log('  ID:', p.productId);
      console.log('  stockLevel:', stockLevel);
      console.log('  variationType:', p.variationType);
      console.log('  variationAttributes:', JSON.stringify(p.variationAttributes));
      console.log('  variations:', p.variations ? `${p.variations.length} kpl` : 'N/A');

      // Jos on variaatioita, hae tuotteen täydet tiedot
      if (p.productId) {
        try {
          const fullProduct = await fetchFromEpages(`/products/${p.productId}`);
          console.log('\n  TÄYDET TIEDOT:');
          console.log('    stockLevel:', fullProduct.stockLevel);
          console.log('    variationType:', fullProduct.variationType);

          if (fullProduct.variations && fullProduct.variations.length > 0) {
            console.log('    VARIAATIOT:');
            fullProduct.variations.forEach((v, i) => {
              console.log(`      [${i}] ${v.name || v.value}`);
              console.log(`          ID: ${v.productId || v.variationId}`);
              console.log(`          stockLevel: ${v.stockLevel}`);
              console.log(`          price: ${v.price?.amount}`);
            });
          }
        } catch (e) {
          console.log('    Virhe haettaessa täysiä tietoja:', e.message);
        }
      }
      console.log('');
    }

    if (stockLevel > 0) {
      hasStock++;
      console.log('TUOTE (saldo > 0):', p.name?.substring(0, 50));
      console.log('  stockLevel:', stockLevel);
      console.log('');
    }
  }

  console.log('\n=== YHTEENVETO ===');
  console.log('Tuotteita yhteensä:', response.items.length);
  console.log('Tuotteita joissa variaatioita:', hasVariations);
  console.log('Tuotteita joissa saldo > 0:', hasStock);

  // Hae myös satunnainen tuote jolla on saldoa ePages API:sta
  console.log('\n=== HAETAAN TUOTTEITA JOILLA ON SALDOA ===');
  let page = 1;
  let foundWithStock = [];

  while (foundWithStock.length < 5 && page < 10) {
    const products = await fetchFromEpages('/products', {
      page,
      resultsPerPage: 100
    });

    if (products.items.length === 0) break;

    for (const p of products.items) {
      if (p.stockLevel > 0) {
        foundWithStock.push(p);
        console.log(`Tuote: ${p.name?.substring(0, 40)}`);
        console.log(`  stockLevel: ${p.stockLevel}`);
        console.log(`  variationType: ${p.variationType || 'N/A'}`);
        console.log('');
      }

      if (foundWithStock.length >= 5) break;
    }

    page++;
  }

  if (foundWithStock.length === 0) {
    console.log('Ei löytynyt tuotteita joilla stockLevel > 0 päätuotetasolla');
    console.log('\nTarkistetaan onko kyse variaatiotuotteista...');

    // Hae ensimmäinen tuote ja tarkista sen variaatiot
    const firstProduct = response.items[0];
    if (firstProduct) {
      try {
        const fullProduct = await fetchFromEpages(`/products/${firstProduct.productId}`);
        console.log('\nTuote:', fullProduct.name?.substring(0, 50));
        console.log('Päätuotteen stockLevel:', fullProduct.stockLevel);
        console.log('Avaimet:', Object.keys(fullProduct).join(', '));

        // Tulosta kaikki kentät jotka liittyvät varastoon tai variaatioihin
        if (fullProduct.links) {
          console.log('\nLinkit:');
          fullProduct.links.forEach(link => {
            if (link.rel && (link.rel.includes('variation') || link.rel.includes('stock'))) {
              console.log(`  ${link.rel}: ${link.href}`);
            }
          });
        }
      } catch (e) {
        console.log('Virhe:', e.message);
      }
    }
  }
}

checkVariations().catch(console.error);
