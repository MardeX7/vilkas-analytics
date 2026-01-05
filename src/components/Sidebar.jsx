import { NavLink } from 'react-router-dom'
import { BarChart3, Search, TrendingUp, Target, Settings } from 'lucide-react'

const navItems = [
  { to: '/', icon: BarChart3, label: 'Dashboard' },
  { to: '/search-console', icon: Search, label: 'Search Console' },
  { to: '/indicators', icon: Target, label: 'Indikatorer' },
  { to: '/insights', icon: TrendingUp, label: 'Analyysit' },
]

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-slate-900 border-r border-slate-800 flex flex-col z-20">
      {/* Logo */}
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-bold text-white">Vilkas Analytics</h1>
        <p className="text-slate-500 text-xs mt-1">Billackering.eu</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navItems.map(({ to, icon: Icon, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-cyan-500/20 text-cyan-400'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3 px-4 py-2 text-slate-500 text-sm">
          <Settings className="w-4 h-4" />
          <span>Inställningar</span>
        </div>
      </div>
    </aside>
  )
}
