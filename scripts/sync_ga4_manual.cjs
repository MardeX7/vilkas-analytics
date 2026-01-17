/**
 * Manual GA4 sync script
 */
const { supabase, STORE_ID, printProjectInfo } = require('./db.cjs');

async function syncGA4() {
  printProjectInfo();
  console.log('\n🔄 Starting GA4 sync...');

  // Get token
  const { data: tokenData, error: tokenError } = await supabase
    .from('ga4_tokens')
    .select('*')
    .eq('store_id', STORE_ID)
    .single();

  if (tokenError || !tokenData) {
    console.error('Token error:', tokenError);
    return;
  }

  console.log('Property:', tokenData.property_name);
  console.log('Property ID:', tokenData.property_id);

  const accessToken = tokenData.access_token;
  const propertyId = tokenData.property_id;

  // Sync last 90 days
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 90);
  const startStr = startDate.toISOString().split('T')[0];

  console.log('Date range:', startStr, 'to', endDate);

  // Fetch GA4 report
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: startStr, endDate }],
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
    console.error('API error:', response.status, await response.text());
    return;
  }

  const reportData = await response.json();
  console.log('Row count from API:', reportData.rowCount || 0);

  if (!reportData.rows || reportData.rows.length === 0) {
    console.log('No rows returned');
    return;
  }

  // Transform and aggregate data by date+source+medium+channel
  // (aggregate landing pages to avoid unique constraint issues)
  const aggregated = new Map();

  reportData.rows.forEach(row => {
    const dims = row.dimensionValues || [];
    const mets = row.metricValues || [];

    const dateRaw = dims[0]?.value; // YYYYMMDD
    if (!dateRaw) return;

    const date = dateRaw.slice(0, 4) + '-' + dateRaw.slice(4, 6) + '-' + dateRaw.slice(6, 8);
    const source = dims[1]?.value || '(direct)';
    const medium = dims[2]?.value || '(none)';
    const channel = dims[3]?.value || 'Direct';
    const landingPage = dims[4]?.value || '/';

    // Create unique key for aggregation
    const key = `${date}|${source}|${medium}|${channel}|${landingPage}`;

    if (!aggregated.has(key)) {
      aggregated.set(key, {
        store_id: STORE_ID,
        property_id: propertyId,
        date,
        session_source: source,
        session_medium: medium,
        session_default_channel_grouping: channel,
        landing_page: landingPage,
        sessions: 0,
        engaged_sessions: 0,
        bounce_rate_sum: 0,
        bounce_rate_count: 0,
        avg_duration_sum: 0,
        avg_duration_count: 0,
        new_users: 0,
        returning_users: 0
      });
    }

    const agg = aggregated.get(key);
    const sessions = parseInt(mets[0]?.value || 0);
    agg.sessions += sessions;
    agg.engaged_sessions += parseInt(mets[1]?.value || 0);

    const bounceRate = parseFloat(mets[2]?.value || 0);
    if (bounceRate > 0) {
      agg.bounce_rate_sum += bounceRate * sessions;
      agg.bounce_rate_count += sessions;
    }

    const avgDuration = parseFloat(mets[3]?.value || 0);
    if (avgDuration > 0) {
      agg.avg_duration_sum += avgDuration * sessions;
      agg.avg_duration_count += sessions;
    }

    const newUsers = parseInt(mets[4]?.value || 0);
    const totalUsers = parseInt(mets[5]?.value || 0);
    agg.new_users += newUsers;
    agg.returning_users += Math.max(0, totalUsers - newUsers);
  });

  // Finalize records
  const records = Array.from(aggregated.values()).map(agg => ({
    store_id: agg.store_id,
    property_id: agg.property_id,
    date: agg.date,
    session_source: agg.session_source,
    session_medium: agg.session_medium,
    session_default_channel_grouping: agg.session_default_channel_grouping,
    landing_page: agg.landing_page,
    sessions: agg.sessions,
    engaged_sessions: agg.engaged_sessions,
    bounce_rate: agg.bounce_rate_count > 0 ? agg.bounce_rate_sum / agg.bounce_rate_count : 0,
    average_session_duration: agg.avg_duration_count > 0 ? agg.avg_duration_sum / agg.avg_duration_count : 0,
    new_users: agg.new_users,
    returning_users: agg.returning_users
  }));

  console.log('Aggregated records:', records.length);
  console.log('Sample record:', JSON.stringify(records[0], null, 2));

  // Delete ALL existing data for this store (clean slate)
  console.log('Deleting ALL existing GA4 data for store...');
  const { error: delError } = await supabase
    .from('ga4_analytics')
    .delete()
    .eq('store_id', STORE_ID);

  if (delError) {
    console.error('Delete error:', delError.message);
  }

  // Insert in smaller batches with upsert
  const batchSize = 100;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error: insertError } = await supabase
      .from('ga4_analytics')
      .upsert(batch, {
        onConflict: 'store_id,property_id,date,session_source,session_medium,landing_page'
      });

    if (insertError) {
      errors++;
      if (errors <= 3) {
        console.error('Upsert error at batch', Math.floor(i/batchSize), ':', insertError.message);
      }
    } else {
      inserted += batch.length;
    }

    // Progress indicator
    if ((i + batchSize) % 1000 === 0 || i + batchSize >= records.length) {
      console.log('  Progress:', Math.min(i + batchSize, records.length), '/', records.length);
    }
  }

  if (errors > 3) {
    console.log('  (' + (errors - 3) + ' more errors suppressed)');
  }

  console.log('✅ Inserted:', inserted, 'rows');

  // Verify
  const { data: sample } = await supabase
    .from('ga4_analytics')
    .select('date, session_default_channel_grouping, sessions')
    .eq('store_id', STORE_ID)
    .order('date', { ascending: false })
    .limit(5);

  console.log('\nNewest data:');
  sample.forEach(r => console.log('  ' + r.date + ':', r.session_default_channel_grouping, '-', r.sessions, 'sessions'));
}

syncGA4();
