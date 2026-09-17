const { supabase } = require('./db.cjs');

const AUTOMAALIT_STORE = '9a0ba934-bd6c-428c-8729-791d5c7ac7c2';

async function fetchAll(storeId, start, end) {
  let all = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('gsc_search_analytics')
      .select('date, query, page, clicks, impressions, position, ctr')
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

function aggregate(rows, key) {
  const map = new Map();
  for (const r of rows) {
    const k = r[key];
    if (!k) continue;
    if (!map.has(k)) map.set(k, { clicks: 0, impressions: 0, posSum: 0, posWeight: 0 });
    const agg = map.get(k);
    agg.clicks += r.clicks || 0;
    agg.impressions += r.impressions || 0;
    // Weighted position by impressions
    if (r.position && r.impressions) {
      agg.posSum += r.position * r.impressions;
      agg.posWeight += r.impressions;
    }
  }
  const out = [];
  for (const [k, v] of map) {
    out.push({
      key: k,
      clicks: v.clicks,
      impressions: v.impressions,
      position: v.posWeight > 0 ? v.posSum / v.posWeight : null,
      ctr: v.impressions > 0 ? v.clicks / v.impressions : 0,
    });
  }
  return out;
}

function compare(current, prior, keyName) {
  const priorMap = new Map(prior.map(p => [p.key, p]));
  const curMap = new Map(current.map(c => [c.key, c]));
  const keys = new Set([...priorMap.keys(), ...curMap.keys()]);
  const rows = [];
  for (const k of keys) {
    const c = curMap.get(k) || { clicks: 0, impressions: 0, position: null, ctr: 0 };
    const p = priorMap.get(k) || { clicks: 0, impressions: 0, position: null, ctr: 0 };
    rows.push({
      [keyName]: k,
      clicks_cur: c.clicks,
      clicks_prior: p.clicks,
      clicks_delta: c.clicks - p.clicks,
      impr_cur: c.impressions,
      impr_prior: p.impressions,
      impr_delta: c.impressions - p.impressions,
      pos_cur: c.position,
      pos_prior: p.position,
      pos_delta: c.position && p.position ? c.position - p.position : null,
      ctr_cur: c.ctr,
      ctr_prior: p.ctr,
    });
  }
  return rows;
}

(async () => {
  // 90d window ending yesterday (2026-04-20) vs same 90d a year prior
  const curStart = '2026-01-22';
  const curEnd = '2026-04-21';
  const priorStart = '2025-01-22';
  const priorEnd = '2025-04-21';

  console.log(`Fetching current window ${curStart}..${curEnd}`);
  const cur = await fetchAll(AUTOMAALIT_STORE, curStart, curEnd);
  console.log(`  rows: ${cur.length}`);

  console.log(`Fetching prior-year window ${priorStart}..${priorEnd}`);
  const prior = await fetchAll(AUTOMAALIT_STORE, priorStart, priorEnd);
  console.log(`  rows: ${prior.length}`);

  // Totals
  const tot = (rs) => rs.reduce((a, r) => ({
    clicks: a.clicks + (r.clicks || 0),
    impressions: a.impressions + (r.impressions || 0),
  }), { clicks: 0, impressions: 0 });
  const tCur = tot(cur);
  const tPrior = tot(prior);
  console.log('\n=== 90d TOTALS ===');
  console.log(`Current : ${tCur.clicks} clicks, ${tCur.impressions} impressions, CTR ${(tCur.clicks/tCur.impressions*100).toFixed(2)}%`);
  console.log(`Prior yr: ${tPrior.clicks} clicks, ${tPrior.impressions} impressions, CTR ${(tPrior.clicks/tPrior.impressions*100).toFixed(2)}%`);
  console.log(`Δ clicks: ${tCur.clicks - tPrior.clicks} (${((tCur.clicks/tPrior.clicks - 1)*100).toFixed(1)}%)`);

  // --- Queries ---
  const qCur = aggregate(cur, 'query');
  const qPrior = aggregate(prior, 'query');
  const qComp = compare(qCur, qPrior, 'query');

  console.log('\n=== TOP 25 QUERIES BY CLICK LOSS (YoY) ===');
  qComp
    .filter(r => r.clicks_prior >= 3) // ignore noise
    .sort((a, b) => a.clicks_delta - b.clicks_delta)
    .slice(0, 25)
    .forEach(r => {
      console.log(
        `  "${r.query}"`.padEnd(60) +
        ` clicks ${r.clicks_prior}→${r.clicks_cur} (Δ${r.clicks_delta})` +
        `  impr ${r.impr_prior}→${r.impr_cur}` +
        `  pos ${r.pos_prior?.toFixed(1)}→${r.pos_cur?.toFixed(1)}`
      );
    });

  console.log('\n=== TOP 25 QUERIES BY CLICK GROWTH (YoY) ===');
  qComp
    .filter(r => r.clicks_cur >= 3)
    .sort((a, b) => b.clicks_delta - a.clicks_delta)
    .slice(0, 25)
    .forEach(r => {
      console.log(
        `  "${r.query}"`.padEnd(60) +
        ` clicks ${r.clicks_prior}→${r.clicks_cur} (Δ${r.clicks_delta})` +
        `  impr ${r.impr_prior}→${r.impr_cur}` +
        `  pos ${r.pos_prior?.toFixed(1)}→${r.pos_cur?.toFixed(1)}`
      );
    });

  // --- Pages ---
  const pCur = aggregate(cur, 'page');
  const pPrior = aggregate(prior, 'page');
  const pComp = compare(pCur, pPrior, 'page');

  console.log('\n=== TOP 20 PAGES BY CLICK LOSS (YoY) ===');
  pComp
    .filter(r => r.clicks_prior >= 3)
    .sort((a, b) => a.clicks_delta - b.clicks_delta)
    .slice(0, 20)
    .forEach(r => {
      const url = r.page.replace('https://www.automaalit.net', '');
      console.log(
        `  ${url.slice(0, 70).padEnd(70)}` +
        ` clicks ${r.clicks_prior}→${r.clicks_cur} (Δ${r.clicks_delta})` +
        `  impr ${r.impr_prior}→${r.impr_cur}` +
        `  pos ${r.pos_prior?.toFixed(1)}→${r.pos_cur?.toFixed(1)}`
      );
    });

  console.log('\n=== TOP 15 PAGES BY CLICK GROWTH (YoY) ===');
  pComp
    .filter(r => r.clicks_cur >= 3)
    .sort((a, b) => b.clicks_delta - a.clicks_delta)
    .slice(0, 15)
    .forEach(r => {
      const url = r.page.replace('https://www.automaalit.net', '');
      console.log(
        `  ${url.slice(0, 70).padEnd(70)}` +
        ` clicks ${r.clicks_prior}→${r.clicks_cur} (Δ${r.clicks_delta})` +
        `  impr ${r.impr_prior}→${r.impr_cur}` +
        `  pos ${r.pos_prior?.toFixed(1)}→${r.pos_cur?.toFixed(1)}`
      );
    });

  // --- Brand vs non-brand split ---
  const BRAND_RE = /automaalit|automaali\.|automaalit\.net|autonmaalaus/i;
  const totBrand = (rs) => rs.filter(r => r.query && BRAND_RE.test(r.query))
    .reduce((a, r) => ({ clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions, n: a.n+1 }), { clicks: 0, impressions: 0, n: 0 });
  const totNonBrand = (rs) => rs.filter(r => r.query && !BRAND_RE.test(r.query))
    .reduce((a, r) => ({ clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions, n: a.n+1 }), { clicks: 0, impressions: 0, n: 0 });

  const bCur = totBrand(qCur);
  const bPrior = totBrand(qPrior);
  const nbCur = totNonBrand(qCur);
  const nbPrior = totNonBrand(qPrior);

  console.log('\n=== BRAND vs NON-BRAND ===');
  console.log(`BRAND     cur: ${bCur.clicks} clicks / ${bCur.impressions} impr / ${bCur.n} queries`);
  console.log(`BRAND    prior: ${bPrior.clicks} clicks / ${bPrior.impressions} impr / ${bPrior.n} queries`);
  console.log(`NON-BRAND  cur: ${nbCur.clicks} clicks / ${nbCur.impressions} impr / ${nbCur.n} queries`);
  console.log(`NON-BRAND prior: ${nbPrior.clicks} clicks / ${nbPrior.impressions} impr / ${nbPrior.n} queries`);

  // --- Position bucket changes (check AI Overview / SERP feature erosion pattern) ---
  console.log('\n=== POSITION-BUCKETED CTR COMPARISON ===');
  const bucketize = (rs) => {
    const b = { '1-3': {clicks:0, impr:0}, '4-10': {clicks:0, impr:0}, '11-20': {clicks:0, impr:0}, '20+': {clicks:0, impr:0} };
    for (const r of rs) {
      if (!r.impressions) continue;
      const p = r.position || 99;
      const key = p <= 3 ? '1-3' : p <= 10 ? '4-10' : p <= 20 ? '11-20' : '20+';
      b[key].clicks += r.clicks;
      b[key].impr += r.impressions;
    }
    return b;
  };
  const bCurBkt = bucketize(qCur);
  const bPriorBkt = bucketize(qPrior);
  for (const k of ['1-3', '4-10', '11-20', '20+']) {
    const c = bCurBkt[k], p = bPriorBkt[k];
    const cCtr = c.impr ? (c.clicks/c.impr*100).toFixed(2) : 'n/a';
    const pCtr = p.impr ? (p.clicks/p.impr*100).toFixed(2) : 'n/a';
    console.log(`  pos ${k.padEnd(5)} cur: ${c.clicks} cl / ${c.impr} impr / CTR ${cCtr}%   |   prior: ${p.clicks} cl / ${p.impr} impr / CTR ${pCtr}%`);
  }

  // --- Highest impressions but low/zero clicks (impression inflation) ---
  console.log('\n=== TOP 20 IMPRESSION-INFLATED QUERIES (high impr, 0-few clicks, impressions grew) ===');
  qComp
    .filter(r => r.impr_cur >= 50 && r.impr_delta > 0 && r.clicks_cur <= 2)
    .sort((a, b) => b.impr_delta - a.impr_delta)
    .slice(0, 20)
    .forEach(r => {
      console.log(
        `  "${r.query}"`.padEnd(60) +
        ` impr ${r.impr_prior}→${r.impr_cur} (Δ+${r.impr_delta})` +
        `  clicks ${r.clicks_prior}→${r.clicks_cur}` +
        `  pos ${r.pos_prior?.toFixed(1)}→${r.pos_cur?.toFixed(1)}`
      );
    });
})();
