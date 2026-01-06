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
  Activity
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false)
  const { t, language, toggleLanguage } = useTranslation()

  const navItems = [
    { to: '/', icon: BarChart3, label: t('nav.dashboard') },
    { to: '/search-console', icon: Search, label: t('nav.searchConsole') },
    { to: '/analytics', icon: Activity, label: 'Google Analytics' },
    { to: '/indicators', icon: Target, label: t('nav.indicators') },
    { to: '/insights', icon: TrendingUp, label: t('nav.insights') },
  ]

  const closeMenu = () => setIsOpen(false)

  return (
    <>
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-slate-900 border-b border-slate-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-white">Vilkas Analytics</h1>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 text-slate-400 hover:text-white transition-colors"
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
        className={`lg:hidden fixed top-0 right-0 z-50 h-full w-72 bg-slate-900 border-l border-slate-800 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Menu Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <span className="text-sm text-slate-400">Menu</span>
          <button
            onClick={closeMenu}
            className="p-2 text-slate-400 hover:text-white transition-colors"
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
        </div>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-800 space-y-2">
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
          <div className="flex items-center gap-3 px-4 py-2 text-slate-500 text-sm">
            <Settings className="w-4 h-4" />
            <span>{t('common.settings')}</span>
          </div>

          {/* Store info */}
          <div className="px-4 pt-2">
            <p className="text-slate-500 text-xs">Billackering.eu</p>
          </div>
        </div>
      </nav>
    </>
  )
}

export default MobileNav
