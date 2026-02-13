import { NavLink } from 'react-router-dom'
import { BarChart3, Search, TrendingUp, Target, Settings, Globe, LogOut, Activity, Warehouse, Users } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { useAuth } from '@/contexts/AuthContext'

export function Sidebar() {
  const { t, language, toggleLanguage } = useTranslation()
  const { user, logout, isAdmin } = useAuth()

  // Navigaatio järjestetty käyttölogiikan mukaan:
  // 1. JOHTAMINEN: Tilannekuva (entry point) + Analyysit (tulkinta)
  // 2. DATA & TODISTEET: Myynti, Hakukoneet, Kävijät
  const navItems = [
    // Johtamisen näkymät
    { to: '/', icon: Target, label: t('nav.overview') },
    { to: '/insights', icon: TrendingUp, label: t('nav.insights') },
    // Data & todisteet
    { to: '/sales', icon: BarChart3, label: t('nav.sales') },
    { to: '/customers', icon: Users, label: t('nav.customers') },
    { to: '/inventory', icon: Warehouse, label: t('nav.inventory') },
    { to: '/search-console', icon: Search, label: t('nav.searchConsole') },
    { to: '/analytics', icon: Activity, label: t('nav.analytics') },
  ]

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-background-elevated border-r border-card-border flex flex-col z-20">
      {/* Logo */}
      <div className="p-6 border-b border-card-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00b4e9] to-[#0090c0] flex items-center justify-center shadow-lg shadow-[#00b4e9]/20">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">Billackering.eu</h1>
            <p className="text-foreground-subtle text-xs">Analytics Agent</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'bg-[#00b4e9]/10 text-[#00b4e9] border-l-2 border-[#00b4e9]'
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
