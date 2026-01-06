/**
 * AlertItem - Single alert display component
 */

import { AlertTriangle, AlertCircle, Info, Check, X, ExternalLink } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

const SEVERITY_CONFIG = {
  critical: {
    icon: AlertTriangle,
    bgColor: 'bg-red-500/20',
    borderColor: 'border-red-500/50',
    iconColor: 'text-red-400',
    textColor: 'text-red-400'
  },
  warning: {
    icon: AlertCircle,
    bgColor: 'bg-amber-500/20',
    borderColor: 'border-amber-500/50',
    iconColor: 'text-amber-400',
    textColor: 'text-amber-400'
  },
  info: {
    icon: Info,
    bgColor: 'bg-blue-500/20',
    borderColor: 'border-blue-500/50',
    iconColor: 'text-blue-400',
    textColor: 'text-blue-400'
  }
}

export function AlertItem({
  alert,
  onAcknowledge,
  onViewIndicator,
  compact = false
}) {
  const { t, formatDate } = useTranslation()

  const config = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.info
  const Icon = config.icon

  if (compact) {
    return (
      <div className={`flex items-center gap-3 p-3 rounded-lg ${config.bgColor} border ${config.borderColor}`}>
        <Icon className={`w-4 h-4 ${config.iconColor} flex-shrink-0`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">{alert.title}</p>
        </div>
        <span className={`text-xs ${config.textColor}`}>
          {t(`alerts.severity.${alert.severity}`)}
        </span>
      </div>
    )
  }

  return (
    <div className={`rounded-lg ${config.bgColor} border ${config.borderColor} overflow-hidden`}>
      {/* Header */}
      <div className="flex items-start gap-3 p-4">
        <div className={`p-2 rounded-lg ${config.bgColor}`}>
          <Icon className={`w-5 h-5 ${config.iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${config.bgColor} ${config.textColor}`}>
              {t(`alerts.severity.${alert.severity}`)}
            </span>
            <span className="text-xs text-slate-500">
              {formatDate(alert.created_at, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <h4 className="text-white font-medium mb-1">{alert.title}</h4>
          <p className="text-slate-400 text-sm">{alert.message}</p>

          {/* Alert type badge */}
          {alert.alert_type && (
            <span className="inline-block mt-2 text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">
              {t(`alerts.types.${alert.alert_type}`)}
            </span>
          )}

          {/* Threshold info */}
          {alert.threshold_breached && (
            <p className="text-xs text-slate-500 mt-2">
              Threshold: {alert.threshold_breached}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-slate-900/50 border-t border-slate-800">
        {onViewIndicator && alert.indicator_id && (
          <button
            onClick={() => onViewIndicator(alert.indicator_id)}
            className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            {t(`indicators.types.${alert.indicator_id}.title`)}
          </button>
        )}
        {onAcknowledge && !alert.acknowledged && (
          <button
            onClick={() => onAcknowledge(alert.id)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors ml-auto"
          >
            <Check className="w-3 h-3" />
            {t('alerts.acknowledge')}
          </button>
        )}
        {alert.acknowledged && (
          <span className="text-xs text-green-400 ml-auto">
            <Check className="w-3 h-3 inline mr-1" />
            Acknowledged
          </span>
        )}
      </div>
    </div>
  )
}

export default AlertItem
