/**
 * ActionRecommendationsCard - AI-generoidut toimenpidesuositukset
 *
 * Näyttää:
 * - 3-5 konkreettista toimenpidettä
 * - Refresh - hae uudet suositukset Emmalta
 * - "Kysy Emmalta" - avaa chat suosituksesta
 * - "Otan käsittelyyn" - seuraa edistymistä
 */

import { useState, useCallback, useEffect } from 'react'
import {
  Target,
  Clock,
  Zap,
  TrendingUp,
  Check,
  ChevronRight,
  ChevronDown,
  Package,
  ShoppingCart,
  Search,
  Users,
  Sparkles,
  RefreshCw,
  MessageCircle,
  PlayCircle,
  X,
  Loader2
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { useActionRecommendations } from '@/hooks/useActionRecommendations'
import { supabase } from '@/lib/supabase'
import { useCurrentShop } from '@/config/storeConfig'

/**
 * Icon mapping for metrics
 */
const METRIC_ICONS = {
  sales: TrendingUp,
  margin: Zap,
  conversion: Users,
  inventory: Package,
  seo: Search,
  default: Target
}

/**
 * Color mapping for effort levels
 */
const EFFORT_COLORS = {
  small: 'bg-emerald-500/10 text-emerald-500',
  medium: 'bg-amber-500/10 text-amber-500',
  large: 'bg-rose-500/10 text-rose-500'
}

/**
 * Main ActionRecommendationsCard Component
 */
export function ActionRecommendationsCard({ onAskEmma }) {
  const { shopId, storeId } = useCurrentShop()
  const { t, language } = useTranslation()
  const isFi = language === 'fi'

  const {
    recommendations,
    loading,
    error,
    markCompleted,
    isUpdating,
    refresh,
    weekNumber,
    year
  } = useActionRecommendations()

  const [isRefreshing, setIsRefreshing] = useState(false)
  const [trackedItems, setTrackedItems] = useState([])
  const [showTracked, setShowTracked] = useState(true)

  // Fetch tracked recommendations
  const fetchTracked = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .rpc('get_tracked_recommendations', {
          p_store_id: shopId,
          p_status: 'in_progress'
        })
      if (!error && data) {
        setTrackedItems(data)
      }
    } catch (err) {
      console.error('Failed to fetch tracked:', err)
    }
  }, [])

  useEffect(() => {
    fetchTracked()
  }, [fetchTracked])

  // Handle refresh - request new recommendations from Emma
  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      // Call API to generate new recommendations
      const response = await fetch('/api/generate-recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId, shop_id: shopId, language })
      })

      if (!response.ok) {
        throw new Error('Failed to generate recommendations')
      }

      // Refresh data from database
      await refresh()
    } catch (err) {
      console.error('Refresh failed:', err)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Handle "Otan käsittelyyn" - track a recommendation
  const handleTrack = async (rec) => {
    try {
      const { data, error } = await supabase
        .rpc('track_recommendation', {
          p_store_id: shopId,
          p_recommendation_id: rec.id,
          p_title: rec.title,
          p_why: rec.why,
          p_metric: rec.metric,
          p_timeframe: rec.timeframe,
          p_effort: rec.effort,
          p_impact: rec.impact,
          p_expected_result: rec.expected_result
        })

      if (!error) {
        // Refresh tracked list
        await fetchTracked()
        // Also mark as completed in original list
        if (markCompleted) {
          markCompleted(rec.id, true)
        }
      }
    } catch (err) {
      console.error('Failed to track:', err)
    }
  }

  // Handle "Kysy Emmalta" - open chat with prefilled question
  const handleAskEmma = (rec) => {
    if (onAskEmma) {
      const question = isFi
        ? `Kerro lisää suosituksesta: "${rec.title}". ${rec.why || ''} Mitä konkreettisia askelia minun pitäisi ottaa?`
        : `Berätta mer om rekommendationen: "${rec.title}". ${rec.why || ''} Vilka konkreta steg bör jag ta?`
      onAskEmma(question)
    }
  }

  // Handle completing a tracked item
  const handleCompleteTracked = async (id) => {
    try {
      await supabase.rpc('update_tracked_recommendation', {
        p_id: id,
        p_status: 'completed',
        p_progress_percent: 100
      })
      await fetchTracked()
    } catch (err) {
      console.error('Failed to complete:', err)
    }
  }

  // Handle cancelling a tracked item
  const handleCancelTracked = async (id) => {
    try {
      await supabase.rpc('update_tracked_recommendation', {
        p_id: id,
        p_status: 'cancelled'
      })
      await fetchTracked()
    } catch (err) {
      console.error('Failed to cancel:', err)
    }
  }

  if (loading) {
    return (
      <div className="bg-background-elevated border border-card-border rounded-lg p-6">
        <div className="animate-pulse">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-5 w-5 bg-background-subtle rounded" />
            <div className="h-5 w-32 bg-background-subtle rounded" />
          </div>
          <div className="space-y-3">
            <div className="h-16 bg-background-subtle rounded" />
            <div className="h-16 bg-background-subtle rounded" />
            <div className="h-16 bg-background-subtle rounded" />
          </div>
        </div>
      </div>
    )
  }

  const activeRecommendations = recommendations?.filter(r => !r.completed_at) || []
  const completedRecommendations = recommendations?.filter(r => r.completed_at) || []

  return (
    <div className="bg-background-elevated border border-card-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-card-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground">
              {t('recommendations.title')}
            </h3>
            {activeRecommendations.length > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full">
                {activeRecommendations.length}
              </span>
            )}
          </div>

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 hover:bg-background-subtle rounded-lg transition-colors disabled:opacity-50"
            title={isFi ? 'Hae uudet suositukset' : 'Hämta nya rekommendationer'}
          >
            <RefreshCw className={`h-4 w-4 text-muted-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Week info */}
        {weekNumber && (
          <p className="text-xs text-muted-foreground mt-1">
            {isFi ? `Viikko ${weekNumber}/${year}` : `Vecka ${weekNumber}/${year}`}
          </p>
        )}
      </div>

      {/* Tracked items section */}
      {trackedItems.length > 0 && (
        <div className="border-b border-card-border/50">
          <button
            onClick={() => setShowTracked(!showTracked)}
            className="w-full p-3 flex items-center justify-between hover:bg-background-subtle/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <PlayCircle className="h-4 w-4 text-violet-500" />
              <span className="text-sm font-medium text-foreground">
                {isFi ? 'Käsittelyssä' : 'Under behandling'}
              </span>
              <span className="px-1.5 py-0.5 text-xs bg-violet-500/10 text-violet-500 rounded">
                {trackedItems.length}
              </span>
            </div>
            {showTracked ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {showTracked && (
            <div className="px-4 pb-3 space-y-2">
              {trackedItems.map((item) => (
                <TrackedItem
                  key={item.id}
                  item={item}
                  onComplete={() => handleCompleteTracked(item.id)}
                  onCancel={() => handleCancelTracked(item.id)}
                  onAskEmma={() => handleAskEmma(item)}
                  isFi={isFi}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        {error && (
          <p className="text-sm text-destructive mb-4">{error}</p>
        )}

        {recommendations?.length === 0 ? (
          <div className="text-center py-6">
            <Sparkles className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {t('recommendations.noRecommendations')}
            </p>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="mt-3 px-4 py-2 text-sm bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-2"
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {isFi ? 'Generoi suositukset' : 'Generera rekommendationer'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Active recommendations */}
            {activeRecommendations.map((rec, index) => (
              <RecommendationItem
                key={rec.id}
                recommendation={rec}
                index={index + 1}
                onTrack={() => handleTrack(rec)}
                onAskEmma={() => handleAskEmma(rec)}
                isUpdating={isUpdating}
                isFi={isFi}
                t={t}
              />
            ))}

            {/* Completed recommendations (collapsed) */}
            {completedRecommendations.length > 0 && (
              <CompletedSection
                recommendations={completedRecommendations}
                onUncomplete={(id) => markCompleted(id, false)}
                t={t}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Tracked item component
 */
function TrackedItem({ item, onComplete, onCancel, onAskEmma, isFi }) {
  return (
    <div className="p-3 bg-violet-500/5 border border-violet-500/20 rounded-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {item.title}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isFi ? 'Aloitettu' : 'Startad'}: {new Date(item.started_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onAskEmma}
            className="p-1.5 hover:bg-violet-500/10 text-violet-500 rounded transition-colors"
            title={isFi ? 'Kysy Emmalta' : 'Fråga Emma'}
          >
            <MessageCircle className="h-4 w-4" />
          </button>
          <button
            onClick={onComplete}
            className="p-1.5 hover:bg-emerald-500/10 text-emerald-500 rounded transition-colors"
            title={isFi ? 'Merkitse valmiiksi' : 'Markera som klar'}
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            onClick={onCancel}
            className="p-1.5 hover:bg-rose-500/10 text-rose-400 rounded transition-colors"
            title={isFi ? 'Peruuta' : 'Avbryt'}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Individual recommendation item
 */
function RecommendationItem({ recommendation, index, onTrack, onAskEmma, isUpdating, isFi, t }) {
  const [isExpanded, setIsExpanded] = useState(false)

  const MetricIcon = METRIC_ICONS[recommendation.metric] || METRIC_ICONS.default
  const effortColor = EFFORT_COLORS[recommendation.effort] || EFFORT_COLORS.medium

  const getTimeframeLabel = (tf) => {
    switch (tf) {
      case 'immediate': return t('recommendations.timeframes.immediate')
      case 'short': return t('recommendations.timeframes.1-2_weeks')
      case 'long': return t('recommendations.timeframes.2-4_weeks')
      default: return tf
    }
  }

  const getEffortLabel = (eff) => {
    switch (eff) {
      case 'small': return t('recommendations.effortLevels.small')
      case 'medium': return t('recommendations.effortLevels.medium')
      case 'large': return t('recommendations.effortLevels.large')
      default: return eff
    }
  }

  return (
    <div className="border border-card-border/50 rounded-lg overflow-hidden hover:border-card-border transition-colors">
      {/* Main content */}
      <div className="p-3">
        <div className="flex items-start gap-3">
          {/* Index number */}
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-xs font-semibold text-primary">{index}</span>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-foreground text-sm">
              {recommendation.title}
            </h4>

            {/* Tags */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {/* Timeframe */}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-background-subtle rounded">
                <Clock className="h-3 w-3" />
                {getTimeframeLabel(recommendation.timeframe)}
              </span>

              {/* Effort */}
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded ${effortColor}`}>
                <Zap className="h-3 w-3" />
                {getEffortLabel(recommendation.effort)}
              </span>
            </div>

            {/* Expanded details */}
            {isExpanded && recommendation.why && (
              <p className="mt-2 text-xs text-muted-foreground">
                {recommendation.why}
              </p>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={onAskEmma}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-violet-500/10 hover:bg-violet-500/20 text-violet-500 rounded-lg transition-colors"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                {isFi ? 'Kysy Emmalta' : 'Fråga Emma'}
              </button>

              <button
                onClick={onTrack}
                disabled={isUpdating}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 rounded-lg transition-colors disabled:opacity-50"
              >
                <PlayCircle className="h-3.5 w-3.5" />
                {isFi ? 'Otan käsittelyyn' : 'Tar hand om'}
              </button>
            </div>
          </div>

          {/* Expand toggle */}
          {recommendation.why && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 hover:bg-background-subtle rounded transition-colors flex-shrink-0"
            >
              <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Completed recommendations section
 */
function CompletedSection({ recommendations, onUncomplete, t }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="mt-4 pt-4 border-t border-card-border/50">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
      >
        <Check className="h-4 w-4 text-emerald-500" />
        <span>{t('recommendations.completedCount', { count: recommendations.length })}</span>
        <ChevronRight className={`h-4 w-4 ml-auto transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
      </button>

      {isExpanded && (
        <div className="mt-3 space-y-2">
          {recommendations.map((rec) => (
            <div
              key={rec.id}
              className="flex items-center justify-between p-2 bg-background-subtle/50 rounded text-sm"
            >
              <span className="text-muted-foreground line-through">{rec.title}</span>
              <button
                onClick={() => onUncomplete(rec.id)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('recommendations.undo')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ActionRecommendationsCard
