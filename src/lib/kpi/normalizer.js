/**
 * KPI Index Normalizer
 *
 * Normalisoi raaka-arvot 0-100 indeksiksi käyttäen:
 * - 3 kuukauden historiadata
 * - Z-score normalisointi
 * - Mediaani = 50, ±1 SD = 25 pistettä
 */

/**
 * Normalisoi arvo 0-100 asteikolle käyttäen historiadata
 *
 * @param {number} value - Nykyinen arvo
 * @param {number[]} history - Historiadata (vähintään 7 arvoa suositeltava)
 * @param {boolean} higherIsBetter - Onko korkeampi arvo parempi (default: true)
 * @returns {number} Normalisoitu indeksi 0-100
 */
export function normalizeToIndex(value, history = [], higherIsBetter = true) {
  // Jos ei historiaa tai vain yksi arvo, palauta 50
  if (!history || history.length < 2) {
    return 50
  }

  // Suodata pois null/undefined/NaN
  const cleanHistory = history.filter(v => v !== null && v !== undefined && !isNaN(v))
  if (cleanHistory.length < 2) {
    return 50
  }

  // Laske mediaani
  const sorted = [...cleanHistory].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2

  // Laske keskiarvo ja keskihajonta
  const mean = cleanHistory.reduce((a, b) => a + b, 0) / cleanHistory.length
  const variance = cleanHistory.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / cleanHistory.length
  const stdDev = Math.sqrt(variance)

  // Z-score suhteessa mediaaniin
  const zScore = stdDev > 0 ? (value - median) / stdDev : 0

  // Muunna 0-100 asteikolle
  // mediaani = 50, +1 SD = 75, +2 SD = 100, -1 SD = 25, -2 SD = 0
  let index = 50 + (zScore * 25)

  // Käännä jos pienempi on parempi (esim. positio, läpimenoaika)
  if (!higherIsBetter) {
    index = 100 - index + 50
  }

  // Rajaa 0-100
  return Math.max(0, Math.min(100, Math.round(index)))
}

/**
 * Normalisoi prosenttiarvo suoraan 0-100 skaalalle
 *
 * @param {number} percent - Prosenttiarvo (0-100)
 * @param {number} optimalMin - Optimialueen alaraja
 * @param {number} optimalMax - Optimialueen yläraja
 * @returns {number} Indeksi 0-100
 */
export function normalizePercentToIndex(percent, optimalMin = 0, optimalMax = 100) {
  if (percent >= optimalMin && percent <= optimalMax) {
    // Optimialueella = 100
    return 100
  } else if (percent < optimalMin) {
    // Alle optimin: lineaarinen lasku
    return Math.max(0, (percent / optimalMin) * 100)
  } else {
    // Yli optimin: pehmeä lasku
    const excess = percent - optimalMax
    return Math.max(50, 100 - (excess * 1.5))
  }
}

/**
 * Normalisoi trendi-prosentti indeksiksi
 * +20% = 100, 0% = 50, -20% = 0
 *
 * @param {number} trendPercent - Trendimuutos prosentteina
 * @param {number} scale - Skaala (default: 20 = ±20% välillä)
 * @returns {number} Indeksi 0-100
 */
export function normalizeTrendToIndex(trendPercent, scale = 20) {
  const index = 50 + (trendPercent / scale) * 50
  return Math.max(0, Math.min(100, Math.round(index)))
}

/**
 * Normalisoi läpimenoaika indeksiksi
 * 1 päivä = 100, 3 päivää = 50, 7+ päivää = 0
 *
 * @param {number} days - Läpimenoaika päivinä
 * @returns {number} Indeksi 0-100
 */
export function normalizeFulfillmentToIndex(days) {
  if (days <= 1) return 100
  if (days >= 7) return 0

  // Lineaarinen interpolaatio: 1d=100, 7d=0
  return Math.round(100 - ((days - 1) * (100 / 6)))
}

/**
 * Normalisoi hakusijoitus indeksiksi
 * Positio 1 = 100, positio 10 = 50, positio 50+ = 0
 *
 * @param {number} position - Keskimääräinen hakusijoitus
 * @returns {number} Indeksi 0-100
 */
export function normalizePositionToIndex(position) {
  if (position <= 1) return 100
  if (position >= 50) return 0

  // Logaritminen skaala (top 10 tärkeämpi)
  if (position <= 10) {
    return Math.round(100 - ((position - 1) * 5.56)) // 1=100, 10=50
  } else {
    return Math.round(50 - ((position - 10) * 1.25)) // 10=50, 50=0
  }
}

/**
 * Normalisoi non-brand osuus indeksiksi
 * Optimi: 40-70%, alle 40% = heikko SEO, yli 70% = heikko brändi
 *
 * @param {number} nonBrandPercent - Non-brand hakujen osuus (0-100)
 * @returns {number} Indeksi 0-100
 */
export function normalizeNonBrandToIndex(nonBrandPercent) {
  if (nonBrandPercent >= 40 && nonBrandPercent <= 70) {
    return 100
  } else if (nonBrandPercent < 40) {
    // Liian vähän non-brand = heikko SEO
    return Math.round(nonBrandPercent * (100 / 40))
  } else {
    // Liian paljon non-brand = heikko brändi (ei niin paha)
    return Math.max(50, Math.round(100 - ((nonBrandPercent - 70) * 1.5)))
  }
}

/**
 * Normalisoi varaston peittopäivät indeksiksi
 * Optimi: 30-60 päivää
 * Alle 14 = riski (liian vähän), yli 90 = pääomaloukkuu
 *
 * @param {number} stockDays - Varaston peitto päivinä
 * @returns {number} Indeksi 0-100
 */
export function normalizeStockDaysToIndex(stockDays) {
  if (stockDays >= 30 && stockDays <= 60) {
    return 100
  } else if (stockDays < 30) {
    // Liian vähän varastoa
    if (stockDays < 7) return Math.round(stockDays * (30 / 7)) // 0=0, 7=30
    return Math.round(30 + ((stockDays - 7) * (70 / 23))) // 7=30, 30=100
  } else {
    // Liikaa varastoa = pääoma jumissa
    return Math.max(0, Math.round(100 - ((stockDays - 60) * 0.8)))
  }
}

/**
 * Normalisoi out-of-stock prosentti indeksiksi
 * 0% = 100, 5% = 75, 10% = 50, 20% = 0
 *
 * @param {number} outOfStockPercent - Out-of-stock tuotteiden osuus
 * @returns {number} Indeksi 0-100
 */
export function normalizeOutOfStockToIndex(outOfStockPercent) {
  return Math.max(0, Math.min(100, Math.round(100 - (outOfStockPercent * 5))))
}

/**
 * Laske painotettu keskiarvo komponenteista
 *
 * @param {Object} components - Komponentit { name: { index, weight } }
 * @returns {number} Painotettu indeksi 0-100
 */
export function calculateWeightedIndex(components) {
  let totalWeight = 0
  let weightedSum = 0

  for (const [, component] of Object.entries(components)) {
    if (component && typeof component.index === 'number' && typeof component.weight === 'number') {
      weightedSum += component.index * component.weight
      totalWeight += component.weight
    }
  }

  if (totalWeight === 0) return 50

  return Math.round(weightedSum / totalWeight)
}

export default {
  normalizeToIndex,
  normalizePercentToIndex,
  normalizeTrendToIndex,
  normalizeFulfillmentToIndex,
  normalizePositionToIndex,
  normalizeNonBrandToIndex,
  normalizeStockDaysToIndex,
  normalizeOutOfStockToIndex,
  calculateWeightedIndex
}
