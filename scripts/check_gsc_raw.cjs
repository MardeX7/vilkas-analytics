const { supabase } = require("./db.cjs");

async function analyze() {
  // Use RPC to get aggregated counts by date
  const { data, error } = await supabase.rpc('get_gsc_daily_counts', {
    p_store_id: 'a28836f6-9487-4b67-9194-e907eaf94b69',
    p_start_date: '2025-12-28',
    p_end_date: '2026-01-11'
  });

  if (error) {
    console.log('RPC not available, using view directly');
    // Fallback: just use the view
    const { data: viewData } = await supabase
      .from("v_gsc_daily_summary")
      .select("*")
      .eq("store_id", "a28836f6-9487-4b67-9194-e907eaf94b69")
      .gte("date", "2025-12-28")
      .lte("date", "2026-01-11")
      .order("date", { ascending: true });

    console.log("Daily summary from view:");
    viewData?.forEach(d => {
      console.log(`  ${d.date}: ${d.total_clicks} clicks, ${d.total_impressions} impressions`);
    });
    return;
  }

  const byDate = {};
  data.forEach(d => {
    if (!byDate[d.date]) byDate[d.date] = { rows: 0, clicks: 0, impressions: 0 };
    byDate[d.date].rows++;
    byDate[d.date].clicks += d.clicks || 0;
    byDate[d.date].impressions += d.impressions || 0;
  });

  console.log("Raw data by date:");
  Object.keys(byDate).sort().forEach(date => {
    const d = byDate[date];
    console.log(`  ${date}: ${d.rows} rows, ${d.clicks} clicks, ${d.impressions} impressions`);
  });
}

analyze();
