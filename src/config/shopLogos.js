/**
 * Shop logos mapped by domain
 * Add new entries when onboarding new shops
 */
const SHOP_LOGOS = {
  'automaalit.net': '/automaalit-logo.png',
}

export function getShopLogo(domain) {
  if (!domain) return null
  const cleaned = domain.replace(/^www\./, '').toLowerCase()
  return SHOP_LOGOS[cleaned] || null
}
