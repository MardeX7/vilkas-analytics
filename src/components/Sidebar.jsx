import { NavLink } from 'react-router-dom'
import { BarChart3, Search, TrendingUp, Target, Settings, Globe, LogOut, Activity, Warehouse, Users, ChevronsUpDown } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useTranslation } from '@/lib/i18n'
import { useAuth } from '@/contexts/AuthContext'
import { getShopFlag } from '@/config/shopLogos'

export function Sidebar() {
  const { t, language, toggleLanguage } = useTranslation()
  const { user, logout, isAdmin, shops, currentShop, switchShop } = useAuth()
  const [shopMenuOpen, setShopMenuOpen] = useState(false)
  const shopMenuRef = useRef(null)

  // Close shop menu on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (shopMenuRef.current && !shopMenuRef.current.contains(e.target)) {
        setShopMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

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

  const flag = getShopFlag(currentShop?.domain)

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-background-elevated border-r border-card-border flex flex-col z-20">
      {/* Shop Switcher */}
      <div className="p-4 border-b border-card-border" ref={shopMenuRef}>
        <button
          onClick={() => shops.length > 1 && setShopMenuOpen(!shopMenuOpen)}
          className={`w-full flex items-center gap-3 p-2 rounded-xl transition-all duration-200 ${
            shops.length > 1 ? 'hover:bg-background-subtle cursor-pointer' : 'cursor-default'
          }`}
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00b4e9] to-[#0090c0] flex items-center justify-center shadow-lg shadow-[#00b4e9]/20 flex-shrink-0">
            {flag ? <span className="text-xl">{flag}</span> : <BarChart3 className="w-5 h-5 text-white" />}
          </div>
          <div className="flex-1 text-left min-w-0">
            <h1 className="text-sm font-bold text-foreground truncate">
              {currentShop?.shop_name || 'Analytics'}
            </h1>
            <p className="text-foreground-subtle text-xs truncate">
              {currentShop?.domain || 'Agent'}
            </p>
          </div>
          {shops.length > 1 && (
            <ChevronsUpDown className="w-4 h-4 text-foreground-muted flex-shrink-0" />
          )}
        </button>

        {/* Shop dropdown */}
        {shopMenuOpen && shops.length > 1 && (
          <div className="mt-2 bg-background-elevated border border-card-border rounded-xl shadow-lg overflow-hidden">
            {shops.map((shop) => {
              const shopFlag = getShopFlag(shop.domain)
              return (
              <button
                key={shop.shop_id}
                onClick={() => {
                  switchShop(shop.shop_id)
                  setShopMenuOpen(false)
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors text-sm ${
                  currentShop?.shop_id === shop.shop_id
                    ? 'bg-[#00b4e9]/10 text-[#00b4e9]'
                    : 'text-foreground-muted hover:bg-background-subtle hover:text-foreground'
                }`}
              >
                <div className="w-6 h-6 rounded-lg bg-background-subtle flex items-center justify-center flex-shrink-0">
                  {shopFlag ? <span className="text-sm">{shopFlag}</span> : <BarChart3 className="w-3.5 h-3.5" />}
                </div>
                <div className="min-w-0">
                  <p className="font-medium truncate">{shop.shop_name}</p>
                  <p className="text-xs text-foreground-subtle truncate">{shop.domain || shop.currency}</p>
                </div>
              </button>
              )
            })}
          </div>
        )}
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
