/**
 * Jira Support Tickets Sync Cron Job
 *
 * Runs daily at 06:08 UTC (after sync-data at 06:00, before morning brief at 06:15)
 * Syncs Jira tickets for all shops that have Jira configured.
 * Updates support_tickets and support_daily_stats tables.
 *
 * Multi-tenant: iterates shops table, skips shops without jira_host.
 * Uses shop_id (analytics ID system) for support tables.
 */

import { createClient } from '@supabase/supabase-js'
import { sendToSlack, header, section, divider, context } from '../lib/slack.js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const SLACK_ALERTS_URL = process.env.SLACK_ALERTS_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL

export const config = {
  maxDuration: 300,
}

/**
 * Fetch issues from Jira REST API v3 with pagination
 */
async function fetchJiraIssues(jiraHost, jiraEmail, jiraApiToken, jql, fields) {
  const auth = Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64')
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Accept': 'application/json',
  }

  const allIssues = []
  let nextPageToken = null

  do {
    const params = new URLSearchParams({
      jql,
      fields: fields.join(','),
      maxResults: '100',
    })
    if (nextPageToken) {
      params.set('nextPageToken', nextPageToken)
    }

    const url = `https://${jiraHost}/rest/api/3/search/jql?${params}`
    console.log(`  Fetching: ${url.split('?')[0]}?jql=...`)

    let response
    try {
      response = await fetch(url, { headers })
    } catch (fetchErr) {
      throw new Error(`Fetch to ${jiraHost} failed: ${fetchErr.cause?.code || fetchErr.message}`)
    }

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Jira API ${response.status}: ${errorText.slice(0, 200)}`)
    }

    const data = await response.json()
    allIssues.push(...(data.issues || []))
    nextPageToken = data.nextPageToken || null

    console.log(`  Fetched ${data.issues?.length || 0} issues (total: ${allIssues.length})`)
  } while (nextPageToken)

  return allIssues
}

/**
 * Fetch SLA data for a single issue from Jira Service Management API
 */
async function fetchIssueSLA(jiraHost, jiraEmail, jiraApiToken, issueKey) {
  const auth = Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64')

  try {
    const url = `https://${jiraHost}/rest/servicedeskapi/request/${issueKey}/sla`
    const response = await fetch(url, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      }
    })

    if (!response.ok) return null

    const data = await response.json()
    const slaValues = {}

    for (const sla of (data.values || [])) {
      const name = (sla.name || '').toLowerCase()
      const cycle = sla.ongoingCycle || sla.completedCycles?.[0]

      if (name.includes('first response') || name.includes('time to first response')) {
        slaValues.firstResponseMs = cycle?.elapsedTime?.millis || null
        slaValues.firstResponseBreached = cycle?.breached || false
      }
      if (name.includes('resolution') || name.includes('time to resolution')) {
        slaValues.resolutionMs = cycle?.elapsedTime?.millis || null
        slaValues.resolutionBreached = cycle?.breached || false
      }
    }

    return slaValues
  } catch {
    return null
  }
}

/**
 * Map Jira issue to support_tickets row
 */
function mapIssueToTicket(issue, shopId) {
  const fields = issue.fields || {}

  return {
    shop_id: shopId,
    jira_issue_id: issue.id,
    jira_issue_key: issue.key,
    summary: fields.summary || '(no summary)',
    status: fields.status?.name || 'Unknown',
    status_category: fields.status?.statusCategory?.key || null,
    priority: fields.priority?.name || null,
    issue_type: fields.issuetype?.name || null,
    labels: fields.labels || [],
    created_at: fields.created,
    updated_at: fields.updated,
    resolved_at: fields.resolutiondate || null,
    reporter_name: fields.reporter?.displayName || null,
    assignee_name: fields.assignee?.displayName || null,
    synced_at: new Date().toISOString(),
  }
}

/**
 * Update support_daily_stats for yesterday
 */
