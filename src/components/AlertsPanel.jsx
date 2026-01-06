/**
 * AlertsPanel - Slide-out panel showing all alerts
 */

import { useState } from 'react'
import { X, AlertTriangle, CheckCheck, Bell } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { AlertItem } from './AlertItem'

export function AlertsPanel({
  isOpen,
  onClose,
  alerts = [],
  onAcknowledge,
  onAcknowledgeAll,
  onViewIndicator
}) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState('all') // all, critical, warning, info

  // Filter alerts
  const filteredAlerts = filter === 'all'
    ? alerts
    : alerts.filter(a => a.severity === filter)

  // Count by severity
  const counts = {
    all: alerts.length,
    critical: alerts.filter(a => a.severity === 'critical').length,
    warning: alerts.filter(a => a.severity === 'warning').length,
    info: alerts.filter(a => a.severity === 'info').length
  }

  const unacknowledgedCount = alerts.filter(a => !a.acknowledged).length

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-full sm:w-96 bg-slate-900 border-l border-slate-800 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-semibold text-white">{t('alerts.title')}</h2>
            {unacknowledgedCount > 0 && (
              <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs font-medium rounded-full">
                {unacknowledgedCount}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-1 p-4 border-b border-slate-800 overflow-x-auto">
          {['all', 'critical', 'warning', 'info'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                filter === f
                  ? f === 'critical' ? 'bg-red-500/20 text-red-400' :
                    f === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                    f === 'info' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {f === 'all' ? t('alerts.title') : t(`alerts.severity.${f}`)}
              <span className="ml-1 opacity-60">({counts[f]})</span>
            </button>
          ))}
        </div>

        {/* Acknowledge All button */}
        {unacknowledgedCount > 1 && onAcknowledgeAll && (
          <div className="p-4 border-b border-slate-800">
            <button
              onClick={onAcknowledgeAll}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 hover:text-white rounded-lg transition-colors text-sm"
            >
              <CheckCheck className="w-4 h-4" />
              {t('alerts.acknowledgeAll')} ({unacknowledgedCount})
            </button>
          </div>
        )}

        {/* Alerts List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: 'calc(100vh - 200px)' }}>
          {filteredAlerts.length === 0 ? (
            <div className="text-center py-12">
              <AlertTriangle className="w-12 h-12 text-slate-700 mx-auto mb-4" />
              <p className="text-slate-400">{t('alerts.noAlerts')}</p>
            </div>
          ) : (
            filteredAlerts.map(alert => (
              <AlertItem
                key={alert.id}
                alert={alert}
                onAcknowledge={onAcknowledge}
                onViewIndicator={onViewIndicator}
              />
            ))
          )}
        </div>
      </div>
    </>
  )
}

export default AlertsPanel
