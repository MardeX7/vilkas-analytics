import { Card, CardContent } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

export function KPICard({ title, value, change, changeLabel, icon: Icon, currency = '' }) {
  const changeValue = parseFloat(change) || 0
  const isPositive = changeValue > 0
  const isNegative = changeValue < 0

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-400 mb-1">{title}</p>
            <p className="text-2xl font-bold text-white">
              {typeof value === 'number'
                ? value.toLocaleString('sv-SE', { maximumFractionDigits: 0 })
                : value}
              {currency && <span className="text-lg ml-1 text-slate-400">{currency}</span>}
            </p>
            {change !== undefined && (
              <div className="flex items-center mt-2 gap-1">
                {isPositive && <TrendingUp className="w-4 h-4 text-green-400" />}
                {isNegative && <TrendingDown className="w-4 h-4 text-red-400" />}
                {!isPositive && !isNegative && <Minus className="w-4 h-4 text-slate-400" />}
                <span className={`text-sm ${isPositive ? 'text-green-400' : isNegative ? 'text-red-400' : 'text-slate-400'}`}>
                  {isPositive && '+'}{changeValue.toFixed(1)}%
                </span>
                {changeLabel && <span className="text-xs text-slate-500 ml-1">{changeLabel}</span>}
              </div>
            )}
          </div>
          {Icon && (
            <div className="p-3 bg-slate-700/50 rounded-lg">
              <Icon className="w-6 h-6 text-cyan-400" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