async function updateDailyStats(supabase, shopId, yesterday) {
  // Count tickets created yesterday
  const { count: created } = await supabase
    .from('support_tickets')
    .select('*', { count: 'exact', head: true })
    .eq('shop_id', shopId)
    .gte('created_at', `${yesterday}T00:00:00`)
    .lt('created_at', `${yesterday}T23:59:59.999`)

  // Count tickets resolved yesterday
  const { count: resolved } = await supabase
    .from('support_tickets')
    .select('*', { count: 'exact', head: true })
    .eq('shop_id', shopId)
    .gte('resolved_at', `${yesterday}T00:00:00`)
    .lt('resolved_at', `${yesterday}T23:59:59.999`)

  // Count currently open tickets (snapshot)
  const { count: open } = await supabase
    .from('support_tickets')
    .select('*', { count: 'exact', head: true })
    .eq('shop_id', shopId)
    .neq('status_category', 'done')

  // Average response times for tickets created yesterday
  const { data: yesterdayTickets } = await supabase
    .from('support_tickets')
    .select('first_response_ms, resolution_ms, sla_first_response_breached, sla_resolution_breached')
    .eq('shop_id', shopId)
    .gte('created_at', `${yesterday}T00:00:00`)
    .lt('created_at', `${yesterday}T23:59:59.999`)

  let avgFirstResponse = null
  let avgResolution = null
  let slaBreaches = 0

  if (yesterdayTickets?.length) {
    const withFirstResponse = yesterdayTickets.filter(t => t.first_response_ms)
    const withResolution = yesterdayTickets.filter(t => t.resolution_ms)

    if (withFirstResponse.length) {
      avgFirstResponse = Math.round(
        withFirstResponse.reduce((sum, t) => sum + t.first_response_ms, 0) / withFirstResponse.length
      )
    }
    if (withResolution.length) {
      avgResolution = Math.round(
        withResolution.reduce((sum, t) => sum + t.resolution_ms, 0) / withResolution.length
      )
    }

    slaBreaches = yesterdayTickets.filter(
      t => t.sla_first_response_breached || t.sla_resolution_breached
    ).length
  }

  const { error } = await supabase
    .from('support_daily_stats')
    .upsert({
      shop_id: shopId,
      date: yesterday,
      tickets_created: created || 0,
      tickets_resolved: resolved || 0,
      tickets_open: open || 0,
      avg_first_response_ms: avgFirstResponse,
      avg_resolution_ms: avgResolution,
      sla_breaches: slaBreaches,
    }, { onConflict: 'shop_id,date' })

  if (error) {
    console.error(`  Daily stats upsert error: ${error.message}`)
  }

  return { created: created || 0, resolved: resolved || 0, open: open || 0, slaBreaches }
}

/**
 * Sync Jira tickets for a single shop
 */
