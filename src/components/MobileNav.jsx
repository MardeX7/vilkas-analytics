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
  Users
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false)
  const { t, language, toggleLanguage } = useTranslation()

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

  const closeMenu = () => setIsOpen(false)

  return (
    <>
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-background-elevated/95 border-b border-card-border px-4 py-3 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* Logo/Icon */}
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#00b4e9] to-[#0090c0] flex items-center justify-center shadow-lg shadow-[#00b4e9]/20">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            {/* Title */}
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold text-[#00b4e9] tracking-wider uppercase">Billackering.eu</span>
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
        {/* Menu Header */}
        <div className="flex items-center justify-between p-4 border-b border-card-border">
          <span className="text-sm text-foreground-muted">Menu</span>
          <button
            onClick={closeMenu}
            className="p-2 text-foreground-muted hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

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
          {/* Language Switcher */}
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

          {/* Settings */}
          <div className="flex items-center gap-3 px-4 py-2 text-foreground-subtle text-sm">
            <Settings className="w-4 h-4" />
            <span>{t('common.settings')}</span>
          </div>

          {/* Store info */}
          <div className="px-4 pt-2">
            <p className="text-foreground-subtle text-xs">Billackering.eu</p>
          </div>
        </div>
      </nav>
    </>
  )
}

export default MobileNav
