import { NavLink } from 'react-router-dom'
import { BarChart3, Search, TrendingUp, Target, Settings, Globe, LogOut, Activity } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { useAuth } from '@/contexts/AuthContext'

export function Sidebar() {
  const { t, language, toggleLanguage } = useTranslation()
  const { currentShop, user, logout, isAdmin } = useAuth()

  const navItems = [
    { to: '/', icon: BarChart3, label: t('nav.dashboard') },
    { to: '/search-console', icon: Search, label: t('nav.searchConsole') },
    { to: '/analytics', icon: Activity, label: 'Google Analytics' },
    { to: '/indicators', icon: Target, label: t('nav.indicators') },
    { to: '/insights', icon: TrendingUp, label: t('nav.insights') },
  ]

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-slate-900 border-r border-slate-800 flex flex-col z-20">
      {/* Logo */}
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-bold text-white">Vilkas Analytics</h1>
        <p className="text-slate-500 text-xs mt-1">{currentShop?.shop_name || 'Billackering.eu'}</p>
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
      <div className="p-4 border-t border-slate-800 space-y-2">
        {/* Language Switcher */}
        <button
          onClick={toggleLanguage}
          className="w-full flex items-center justify-between gap-3 px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-sm"
        >
          <div className="flex items-center gap-3">
            <Globe className="w-4 h-4" />
            <span>{t('language.title')}</span>
          </div>
          <span className="text-xs font-medium bg-slate-800 px-2 py-1 rounded">
            {language === 'fi' ? 'FI' : 'SV'}
          </span>
        </button>

        {/* Settings */}
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
              isActive
                ? 'bg-cyan-500/20 text-cyan-400'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`
          }
        >
          <Settings className="w-4 h-4" />
          <span>{t('common.settings')}</span>
          {isAdmin && (
            <span className="ml-auto text-xs bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">
              Admin
            </span>
          )}
        </NavLink>

        {/* User info & Logout */}
        {user && (
          <div className="pt-2 border-t border-slate-800 mt-2">
            <div className="px-4 py-2">
              <p className="text-slate-300 text-sm truncate">{user.email}</p>
              <p className="text-slate-500 text-xs">
                {isAdmin ? t('settings.admin') : t('settings.viewer')}
              </p>
            </div>
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors text-sm"
            >
              <LogOut className="w-4 h-4" />
              <span>{t('auth.logout')}</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
