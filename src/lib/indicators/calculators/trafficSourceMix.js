/**
 * Traffic Source Mix Indicator Calculator
 *
 * Data Source: GA4 (Google Analytics 4)
 * Category: behavioral
 *
 * Tracks diversity of traffic sources.
 * High concentration on single source = risk.
 * NOTE: GA4 is for BEHAVIORAL data only, NOT transactions.
 */

import {
  createPeriod,
  determinePriority,
  determineConfidence,
  DEFAULT_THRESHOLDS
} from '../types.js'

/**
 * Calculate traffic source mix indicator
 *
 * @param {Object} params
 * @param {Array} params.ga4Data - GA4 analytics data
 * @param {Date} params.periodEnd - End date for analysis
 * @param {'7d' | '30d' | '90d'} params.periodLabel - Period length
 * @returns {Object} Traffic source mix indicator
 */
export function calculateTrafficSourceMix({ ga4Data, periodEnd, periodLabel = '30d' }) {
  const endDate = periodEnd instanceof Date ? periodEnd : new Date(periodEnd)

  // Determine period length in days
  const periodDays = periodLabel === '7d' ? 7 : periodLabel === '30d' ? 30 : 90

  // Calculate period dates
  const periodStart = new Date(endDate)
  periodStart.setDate(periodStart.getDate() - periodDays + 1)

  // Filter data by period
  const currentData = filterByPeriod(ga4Data, periodStart, endDate)

  // Aggregate by channel
  const channelMap = new Map()
  let totalSessions = 0

  for (const row of currentData) {
    const channel = row.session_default_channel_grouping || 'Direct'
    const sessions = row.sessions || 0

    if (!channelMap.has(channel)) {
      channelMap.set(channel, 0)
    }
    channelMap.set(channel, channelMap.get(channel) + sessions)
    totalSessions += sessions
  }

  // Calculate channel percentages
  const channels = Array.from(channelMap.entries())
    .map(([channel, sessions]) => ({
      channel,
      sessions,
      percentage: totalSessions > 0 ? (sessions / totalSessions) * 100 : 0
    }))
    .sort((a, b) => b.sessions - a.sessions)

  // Calculate concentration risk (top channel %)
  const topChannelPercent = channels.length > 0 ? channels[0].percentage : 0
  const diversityScore = calculateDiversityScore(channels)

  // Risk assessment: high concentration on single source = bad
  const isConcentrated = topChannelPercent > 60

  const thresholds = DEFAULT_THRESHOLDS.traffic_source_mix || {
    critical_high: 80,
    warning_high: 60,
    warning_low: null,
    critical_low: null
  }

  const alertTriggered = topChannelPercent > thresholds.warning_high

  // Direction: concentrated = 'down' (bad), diverse = 'up' (good)
  const direction = isConcentrated ? 'down' : 'up'

  return {
    id: 'traffic_source_mix',
    name: 'Trafikfördelning',
    category: 'behavioral',

    value: Math.round(topChannelPercent * 100) / 100, // Top channel %
    unit: '%',

    direction,
    change_percent: null, // No comparison for mix
    change_absolute: null,

    period: createPeriod(periodStart, endDate, periodLabel),
    comparison_period: null,

    confidence: determineConfidence(totalSessions, 1000, 100),
    priority: isConcentrated ? 'high' : 'low',

    thresholds,
    alert_triggered: alertTriggered,

    context: {
      seasonal_adjusted: false,
      anomaly_detected: topChannelPercent > 80,
      notes: generateMixNotes(channels, topChannelPercent)
    },

    metrics: {
      total_sessions: totalSessions,
      channel_count: channels.length,
      top_channel: channels[0]?.channel || 'N/A',
      top_channel_percent: Math.round(topChannelPercent * 100) / 100,
      diversity_score: diversityScore
    },

    channels: channels.slice(0, 10).map(c => ({
      channel: c.channel,
      sessions: c.sessions,
      percentage: Math.round(c.percentage * 100) / 100
    })),

    calculated_at: new Date().toISOString(),
    data_freshness: new Date().toISOString()
  }
}

/**
 * Filter GA4 data by date period
 */
function filterByPeriod(data, startDate, endDate) {
  return data.filter(row => {
    const date = new Date(row.date)
    return date >= startDate && date <= endDate
  })
}

/**
 * Calculate Shannon diversity index (0-100, higher = more diverse)
 */
function calculateDiversityScore(channels) {
  if (channels.length === 0) return 0

  const total = channels.reduce((sum, c) => sum + c.sessions, 0)
  if (total === 0) return 0

  let entropy = 0
  for (const channel of channels) {
    if (channel.sessions > 0) {
      const p = channel.sessions / total
      entropy -= p * Math.log2(p)
    }
  }

  // Normalize to 0-100
  const maxEntropy = Math.log2(channels.length)
  return maxEntropy > 0 ? Math.round((entropy / maxEntropy) * 100) : 0
}

/**
 * Generate human-readable notes
 */
function generateMixNotes(channels, topPercent) {
  if (topPercent > 70) {
    return `Hög koncentration: ${channels[0]?.channel} står för ${topPercent.toFixed(0)}% av trafiken. Diversifiera trafikkanaler.`
  } else if (channels.length >= 5) {
    return `Bra trafikspridning med ${channels.length} aktiva kanaler.`
  } else if (channels.length <= 2) {
    return `Begränsad trafikspridning. Endast ${channels.length} kanal(er) aktiva.`
  }
  return `Trafikfördelning: ${channels.slice(0, 3).map(c => `${c.channel} (${c.percentage.toFixed(0)}%)`).join(', ')}.`
}

export default calculateTrafficSourceMix
