import { useState, useRef, useEffect } from 'react'
import { Calendar, ChevronDown, Check } from 'lucide-react'

// Date presets like Google Analytics
const PRESETS = [
  { label: 'Idag', value: 'today', days: 0 },
  { label: 'Igår', value: 'yesterday', days: 1 },
  { label: 'Senaste 7 dagarna', value: 'last7', days: 7 },
  { label: 'Senaste 14 dagarna', value: 'last14', days: 14 },
  { label: 'Senaste 28 dagarna', value: 'last28', days: 28 },
  { label: 'Senaste 30 dagarna', value: 'last30', days: 30 },
  { label: 'Denna månad', value: 'thisMonth', days: null },
  { label: 'Förra månaden', value: 'lastMonth', days: null },
  { label: 'Senaste 90 dagarna', value: 'last90', days: 90 },
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

function formatDate(date) {
  return date.toLocaleDateString('sv-SE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function formatDateISO(date) {
  return date.toISOString().split('T')[0]
}

export function DateRangePicker({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState(value || 'last30')
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
  const currentPresetLabel = PRESETS.find(p => p.value === selectedPreset)?.label || 'Välj period'

  function handleSelect(preset) {
    setSelectedPreset(preset)
    setIsOpen(false)

    const range = getDateRange(preset)
    onChange?.({
      preset,
      startDate: formatDateISO(range.startDate),
      endDate: formatDateISO(range.endDate),
      label: PRESETS.find(p => p.value === preset)?.label
    })
  }

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

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden">
          {/* Presets list */}
          <div className="p-2">
            <p className="text-xs text-slate-500 uppercase tracking-wider px-2 py-1 mb-1">Snabbval</p>
            {PRESETS.map((preset) => {
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
                  <div className="flex items-center gap-2">
                    {isSelected && <Check className="w-4 h-4" />}
                    <span className={`text-sm ${isSelected ? '' : 'ml-6'}`}>{preset.label}</span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {formatDate(range.startDate).split(' ').slice(0, 2).join(' ')} – {formatDate(range.endDate).split(' ').slice(0, 2).join(' ')}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Comparison toggle (like GA) */}
          <div className="border-t border-slate-700 p-3">
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-0"
                disabled
              />
              <span>Jämför med föregående period</span>
              <span className="text-xs text-slate-600">(kommer snart)</span>
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

// Export helper for use in hooks
export { getDateRange, formatDateISO }
