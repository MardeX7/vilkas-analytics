/**
 * TrafficQualityCard - Shows traffic quality metrics
 *
 * Displays:
 * - Engagement rate (sitoutumisaste)
 * - Bounce rate
 * - Average session duration
 * - Best/worst performing channels
 */

import { Activity, TrendingUp, TrendingDown, Clock, Users } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

export function TrafficQualityCard({
  summary = {},
  previousSummary = {},
  trafficSources = [],
  comparisonEnabled = false,
  comparisonMode = 'yoy'
}) {
  const { t, language } = useTranslation()

  // Calculate engagement rate (opposite of bounce rate)
  const engagementRate = summary?.avgBounceRate != null
    ? (1 - summary.avgBounceRate) * 100
    : null
  const prevEngagementRate = previousSummary?.avgBounceRate != null
    ? (1 - previousSummary.avgBounceRate) * 100
    : null

  // Bounce rate as percentage
  const bounceRate = summary?.avgBounceRate != null
    ? summary.avgBounceRate * 100
    : null
  const prevBounceRate = previousSummary?.avgBounceRate != null
    ? previousSummary.avgBounceRate * 100
    : null

  // Average session duration
  const avgDuration = summary?.avgSessionDuration || 0
  const prevAvgDuration = previousSummary?.avgSessionDuration || 0

  // Format duration
  const formatDuration = (seconds) => {
    if (!seconds || seconds === 0) return '0s'
    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    if (mins === 0) return `${secs}s`
    if (secs === 0) return `${mins}m`
    return `${mins}m ${secs}s`
  }

  // Calculate change percentage
  const getChange = (current, previous) => {
    if (!previous || previous === 0) return null
    return ((current - previous) / previous) * 100
  }

  // Find best and worst channels by engagement
  const channelsWithEngagement = trafficSources
    .filter(s => s.sessions > 10) // Minimum sessions for relevance
    .map(s => ({
      ...s,
      engagementRate: s.engagedSessions && s.sessions
        ? (s.engagedSessions / s.sessions) * 100
        : 0
    }))
    .sort((a, b) => b.engagementRate - a.engagementRate)

  const bestChannel = channelsWithEngagement[0]
  const worstChannel = channelsWithEngagement[channelsWithEngagement.length - 1]

  // Benchmark values (industry averages)
  const BENCHMARK = {
    engagementRate: 65, // %
    bounceRate: 35, // %
    avgDuration: 105 // seconds (1m 45s)
  }

  // Check if metric is good
  const isGood = (value, benchmark, inverted = false) => {
    if (value == null) return null
    return inverted ? value < benchmark : value > benchmark
  }

  return (
    <div className="bg-background-elevated rounded-lg border border-card-border p-4">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-medium text-foreground">
          {language === 'sv' ? 'Trafikkvalitet' : 'Liikenteen laatu'}
        </h3>
      </div>

      {/* Main metrics grid */}
      <div className="space-y-4">
        {/* Engagement Rate */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-foreground-muted" />
            <span className="text-sm text-foreground-muted">
              {language === 'sv' ? 'Engagemang' : 'Sitoutumisaste'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-lg font-bold ${
              isGood(engagementRate, BENCHMARK.engagementRate)
                ? 'text-success'
                : 'text-warning'
            }`}>
              {engagementRate != null ? `${engagementRate.toFixed(1)}%` : '—'}
            </span>
            {comparisonEnabled && prevEngagementRate != null && (
              <ChangeIndicator
                change={getChange(engagementRate, prevEngagementRate)}
                label={comparisonMode.toUpperCase()}
              />
            )}
          </div>
        </div>

        {/* Bounce Rate */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-foreground-muted" />
            <span className="text-sm text-foreground-muted">
              {language === 'sv' ? 'Avvisningsfrekvens' : 'Bounce rate'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-lg font-bold ${
              isGood(bounceRate, BENCHMARK.bounceRate, true)
                ? 'text-success'
                : 'text-warning'
            }`}>
              {bounceRate != null ? `${bounceRate.toFixed(1)}%` : '—'}
            </span>
            {comparisonEnabled && prevBounceRate != null && (
              <ChangeIndicator
                change={getChange(bounceRate, prevBounceRate)}
                inverted={true}
                label={comparisonMode.toUpperCase()}
              />
            )}
          </div>
        </div>

        {/* Average Duration */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-foreground-muted" />
            <span className="text-sm text-foreground-muted">
              {language === 'sv' ? 'Snittid' : 'Kesto ka.'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-lg font-bold ${
              isGood(avgDuration, BENCHMARK.avgDuration)
                ? 'text-success'
                : 'text-warning'
            }`}>
              {formatDuration(avgDuration)}
            </span>
            {comparisonEnabled && prevAvgDuration > 0 && (
              <ChangeIndicator
                change={getChange(avgDuration, prevAvgDuration)}
                label={comparisonMode.toUpperCase()}
              />
            )}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-border my-4" />

      {/* Channel insights */}
      <div className="space-y-2">
        {bestChannel && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground-muted">
              {language === 'sv' ? 'Bäst:' : 'Paras:'}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-foreground font-medium">{bestChannel.channel}</span>
              <span className="text-success">
                {bestChannel.engagementRate.toFixed(0)}%
              </span>
            </div>
          </div>
        )}
        {worstChannel && worstChannel !== bestChannel && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground-muted">
              {language === 'sv' ? 'Sämst:' : 'Heikoin:'}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-foreground font-medium">{worstChannel.channel}</span>
              <span className="text-warning">
                {worstChannel.engagementRate.toFixed(0)}%
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Change indicator component
function ChangeIndicator({ change, inverted = false, label }) {
  if (change == null) return null

  const isPositive = inverted ? change < 0 : change > 0
  const Icon = isPositive ? TrendingUp : TrendingDown
  const colorClass = isPositive ? 'text-success' : 'text-destructive'

  return (
    <div className={`flex items-center gap-0.5 text-xs ${colorClass}`}>
      <Icon className="w-3 h-3" />
      <span>{Math.abs(change).toFixed(0)}%</span>
    </div>
  )
}

export default TrafficQualityCard
