const { supabase, STORE_ID } = require('./db.cjs');

function formatGA4Date(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null;
  return yyyymmdd.slice(0, 4) + '-' + yyyymmdd.slice(4, 6) + '-' + yyyymmdd.slice(6, 8);
}

async function syncGA4() {
  console.log('=== SYNCING GA4 DATA ===\n');

  // First clear everything
  const { error: delError } = await supabase.from('ga4_analytics').delete().neq('store_id', 'x');
  console.log('Cleared all data, error:', delError);

  const { count: afterClear } = await supabase
    .from('ga4_analytics')
    .select('*', { count: 'exact', head: true });
  console.log('Rows after clear:', afterClear);

  // Get token
  const { data: token } = await supabase
    .from('ga4_tokens')
    .select('*')
    .eq('store_id', STORE_ID)
    .single();

  if (!token) {
    console.log('No token found!');
    return;
  }

  // Fetch data
  const response = await fetch(
    'https://analyticsdata.googleapis.com/v1beta/' + token.property_id + ':runReport',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        // Use last 40 days from today to cover current period
        dateRanges: [{ startDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], endDate: new Date().toISOString().split('T')[0] }],
        dimensions: [
          { name: 'date' },
          { name: 'sessionSource' },
          { name: 'sessionMedium' },
          { name: 'sessionDefaultChannelGrouping' },
          { name: 'landingPage' }
        ],
        metrics: [
          { name: 'sessions' },
          { name: 'engagedSessions' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
          { name: 'newUsers' },
          { name: 'totalUsers' }
        ],
        limit: 100000
      })
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.log('GA4 API Error:', response.status, err);
    return;
  }

  const reportData = await response.json();
  console.log('\nRows from GA4:', reportData.rowCount);

  // Try inserting row by row to find the issue
  let success = 0;
  let duplicates = 0;
  const seenKeys = new Set();

  for (const row of (reportData.rows || [])) {
    const dims = row.dimensionValues || [];
    const mets = row.metricValues || [];

    const date = formatGA4Date(dims[0]?.value);
    if (!date) continue;

    const newUsers = parseInt(mets[4]?.value || 0);
    const totalUsers = parseInt(mets[5]?.value || 0);

    const record = {
      store_id: STORE_ID,
      property_id: token.property_id,
      date: date,
      session_source: dims[1]?.value || null,
      session_medium: dims[2]?.value || null,
      session_default_channel_grouping: dims[3]?.value || null,
      landing_page: dims[4]?.value || null,
      sessions: parseInt(mets[0]?.value || 0),
      engaged_sessions: parseInt(mets[1]?.value || 0),
      bounce_rate: parseFloat(mets[2]?.value || 0),
      average_session_duration: parseFloat(mets[3]?.value || 0),
      new_users: newUsers,
      returning_users: Math.max(0, totalUsers - newUsers)
    };

    // Create unique key
    const key = [
      record.store_id,
      record.property_id,
      record.date,
      record.session_source,
      record.session_medium,
      record.session_default_channel_grouping,
      record.landing_page
    ].join('|');

    if (seenKeys.has(key)) {
      duplicates++;
      continue;
    }
    seenKeys.add(key);

    const { error } = await supabase.from('ga4_analytics').insert([record]);

    if (error) {
      // Ignore duplicate key errors and continue
      if (error.code === '23505') {
        duplicates++;
      } else {
        console.log('Error:', error.message);
      }
    } else {
      success++;
    }

    if (success % 100 === 0 && success > 0) {
      console.log('Progress:', success, 'inserted');
    }
  }

  console.log('\nSuccess:', success, '- Duplicates:', duplicates);

  // Verify
  const { count } = await supabase
    .from('ga4_analytics')
    .select('*', { count: 'exact', head: true });
  console.log('Final count:', count);

  // Check view
  const { data: viewData } = await supabase
    .from('v_ga4_daily_summary')
    .select('*')
    .eq('store_id', STORE_ID)
    .order('date', { ascending: false })
    .limit(3);

  console.log('\nDaily summary:', viewData);
}

syncGA4();
