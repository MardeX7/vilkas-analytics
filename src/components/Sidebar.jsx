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
    <aside className="fixed left-0 top-0 h-screen w-64 bg-background-elevated border-r border-border flex flex-col z-20">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-bold text-foreground">Vilkas Analytics</h1>
        <p className="text-foreground-subtle text-xs mt-1">{currentShop?.shop_name || 'Billackering'}</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary-muted text-primary'
                      : 'text-foreground-muted hover:bg-background-subtle hover:text-foreground'
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
      <div className="p-4 border-t border-border space-y-1">
        {/* Language Switcher */}
        <button
          onClick={toggleLanguage}
          className="w-full flex items-center justify-between gap-3 px-4 py-2 text-foreground-muted hover:text-foreground hover:bg-background-subtle rounded-lg transition-colors text-sm"
        >
          <div className="flex items-center gap-3">
            <Globe className="w-4 h-4" />
            <span>{t('language.title')}</span>
          </div>
          <span className="text-xs font-medium bg-background-subtle px-2 py-1 rounded">
            {language === 'fi' ? 'FI' : 'SV'}
          </span>
        </button>

        {/* Settings */}
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
              isActive
                ? 'bg-primary-muted text-primary'
                : 'text-foreground-muted hover:text-foreground hover:bg-background-subtle'
            }`
          }
        >
          <Settings className="w-4 h-4" />
          <span>{t('common.settings')}</span>
          {isAdmin && (
            <span className="ml-auto text-xs bg-primary-muted text-primary px-1.5 py-0.5 rounded">
              Admin
            </span>
          )}
        </NavLink>

        {/* User info & Logout */}
        {user && (
          <div className="pt-2 border-t border-border mt-2">
            <div className="px-4 py-2">
              <p className="text-foreground text-sm truncate">{user.email}</p>
              <p className="text-foreground-subtle text-xs">
                {isAdmin ? t('settings.admin') : t('settings.viewer')}
              </p>
            </div>
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-2 text-foreground-muted hover:text-destructive hover:bg-background-subtle rounded-lg transition-colors text-sm"
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