async function syncJiraForShop(supabase, shop) {
  const { id: shopId, name, jira_host, jira_email, jira_api_token, jira_project_key } = shop

  console.log(`\n📋 Syncing Jira for ${name} (project: ${jira_project_key}, host: ${jira_host})`)

  // Fetch issues updated in last 7 days
  const jql = `project = "${jira_project_key}" AND updated >= -7d ORDER BY updated DESC`
  const fields = [
    'summary', 'status', 'priority', 'issuetype', 'labels',
    'created', 'updated', 'resolutiondate', 'reporter', 'assignee'
  ]

  const issues = await fetchJiraIssues(jira_host, jira_email, jira_api_token, jql, fields)
  console.log(`  Found ${issues.length} issues updated in last 7 days`)

  // Map issues to ticket rows
  const tickets = issues.map(issue => mapIssueToTicket(issue, shopId))

  // Fetch SLA data for recently updated tickets (last 1 day to limit API calls)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const recentIssues = issues.filter(i => i.fields?.updated >= oneDayAgo)
  console.log(`  Fetching SLA for ${recentIssues.length} recently updated issues`)

  for (const issue of recentIssues) {
    const sla = await fetchIssueSLA(jira_host, jira_email, jira_api_token, issue.key)
    if (sla) {
      const ticket = tickets.find(t => t.jira_issue_id === issue.id)
      if (ticket) {
        ticket.first_response_ms = sla.firstResponseMs
        ticket.resolution_ms = sla.resolutionMs
        ticket.sla_first_response_breached = sla.firstResponseBreached || false
        ticket.sla_resolution_breached = sla.resolutionBreached || false
      }
    }
  }

  // Upsert tickets to Supabase
  if (tickets.length > 0) {
    // Upsert in batches of 50
    for (let i = 0; i < tickets.length; i += 50) {
      const batch = tickets.slice(i, i + 50)
      const { error } = await supabase
        .from('support_tickets')
        .upsert(batch, { onConflict: 'shop_id,jira_issue_id' })

      if (error) {
        throw new Error(`Upsert batch ${i}-${i + batch.length} failed: ${error.message}`)
      }
    }
    console.log(`  ✅ Upserted ${tickets.length} tickets`)
  }

  // Update daily stats for yesterday
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const stats = await updateDailyStats(supabase, shopId, yesterday)
  console.log(`  ✅ Daily stats: ${stats.created} created, ${stats.resolved} resolved, ${stats.open} open`)

  return {
    status: 'success',
    tickets_synced: tickets.length,
    sla_fetched: recentIssues.length,
    daily_stats: stats,
  }
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  console.log('📋 Starting Jira sync:', new Date().toISOString())

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Missing Supabase credentials' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const results = {
    started_at: new Date().toISOString(),
    shops: [],
    errors: [],
  }

  try {
    // Get all shops with Jira configured
    const { data: shops, error: shopsError } = await supabase
      .from('shops')
      .select('id, name, store_id, currency, jira_host, jira_email, jira_api_token, jira_project_key')
      .not('jira_host', 'is', null)

    if (shopsError) {
      throw new Error(`Failed to fetch shops: ${shopsError.message}`)
    }

    if (!shops?.length) {
      console.log('⏭️ No shops with Jira configured')
      return res.status(200).json({ message: 'No shops with Jira configured', results })
    }

    console.log(`Found ${shops.length} shop(s) with Jira configured`)

    // Process each shop
    for (const shop of shops) {
      try {
        const result = await syncJiraForShop(supabase, shop)
        results.shops.push({ shop: shop.name, ...result })
      } catch (err) {
        console.error(`❌ ${shop.name} Jira sync error:`, err.message)
        results.shops.push({ shop: shop.name, status: 'error', error: err.message })
        results.errors.push(`Jira sync failed for ${shop.name}: ${err.message}`)
      }
    }

    results.completed_at = new Date().toISOString()
    results.duration_ms = new Date(results.completed_at) - new Date(results.started_at)

    console.log(`\n✅ Jira sync completed in ${results.duration_ms}ms`)

    // Send Slack alert if errors
    if (results.errors.length > 0 && SLACK_ALERTS_URL) {
      await sendToSlack(SLACK_ALERTS_URL, {
        blocks: [
          header(`:warning: Jira sync -virhe ${new Date().toISOString().split('T')[0]}`),
          section(results.errors.map((e, i) => `*${i + 1}.* \`${e}\``).join('\n')),
          context(`:link: <https://vilkas-analytics.vercel.app|Vilkas Analytics>`)
        ]
      })
    }

    return res.status(200).json(results)

  } catch (error) {
    console.error('❌ Jira sync cron failed:', error)
    results.errors.push(error.message)
    results.completed_at = new Date().toISOString()

    if (SLACK_ALERTS_URL) {
      await sendToSlack(SLACK_ALERTS_URL, {
        blocks: [
          header(`:fire: Jira sync CRASH ${new Date().toISOString().split('T')[0]}`),
          section(`\`${error.message}\``),
        ]
      })
    }

    return res.status(500).json({ ...results, error: error.message })
  }
}
