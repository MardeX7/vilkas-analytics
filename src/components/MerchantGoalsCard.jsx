/**
 * MerchantGoalsCard - Display and manage merchant goals
 *
 * Näyttää aktiiviset tavoitteet progress-palkeilla ja mahdollistaa uusien luomisen.
 */

import { useState } from 'react'
import { Target, Plus, X, TrendingUp, ShoppingCart, Receipt, PieChart, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMerchantGoals, GOAL_TYPES, PERIOD_TYPES, getCurrentPeriodLabel } from '@/hooks/useMerchantGoals'
import { Button } from '@/components/ui/button'

/**
 * Progress bar component
 */
function ProgressBar({ progress, color = 'bg-primary' }) {
  const clampedProgress = Math.min(Math.max(progress, 0), 100)

  return (
    <div className="w-full h-2 bg-background-subtle rounded-full overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all duration-500', color)}
        style={{ width: `${clampedProgress}%` }}
      />
    </div>
  )
}

/**
 * Single goal item
 */
function GoalItem({ goal, onDeactivate, onRefresh, isDeactivating, isCalculating }) {
  const config = GOAL_TYPES[goal.goal_type] || GOAL_TYPES.revenue
  const periodConfig = PERIOD_TYPES[goal.period_type] || PERIOD_TYPES.monthly

  const Icon = {
    TrendingUp,
    ShoppingCart,
    Receipt,
    PieChart,
    Target
  }[config.icon] || Target

  const progressColor = goal.progress_percent >= 100
    ? 'bg-green-500'
    : goal.progress_percent >= 75
      ? 'bg-primary'
      : goal.progress_percent >= 50
        ? 'bg-yellow-500'
        : 'bg-orange-500'

  return (
    <div className="p-3 bg-background-subtle rounded-lg">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={cn('w-4 h-4', config.color)} />
          <div>
            <p className="text-sm font-medium text-foreground">{config.label}</p>
            <p className="text-xs text-foreground-muted">
              {periodConfig.label}: {goal.period_label}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onRefresh(goal.id)}
            disabled={isCalculating}
            className="p-1 text-foreground-muted hover:text-foreground transition-colors"
            title="Päivitä"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isCalculating && 'animate-spin')} />
          </button>
          <button
            onClick={() => onDeactivate(goal.id)}
            disabled={isDeactivating}
            className="p-1 text-foreground-muted hover:text-destructive transition-colors"
            title="Poista tavoite"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-foreground-muted">
            {goal.current_value?.toLocaleString('sv-SE')} / {goal.target_value?.toLocaleString('sv-SE')} {config.unit}
          </span>
          <span className={cn('font-semibold tabular-nums', goal.progress_percent >= 100 ? 'text-green-500' : 'text-foreground')}>
            {goal.progress_percent?.toFixed(0)}%
          </span>
        </div>
        <ProgressBar progress={goal.progress_percent || 0} color={progressColor} />
      </div>
    </div>
  )
}

/**
 * Add goal form
 */
function AddGoalForm({ onSubmit, onCancel, isSubmitting }) {
  const [goalType, setGoalType] = useState('revenue')
  const [periodType, setPeriodType] = useState('monthly')
  const [targetValue, setTargetValue] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!targetValue || parseFloat(targetValue) <= 0) return

    onSubmit({
      goalType,
      periodType,
      periodLabel: getCurrentPeriodLabel(periodType),
      targetValue: parseFloat(targetValue)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 bg-background-subtle rounded-lg space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-foreground-muted mb-1 block">Tavoitetyyppi</label>
          <select
            value={goalType}
            onChange={(e) => setGoalType(e.target.value)}
            className="w-full px-2 py-1.5 text-sm bg-background border border-card-border rounded"
          >
            {Object.entries(GOAL_TYPES).map(([key, config]) => (
              <option key={key} value={key}>{config.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-foreground-muted mb-1 block">Jakso</label>
          <select
            value={periodType}
            onChange={(e) => setPeriodType(e.target.value)}
            className="w-full px-2 py-1.5 text-sm bg-background border border-card-border rounded"
          >
            {Object.entries(PERIOD_TYPES).map(([key, config]) => (
              <option key={key} value={key}>{config.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs text-foreground-muted mb-1 block">
          Tavoite ({GOAL_TYPES[goalType]?.unit})
        </label>
        <input
          type="number"
          value={targetValue}
          onChange={(e) => setTargetValue(e.target.value)}
          placeholder="esim. 50000"
          min="0"
          step="any"
          className="w-full px-2 py-1.5 text-sm bg-background border border-card-border rounded"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          type="submit"
          size="sm"
          disabled={isSubmitting || !targetValue}
          className="flex-1"
        >
          {isSubmitting ? 'Tallennetaan...' : 'Lisää tavoite'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
        >
          Peruuta
        </Button>
      </div>
    </form>
  )
}

/**
 * MerchantGoalsCard
 */
export function MerchantGoalsCard({ className }) {
  const [isAdding, setIsAdding] = useState(false)
  const {
    goals,
    isLoading,
    error,
    createGoal,
    deactivateGoal,
    refreshProgress,
    isCreating,
    isDeactivating,
    isCalculating,
    canAddGoal
  } = useMerchantGoals()

  const handleCreateGoal = async (goalData) => {
    try {
      await createGoal(goalData)
      setIsAdding(false)
      // Auto-calculate progress after creation
      refreshProgress(null)
    } catch (err) {
      console.error('Failed to create goal:', err)
    }
  }

  if (isLoading) {
    return (
      <div className={cn('rounded-lg border border-card-border bg-background-elevated p-5', className)}>
        <div className="animate-pulse">
          <div className="h-5 w-32 bg-background-subtle rounded mb-4" />
          <div className="space-y-3">
            <div className="h-20 bg-background-subtle rounded" />
            <div className="h-20 bg-background-subtle rounded" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('rounded-lg border border-destructive/30 bg-background-elevated p-5', className)}>
        <p className="text-sm text-destructive">Tavoitteita ei voitu ladata</p>
      </div>
    )
  }

  return (
    <div className={cn('rounded-lg border border-card-border bg-background-elevated p-5', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Tavoitteet</h3>
        </div>
        {canAddGoal && !isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Lisää
          </button>
        )}
      </div>

      {/* Goals list */}
      <div className="space-y-3">
        {goals.length === 0 && !isAdding && (
          <div className="text-center py-4">
            <Target className="w-8 h-8 text-foreground-muted mx-auto mb-2" />
            <p className="text-sm text-foreground-muted">Ei aktiivisia tavoitteita</p>
            <button
              onClick={() => setIsAdding(true)}
              className="text-sm text-primary hover:underline mt-1"
            >
              Lisää ensimmäinen tavoite
            </button>
          </div>
        )}

        {goals.map((goal) => (
          <GoalItem
            key={goal.id}
            goal={goal}
            onDeactivate={deactivateGoal}
            onRefresh={refreshProgress}
            isDeactivating={isDeactivating}
            isCalculating={isCalculating}
          />
        ))}

        {isAdding && (
          <AddGoalForm
            onSubmit={handleCreateGoal}
            onCancel={() => setIsAdding(false)}
            isSubmitting={isCreating}
          />
        )}
      </div>

      {/* Footer info */}
      {goals.length > 0 && (
        <p className="text-xs text-foreground-muted mt-3 pt-3 border-t border-card-border">
          {goals.length}/3 tavoitetta aktiivisena
        </p>
      )}
    </div>
  )
}
