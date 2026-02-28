/**
 * MobileNav - Hamburger menu for mobile navigation
 */

import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Menu,
  X,
  BarChart3,
  Search,
  TrendingUp,
  Target,
  Settings,
  Globe,
  Activity,
  Warehouse,
  Users,
  ChevronsUpDown
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { useAuth } from '@/contexts/AuthContext'
import { getShopFlag } from '@/config/shopLogos'

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false)
  const [shopMenuOpen, setShopMenuOpen] = useState(false)
  const { t, language, toggleLanguage } = useTranslation()
  const { currentShop, shops, switchShop } = useAuth()

  const navItems = [
    { to: '/', icon: Target, label: t('nav.overview') },
    { to: '/insights', icon: TrendingUp, label: t('nav.insights') },
    { to: '/sales', icon: BarChart3, label: t('nav.sales') },
    { to: '/customers', icon: Users, label: t('nav.customers') },
    { to: '/inventory', icon: Warehouse, label: t('nav.inventory') },
    { to: '/search-console', icon: Search, label: t('nav.searchConsole') },
    { to: '/analytics', icon: Activity, label: t('nav.analytics') },
  ]

  const closeMenu = () => {
    setIsOpen(false)
    setShopMenuOpen(false)
  }

  const flag = getShopFlag(currentShop?.domain)

  return (
    <>
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-background-elevated/95 border-b border-card-border px-4 py-3 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#00b4e9] to-[#0090c0] flex items-center justify-center shadow-lg shadow-[#00b4e9]/20">
              {flag ? <span className="text-lg">{flag}</span> : <BarChart3 className="w-4 h-4 text-white" />}
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold text-[#00b4e9] tracking-wider uppercase">{currentShop?.shop_name || 'Analytics'}</span>
              <span className="text-sm font-bold text-foreground -mt-0.5">Analytics Agent</span>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 text-foreground-muted hover:text-[#00b4e9] hover:bg-[#00b4e9]/10 rounded-xl transition-all"
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={closeMenu}
        />
      )}

      {/* Mobile Menu Drawer */}
      <nav
        className={`lg:hidden fixed top-0 right-0 z-50 h-full w-72 bg-background-elevated border-l border-card-border transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Shop Switcher */}
        {shops.length > 1 && (
          <div className="p-4 border-b border-card-border">
            <button
              onClick={() => setShopMenuOpen(!shopMenuOpen)}
              className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-background-subtle transition-all"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#00b4e9] to-[#0090c0] flex items-center justify-center flex-shrink-0">
                {flag ? <span className="text-lg">{flag}</span> : <BarChart3 className="w-4 h-4 text-white" />}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{currentShop?.shop_name || 'Analytics'}</p>
                <p className="text-xs text-foreground-subtle truncate">{currentShop?.domain}</p>
              </div>
              <ChevronsUpDown className="w-4 h-4 text-foreground-muted flex-shrink-0" />
            </button>

            {shopMenuOpen && (
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
                        <p className="text-xs text-foreground-subtle truncate">{shop.domain}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Menu Header (only when no shop switcher) */}
        {shops.length <= 1 && (
          <div className="flex items-center justify-between p-4 border-b border-card-border">
            <span className="text-sm text-foreground-muted">{currentShop?.shop_name || 'Menu'}</span>
            <button
              onClick={closeMenu}
              className="p-2 text-foreground-muted hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Navigation Links */}
        <div className="p-4">
          <ul className="space-y-2">
            {navItems.map(({ to, icon: Icon, label }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={closeMenu}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                      isActive
                        ? 'bg-[#00b4e9]/10 text-[#00b4e9]'
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
        </div>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-card-border space-y-2">
          <button
            onClick={toggleLanguage}
            className="w-full flex items-center justify-between gap-3 px-4 py-2 text-foreground-muted hover:text-foreground hover:bg-background-subtle rounded-xl transition-colors text-sm"
          >
            <div className="flex items-center gap-3">
              <Globe className="w-4 h-4" />
              <span>{t('language.title')}</span>
            </div>
            <span className="text-xs font-medium bg-background-subtle px-2 py-1 rounded-lg">
              {language === 'fi' ? 'FI' : 'SV'}
            </span>
          </button>

          <NavLink
            to="/settings"
            onClick={closeMenu}
            className={({ isActive }) =>
              `w-full flex items-center gap-3 px-4 py-2 rounded-xl transition-colors text-sm ${
                isActive
                  ? 'bg-[#00b4e9]/10 text-[#00b4e9]'
                  : 'text-foreground-muted hover:text-foreground hover:bg-background-subtle'
              }`
            }
          >
            <Settings className="w-4 h-4" />
            <span>{t('common.settings')}</span>
          </NavLink>
        </div>
      </nav>
    </>
  )
}

export default MobileNav
