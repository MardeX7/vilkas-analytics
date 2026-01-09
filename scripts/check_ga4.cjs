const { supabase, STORE_ID } = require('./db.cjs');

async function checkGA4() {
  // Check if GA4 is connected for this store
  const { data: ga4Token } = await supabase
    .from('ga4_tokens')
    .select('*')
    .eq('store_id', STORE_ID)
    .single();

  console.log('GA4 connected:', ga4Token ? true : false);

  if (!ga4Token) {
    console.log('No GA4 token found - conversion rate requires GA4 sessions data');
    return;
  }

  // Check GA4 data for current period
  const { data: ga4Data, count } = await supabase
    .from('ga4_daily')
    .select('*', { count: 'exact' })
    .eq('store_id', STORE_ID)
    .gte('date', '2025-12-11')
    .lte('date', '2026-01-09');

  console.log('GA4 daily rows:', count);

  if (ga4Data && ga4Data.length > 0) {
    const totalSessions = ga4Data.reduce((sum, d) => sum + (d.sessions || 0), 0);
    console.log('Total sessions:', totalSessions);
    console.log('Sample:', ga4Data[0]);
  }
}
checkGA4();
