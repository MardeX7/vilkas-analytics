const { supabase } = require('./db.cjs');

const AUTOMAALIT_STORE = '9a0ba934-bd6c-428c-8729-791d5c7ac7c2';

async function fetchAll(storeId, start, end) {
  let all = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('gsc_search_analytics')
      .select('date, query, page, clicks, impressions, position')
      .eq('store_id', storeId)
      .gte('date', start)
      .lte('date', end)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

(async () => {
  const curStart = '2026-01-22', curEnd = '2026-04-21';
  const priorStart = '2025-01-22', priorEnd = '2025-04-21';

  // Check gsc_daily_totals
  const { data: curTotals } = await supabase
    .from('gsc_daily_totals')
    .select('date, clicks, impressions, position')
    .eq('store_id', AUTOMAALIT_STORE)
    .gte('date', curStart).lte('date', curEnd);
  const { data: priorTotals } = await supabase
    .from('gsc_daily_totals')
    .select('date, clicks, impressions, position')
    .eq('store_id', AUTOMAALIT_STORE)
    .gte('date', priorStart).lte('date', priorEnd);

  const sum = (arr, k) => (arr || []).reduce((a, r) => a + (r[k] || 0), 0);
  console.log('=== gsc_daily_totals (SITE-WIDE, includes anonymized) ===');
  console.log(`Current 90d (${curStart}..${curEnd}): clicks=${sum(curTotals, 'clicks')} impr=${sum(curTotals, 'impressions')} rows=${curTotals?.length}`);
  console.log(`Prior   90d: clicks=${sum(priorTotals, 'clicks')} impr=${sum(priorTotals, 'impressions')} rows=${priorTotals?.length}`);

  // Now do brand/non-brand split correctly
  const cur = await fetchAll(AUTOMAALIT_STORE, curStart, curEnd);
  const prior = await fetchAll(AUTOMAALIT_STORE, priorStart, priorEnd);

  // Brand patterns
  const BRAND_RE = /automaalit(\.net| net|\.fi)?$|^automaalit$|^automaali$|^autom\.net$|^autoalit$/i;
  const BRAND_LOOSE = /(^|\s)(automaalit|automaali|automaalit\.net|automaalit net|automaalit\.fi)(\s|$)/i;

  const split = (rows) => {
    const brand = { clicks: 0, impressions: 0, n: 0 };
    const nonBrand = { clicks: 0, impressions: 0, n: 0 };
    const seen = { brand: new Set(), nonBrand: new Set() };
    for (const r of rows) {
      if (!r.query) continue;
      const isBrand = BRAND_LOOSE.test(r.query);
      const tgt = isBrand ? brand : nonBrand;
      const seenTgt = isBrand ? seen.brand : seen.nonBrand;
      tgt.clicks += r.clicks || 0;
      tgt.impressions += r.impressions || 0;
      seenTgt.add(r.query);
    }
    brand.n = seen.brand.size;
    nonBrand.n = seen.nonBrand.size;
    return { brand, nonBrand };
  };

  const sCur = split(cur);
  const sPrior = split(prior);
  console.log('\n=== BRAND vs NON-BRAND QUERIES (from per-query rows, not site-wide) ===');
  console.log(`Brand      cur : ${sCur.brand.clicks} clicks / ${sCur.brand.impressions} impr / ${sCur.brand.n} uniq queries`);
  console.log(`Brand      prior: ${sPrior.brand.clicks} clicks / ${sPrior.brand.impressions} impr / ${sPrior.brand.n} uniq queries`);
  console.log(`  Δ clicks: ${sCur.brand.clicks - sPrior.brand.clicks} (${((sCur.brand.clicks/Math.max(sPrior.brand.clicks,1) - 1)*100).toFixed(1)}%)`);
  console.log(`Non-brand  cur : ${sCur.nonBrand.clicks} clicks / ${sCur.nonBrand.impressions} impr / ${sCur.nonBrand.n} uniq queries`);
  console.log(`Non-brand  prior: ${sPrior.nonBrand.clicks} clicks / ${sPrior.nonBrand.impressions} impr / ${sPrior.nonBrand.n} uniq queries`);
  console.log(`  Δ clicks: ${sCur.nonBrand.clicks - sPrior.nonBrand.clicks} (${((sCur.nonBrand.clicks/Math.max(sPrior.nonBrand.clicks,1) - 1)*100).toFixed(1)}%)`);

  // Color-code / värikoodi cluster
  const COLOR = /värikoodi|värikoodilla|colorcode|värikoodi\b/i;
  const colorFilter = (rows) => rows.filter(r => COLOR.test(r.query || ''));
  const colCur = colorFilter(cur).reduce((a, r) => ({ clicks: a.clicks + r.clicks, impr: a.impr + r.impressions }), { clicks: 0, impr: 0 });
  const colPrior = colorFilter(prior).reduce((a, r) => ({ clicks: a.clicks + r.clicks, impr: a.impr + r.impressions }), { clicks: 0, impr: 0 });
  console.log('\n=== "VÄRIKOODI" CLUSTER (color-code queries) ===');
  console.log(`cur   : ${colCur.clicks} clicks / ${colCur.impr} impr`);
  console.log(`prior : ${colPrior.clicks} clicks / ${colPrior.impr} impr`);

  // Local SEO cluster
  const LOCAL = /(tuusula|espoo|vantaa|helsinki|järvenpää|kerava|hyvinkää)/i;
  const loc = (rows) => rows.filter(r => LOCAL.test(r.query || ''));
  const locCurRows = loc(cur);
  const locPriorRows = loc(prior);
  const locCur = locCurRows.reduce((a, r) => ({ clicks: a.clicks + r.clicks, impr: a.impr + r.impressions }), { clicks: 0, impr: 0 });
  const locPrior = locPriorRows.reduce((a, r) => ({ clicks: a.clicks + r.clicks, impr: a.impr + r.impressions }), { clicks: 0, impr: 0 });
  console.log('\n=== LOCAL SEO CLUSTER (cities) ===');
  console.log(`cur   : ${locCur.clicks} clicks / ${locCur.impr} impr`);
  console.log(`prior : ${locPrior.clicks} clicks / ${locPrior.impr} impr`);

  // Last 28 days vs prior year same 28 days (matches dashboard "last 28 days")
  const cur28 = cur.filter(r => r.date >= '2026-03-25');
  const prior28 = prior.filter(r => r.date >= '2025-03-25');
  const t28Cur = cur28.reduce((a, r) => ({ clicks: a.clicks + r.clicks, impr: a.impr + r.impressions }), { clicks: 0, impr: 0 });
  const t28Prior = prior28.reduce((a, r) => ({ clicks: a.clicks + r.clicks, impr: a.impr + r.impressions }), { clicks: 0, impr: 0 });
  console.log('\n=== LAST 28d vs PRIOR YEAR 28d (per-query sum) ===');
  console.log(`cur   : ${t28Cur.clicks} clicks / ${t28Cur.impr} impr`);
  console.log(`prior : ${t28Prior.clicks} clicks / ${t28Prior.impr} impr`);

  // Weekly trend in current 90d
  console.log('\n=== WEEKLY TREND current 90d ===');
  const byWeek = new Map();
  for (const r of cur) {
    const week = r.date.substring(0, 7) + '-' + (Math.floor(parseInt(r.date.substring(8, 10)) / 7) + 1);
    if (!byWeek.has(week)) byWeek.set(week, { clicks: 0, impr: 0 });
    const b = byWeek.get(week);
    b.clicks += r.clicks;
    b.impr += r.impressions;
  }
  [...byWeek.keys()].sort().forEach(w => {
    const b = byWeek.get(w);
    console.log(`  ${w}: ${b.clicks} clicks / ${b.impr} impr`);
  });

  // Top single-day click drops
  const byDay = { cur: {}, prior: {} };
  for (const r of cur) {
    byDay.cur[r.date] = (byDay.cur[r.date] || 0) + r.clicks;
  }
  for (const r of prior) {
    byDay.prior[r.date] = (byDay.prior[r.date] || 0) + r.clicks;
  }
  console.log('\n=== FIRST vs LAST 30d of 90d window ===');
  const first30 = cur.filter(r => r.date < '2026-02-21').reduce((a, r) => ({ c: a.c + r.clicks, i: a.i + r.impressions }), { c: 0, i: 0 });
  const last30 = cur.filter(r => r.date >= '2026-03-22').reduce((a, r) => ({ c: a.c + r.clicks, i: a.i + r.impressions }), { c: 0, i: 0 });
  const mid30 = cur.filter(r => r.date >= '2026-02-21' && r.date < '2026-03-22').reduce((a, r) => ({ c: a.c + r.clicks, i: a.i + r.impressions }), { c: 0, i: 0 });
  console.log(`  First 30d of window: ${first30.c} clicks / ${first30.i} impr`);
  console.log(`  Middle 30d       : ${mid30.c} clicks / ${mid30.i} impr`);
  console.log(`  Last 30d (recent): ${last30.c} clicks / ${last30.i} impr`);
})();
