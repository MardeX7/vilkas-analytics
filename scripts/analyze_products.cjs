/**
 * Analyysiskripti: Tuoterakenteen ja varastoarvon analyysi
 *
 * Tarkistaa:
 * - Bundle vs. Regular tuotteet
 * - Zero-stock tuotteet
 * - Varastoarvo (cost_price vs. fallback)
 * - Products-taulun rakenne
 */

const { supabase, printProjectInfo, STORE_ID } = require('./db.cjs');

(async () => {
  printProjectInfo();
  console.log('📊 VilkasAnalytics - Tuoterakenteen analyysi\n');

  // 1. Hae kaikki tuotteet
  console.log('🔍 1. Hakee tuotedata...');
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, name, stock_level, cost_price, price_amount, for_sale')
    .eq('store_id', STORE_ID)
    .eq('for_sale', true);

  if (prodErr) {
    console.log('❌ Virhe:', prodErr.message);
    return;
  }

  console.log(`✅ Haettu ${products.length} tuotetta\n`);

  // 2. Jaa bundle ja regular tuotteet
  const bundleKeywords = /paket|kit|set/i;
  const bundleProducts = products.filter(p => bundleKeywords.test(p.name));
  const regularProducts = products.filter(p => !bundleKeywords.test(p.name));

  console.log('🔍 2. Bundle/Paketti vs. Regular tuotteet:');
  console.log(`  📦 BUNDLE (paket/kit/set): ${bundleProducts.length} kpl`);
  const bundleStock = bundleProducts.reduce((sum, p) => sum + (p.stock_level || 0), 0);
  const bundleValue = bundleProducts.reduce((sum, p) =>
    sum + (p.stock_level || 0) * (p.cost_price || p.price_amount * 0.6), 0
  );
  console.log(`     Stock: ${bundleStock} kpl`);
  console.log(`     Value: €${bundleValue.toFixed(2)}`);

  console.log(`  📦 REGULAR: ${regularProducts.length} kpl`);
  const regularStock = regularProducts.reduce((sum, p) => sum + (p.stock_level || 0), 0);
  const regularValue = regularProducts.reduce((sum, p) =>
    sum + (p.stock_level || 0) * (p.cost_price || p.price_amount * 0.6), 0
  );
  console.log(`     Stock: ${regularStock} kpl`);
  console.log(`     Value: €${regularValue.toFixed(2)}\n`);

  // 3. Zero stock mutta for_sale
  const zeroStockProducts = products.filter(p => p.stock_level === 0);
  console.log('🔍 3. Zero-stock tuotteet (for_sale=true):');
  console.log(`  ⚠️ ${zeroStockProducts.length} tuotetta joilla stock=0\n`);

  // 4. Varastoarvo (vain stock > 0)
  const stockedProducts = products.filter(p => p.stock_level > 0);
  const missingCostPrice = stockedProducts.filter(p => !p.cost_price);

  console.log('🔍 4. Varastoarvo (stock > 0):');
  console.log(`  📊 Tuotteita varastossa: ${stockedProducts.length} kpl`);
  console.log(`  📊 Yhteensä kappaletta: ${stockedProducts.reduce((sum, p) => sum + p.stock_level, 0)} kpl`);

  const valueWithFallback = stockedProducts.reduce((sum, p) =>
    sum + p.stock_level * (p.cost_price || p.price_amount * 0.6), 0
  );
  const valueCostOnly = stockedProducts.reduce((sum, p) =>
    sum + p.stock_level * (p.cost_price || 0), 0
  );

  console.log(`  💰 Varastoarvo (fallback 60%): €${valueWithFallback.toFixed(2)}`);
  console.log(`  💰 Varastoarvo (vain cost_price): €${valueCostOnly.toFixed(2)}`);
  console.log(`  ⚠️ Tuotteita ilman cost_price: ${missingCostPrice.length} kpl (${(missingCostPrice.length/stockedProducts.length*100).toFixed(1)}%)\n`);

  // 5. Esimerkit bundle-tuotteista
  console.log('🔍 5. Esimerkkejä bundle-tuotteista:');
  const bundleExamples = bundleProducts.slice(0, 5);
  if (bundleExamples.length > 0) {
    bundleExamples.forEach(p => {
      console.log(`  📦 ${p.name}`);
      console.log(`     Stock: ${p.stock_level || 0} | Cost: €${p.cost_price || 'N/A'} | Price: €${p.price_amount}`);
    });
  } else {
    console.log('  (Ei bundle-tuotteita)');
  }

  // 6. Tarkista products-taulun sarakkeet
  console.log('\n🔍 6. Products-taulun sarakkeet (tärkeimmät):');
  const sampleProduct = products[0];
  if (sampleProduct) {
    const keys = Object.keys(sampleProduct);
    keys.forEach(key => {
      const value = sampleProduct[key];
      const type = typeof value;
      console.log(`  - ${key} (${type})`);
    });
  }

  // 7. Yhteenveto
  console.log('\n📊 YHTEENVETO:');
  console.log(`  Yhteensä tuotteita (for_sale=true): ${products.length}`);
  console.log(`  - Bundle-tuotteet: ${bundleProducts.length} (${(bundleProducts.length/products.length*100).toFixed(1)}%)`);
  console.log(`  - Regular tuotteet: ${regularProducts.length} (${(regularProducts.length/products.length*100).toFixed(1)}%)`);
  console.log(`  - Zero-stock: ${zeroStockProducts.length} (${(zeroStockProducts.length/products.length*100).toFixed(1)}%)`);
  console.log(`  Varastoarvo yhteensä: €${valueWithFallback.toFixed(2)}`);
  console.log(`  Cost_price puuttuu: ${missingCostPrice.length} tuotteelta`);

})();
