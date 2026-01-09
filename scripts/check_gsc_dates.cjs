const { createClient } = require("@supabase/supabase-js")
require("dotenv").config({ path: ".env.local" })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function check() {
  const { data, error } = await supabase
    .from("gsc_search_analytics")
    .select("date, clicks, impressions")
    .gte("date", "2025-12-20")
    .order("date", { ascending: false })
    .limit(2000)

  if (error) {
    console.error("Error:", error)
    return
  }

  const byDate = {}
  data?.forEach(r => {
    if (!byDate[r.date]) byDate[r.date] = { clicks: 0, impressions: 0 }
    byDate[r.date].clicks += r.clicks || 0
    byDate[r.date].impressions += r.impressions || 0
  })

  console.log("Daily totals (Dec 20 - Jan 8):")
  Object.entries(byDate)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .forEach(([date, d]) => {
      console.log(`  ${date}: ${d.clicks} clicks, ${d.impressions} impressions`)
    })
}
check()
