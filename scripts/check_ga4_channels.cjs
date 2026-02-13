const { supabase, printProjectInfo } = require('./db.cjs')

async function check() {
  printProjectInfo()
  console.log('\n🔍 Checking ga4_analytics table...\n')

  try {
    // Check if ga4_analytics has data
    const { count, error: countError } = await supabase
      .from('ga4_analytics')
      .select('*', { count: 'exact', head: true })

    if (countError) {
      console.error('❌ Error counting rows:', countError.message)
      return
    }

    console.log('📊 ga4_analytics row count:', count)

    if (count === 0) {
      console.log('\n⚠️  Table is empty - no data to analyze')
      return
    }

    // Check what channels exist
    const { data: channels, error: channelsError } = await supabase
      .from('ga4_analytics')
      .select('session_default_channel_grouping, sessions, date')
      .not('session_default_channel_grouping', 'is', null)
      .order('date', { ascending: false })
      .limit(50)

    if (channelsError) {
      console.error('❌ Error fetching channels:', channelsError.message)
      return
    }

    console.log('\n📋 Sample data (latest 50 rows with channel grouping):')
    console.log(channels)

    // Get all channel data for distribution
    const { data: allChannels, error: allError } = await supabase
      .from('ga4_analytics')
      .select('session_default_channel_grouping')
      .not('session_default_channel_grouping', 'is', null)

    if (allError) {
      console.error('❌ Error fetching all channels:', allError.message)
      return
    }

    // Calculate channel distribution
    const channelCounts = {}
    allChannels?.forEach(row => {
      const ch = row.session_default_channel_grouping
      channelCounts[ch] = (channelCounts[ch] || 0) + 1
    })

    console.log('\n📊 Channel distribution:')
    Object.entries(channelCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([channel, count]) => {
        console.log(`  ${channel}: ${count} rows`)
      })

    // Check for NULL channels
    const { count: nullCount } = await supabase
      .from('ga4_analytics')
      .select('*', { count: 'exact', head: true })
      .is('session_default_channel_grouping', null)

    console.log(`\n⚠️  Rows with NULL channel: ${nullCount}`)

    // Get date range
    const { data: dateRange } = await supabase
      .from('ga4_analytics')
      .select('date')
      .order('date', { ascending: true })
      .limit(1)

    const { data: latestDate } = await supabase
      .from('ga4_analytics')
      .select('date')
      .order('date', { ascending: false })
      .limit(1)

    if (dateRange?.[0] && latestDate?.[0]) {
      console.log(`\n📅 Data range: ${dateRange[0].date} to ${latestDate[0].date}`)
    }

  } catch (err) {
    console.error('❌ Unexpected error:', err)
  }
}

check()
