import { useState, useRef, useEffect } from 'react'
import { Calendar, ChevronDown, Check } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

// Date presets - values only, labels come from translations
const PRESET_VALUES = [
  { value: 'today', days: 0 },
  { value: 'yesterday', days: 1 },
  { value: 'last7', days: 7 },
  { value: 'last14', days: 14 },
  { value: 'last28', days: 28 },
  { value: 'last30', days: 30 },
  { value: 'thisMonth', days: null },
  { value: 'lastMonth', days: null },
  { value: 'last90', days: 90 },
]

function getDateRange(preset) {
  const today = new Date()
  today.setHours(23, 59, 59, 999)

  let startDate, endDate

  switch (preset) {
    case 'today':
      startDate = new Date(today)
      startDate.setHours(0, 0, 0, 0)
      endDate = today
      break

    case 'yesterday':
      endDate = new Date(today)
      endDate.setDate(endDate.getDate() - 1)
      startDate = new Date(endDate)
      startDate.setHours(0, 0, 0, 0)
      endDate.setHours(23, 59, 59, 999)
      break

    case 'thisMonth':
      startDate = new Date(today.getFullYear(), today.getMonth(), 1)
      endDate = today
      break

    case 'lastMonth':
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      endDate = new Date(today.getFullYear(), today.getMonth(), 0)
      endDate.setHours(23, 59, 59, 999)
      break

    default:
      // last7, last14, last28, last30, last90
      const days = parseInt(preset.replace('last', '')) || 7
      endDate = today
      startDate = new Date(today)
      startDate.setDate(startDate.getDate() - days + 1)
      startDate.setHours(0, 0, 0, 0)
  }

  return { startDate, endDate }
}

// Get previous period of same length (MoM comparison)
function getPreviousPeriod(startDate, endDate) {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1

  const prevEnd = new Date(start)
  prevEnd.setDate(prevEnd.getDate() - 1)
  prevEnd.setHours(23, 59, 59, 999)

  const prevStart = new Date(prevEnd)
  prevStart.setDate(prevStart.getDate() - diffDays + 1)
  prevStart.setHours(0, 0, 0, 0)

  return { startDate: prevStart, endDate: prevEnd }
}

// Get same period last year (YoY comparison)
function getYearOverYearPeriod(startDate, endDate) {
  const start = new Date(startDate)
  const end = new Date(endDate)

  const prevStart = new Date(start)
  prevStart.setFullYear(prevStart.getFullYear() - 1)
  prevStart.setHours(0, 0, 0, 0)

  const prevEnd = new Date(end)
  prevEnd.setFullYear(prevEnd.getFullYear() - 1)
  prevEnd.setHours(23, 59, 59, 999)

  return { startDate: prevStart, endDate: prevEnd }
}

function formatDate(date) {
  return date.toLocaleDateString('sv-SE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function formatDateISO(date) {
  // Use local date parts to avoid timezone issues
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function DateRangePicker({ value, onChange, compareEnabled }) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState(value || 'last30')
  const compare = compareEnabled || false // Controlled by parent (Dashboard header)
  const [compareMode, setCompareMode] = useState('mom') // 'mom' = Month over Month, 'yoy' = Year over Year
  const dropdownRef = useRef(null)

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const currentRange = getDateRange(selectedPreset)
  const currentPresetLabel = t(`datePicker.presets.${selectedPreset}`) || t('datePicker.selectPeriod')

  // Get comparison period based on mode
  function getComparisonPeriod(startDate, endDate, mode) {
    if (mode === 'yoy') {
      return getYearOverYearPeriod(startDate, endDate)
    }
    return getPreviousPeriod(startDate, endDate)
  }

  function handleSelect(preset) {
    setSelectedPreset(preset)
    setIsOpen(false)

    const range = getDateRange(preset)
    const prevRange = compare ? getComparisonPeriod(range.startDate, range.endDate, compareMode) : null

    onChange?.({
      preset,
      startDate: formatDateISO(range.startDate),
      endDate: formatDateISO(range.endDate),
      label: t(`datePicker.presets.${preset}`),
      compare,
      compareMode,
      previousStartDate: prevRange ? formatDateISO(prevRange.startDate) : null,
      previousEndDate: prevRange ? formatDateISO(prevRange.endDate) : null
    })
  }

  function handleCompareModeChange(mode) {
    setCompareMode(mode)

    if (compare) {
      // Re-emit with new comparison mode
      const range = getDateRange(selectedPreset)
      const prevRange = getComparisonPeriod(range.startDate, range.endDate, mode)

      onChange?.({
        preset: selectedPreset,
        startDate: formatDateISO(range.startDate),
        endDate: formatDateISO(range.endDate),
        label: t(`datePicker.presets.${selectedPreset}`),
        compare,
        compareMode: mode,
        previousStartDate: formatDateISO(prevRange.startDate),
        previousEndDate: formatDateISO(prevRange.endDate)
      })
    }
  }

  const prevPeriod = compare ? getComparisonPeriod(currentRange.startDate, currentRange.endDate, compareMode) : null

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white hover:bg-slate-700 transition-colors"
      >
        <Calendar className="w-4 h-4 text-slate-400" />
        <span className="text-sm font-medium">{currentPresetLabel}</span>
        <span className="text-xs text-slate-400 hidden sm:inline">
          {formatDate(currentRange.startDate)} – {formatDate(currentRange.endDate)}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown - responsive positioning */}
      {isOpen && (
        <div className="absolute top-full left-0 sm:left-auto sm:right-0 mt-2 w-[calc(100vw-2rem)] sm:w-80 max-w-80 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden">
          {/* Presets list */}
          <div className="p-2 max-h-[60vh] overflow-y-auto">
            <p className="text-xs text-slate-500 uppercase tracking-wider px-2 py-1 mb-1">{t('datePicker.quickSelect')}</p>
            {PRESET_VALUES.map((preset) => {
              const range = getDateRange(preset.value)
              const isSelected = selectedPreset === preset.value

              return (
                <button
                  key={preset.value}
                  onClick={() => handleSelect(preset.value)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-left transition-colors ${
                    isSelected
                      ? 'bg-cyan-500/20 text-cyan-400'
                      : 'text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isSelected && <Check className="w-4 h-4 flex-shrink-0" />}
                    <span className={`text-sm truncate ${isSelected ? '' : 'ml-6'}`}>{t(`datePicker.presets.${preset.value}`)}</span>
                  </div>
                  <span className="text-xs text-slate-500 flex-shrink-0 ml-2">
                    {formatDate(range.startDate).split(' ').slice(0, 2).join(' ')} – {formatDate(range.endDate).split(' ').slice(0, 2).join(' ')}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Comparison mode selector (only shown when compare is enabled via header toggle) */}
          {compare && (
            <div className="border-t border-slate-700 p-3">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">{t('datePicker.comparisonPeriod')}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleCompareModeChange('mom')}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                    compareMode === 'mom'
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                  }`}
                >
                  {t('datePicker.previousPeriod')}
                </button>
                <button
                  onClick={() => handleCompareModeChange('yoy')}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                    compareMode === 'yoy'
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                  }`}
                >
                  {t('datePicker.lastYear')}
                </button>
              </div>

              {prevPeriod && (
                <p className="text-xs text-slate-500 mt-2">
                  vs. {formatDate(prevPeriod.startDate)} – {formatDate(prevPeriod.endDate)}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Export helpers for use in hooks
export { getDateRange, formatDateISO, getPreviousPeriod, getYearOverYearPeriod }
