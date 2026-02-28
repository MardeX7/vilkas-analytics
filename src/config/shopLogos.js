/**
 * Shop branding mapped by domain
 * Add new entries when onboarding new shops
 */
const SHOP_CONFIG = {
  'automaalit.net': { flag: '🇫🇮', logo: '/automaalit-logo.png' },
  'billackering.eu': { flag: '🇸🇪', logo: null },
}

export function getShopFlag(domain) {
  if (!domain) return null
  const cleaned = domain.replace(/^www\./, '').toLowerCase()
  return SHOP_CONFIG[cleaned]?.flag || null
}

export function getShopLogo(domain) {
  if (!domain) return null
  const cleaned = domain.replace(/^www\./, '').toLowerCase()
  return SHOP_CONFIG[cleaned]?.logo || null
}
