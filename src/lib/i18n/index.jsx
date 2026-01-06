/**
 * i18n - Simple internationalization system for VilkasAnalytics
 *
 * Supports Finnish (fi) and Swedish (sv)
 * Default language: Finnish
 * Language preference stored in localStorage
 */

import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import fi from './translations/fi.json'
import sv from './translations/sv.json'

const translations = { fi, sv }

const STORAGE_KEY = 'vilkas-analytics-language'
const DEFAULT_LANGUAGE = 'fi'

// Language Context
const LanguageContext = createContext(null)

/**
 * Get nested value from object using dot notation
 * e.g., get(obj, 'indicators.types.sales_trend.title')
 */
function get(obj, path, defaultValue = '') {
  const keys = path.split('.')
  let result = obj

  for (const key of keys) {
    if (result === undefined || result === null) {
      return defaultValue
    }
    result = result[key]
  }

  return result !== undefined ? result : defaultValue
}

/**
 * Interpolate variables in translation string
 * e.g., "{{count}} items" with { count: 5 } => "5 items"
 */
function interpolate(str, vars = {}) {
  if (typeof str !== 'string') return str

  return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return vars[key] !== undefined ? vars[key] : match
  })
}

/**
 * LanguageProvider - Wrap your app with this
 */
export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_LANGUAGE
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_LANGUAGE
  })

  // Persist language to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language)
  }, [language])

  // Translation function
  const t = useCallback((key, vars = {}) => {
    const translation = get(translations[language], key)

    // Fallback to other language if key not found
    if (translation === '' || translation === undefined) {
      const fallbackLang = language === 'fi' ? 'sv' : 'fi'
      const fallback = get(translations[fallbackLang], key)
      if (fallback) {
        return interpolate(fallback, vars)
      }
      // Return key if no translation found (for debugging)
      console.warn(`Missing translation: ${key}`)
      return key
    }

    return interpolate(translation, vars)
  }, [language])

  // Set language
  const setLanguage = useCallback((lang) => {
    if (translations[lang]) {
      setLanguageState(lang)
    } else {
      console.warn(`Language not supported: ${lang}`)
    }
  }, [])

  // Toggle between languages
  const toggleLanguage = useCallback(() => {
    setLanguageState(prev => prev === 'fi' ? 'sv' : 'fi')
  }, [])

  // Get locale for number/date formatting
  const locale = language === 'fi' ? 'fi-FI' : 'sv-SE'

  // Format number according to locale
  const formatNumber = useCallback((value, options = {}) => {
    if (value === null || value === undefined) return '—'
    return new Intl.NumberFormat(locale, options).format(value)
  }, [locale])

  // Format currency according to locale
  const formatCurrency = useCallback((value, currency = 'SEK') => {
    if (value === null || value === undefined) return '—'
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0
    }).format(value)
  }, [locale])

  // Format date according to locale
  const formatDate = useCallback((date, options = {}) => {
    if (!date) return '—'
    const d = typeof date === 'string' ? new Date(date) : date
    return new Intl.DateTimeFormat(locale, options).format(d)
  }, [locale])

  // Format percent
  const formatPercent = useCallback((value, decimals = 1) => {
    if (value === null || value === undefined) return '—'
    return `${Number(value).toFixed(decimals)}%`
  }, [])

  const value = {
    language,
    setLanguage,
    toggleLanguage,
    t,
    locale,
    formatNumber,
    formatCurrency,
    formatDate,
    formatPercent,
    isFinish: language === 'fi',
    isSwedish: language === 'sv'
  }

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

/**
 * useTranslation - Hook to access translations
 */
export function useTranslation() {
  const context = useContext(LanguageContext)

  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider')
  }

  return context
}

/**
 * useLocale - Hook for formatting only (no translations)
 */
export function useLocale() {
  const { locale, formatNumber, formatCurrency, formatDate, formatPercent } = useTranslation()
  return { locale, formatNumber, formatCurrency, formatDate, formatPercent }
}

export default LanguageProvider
