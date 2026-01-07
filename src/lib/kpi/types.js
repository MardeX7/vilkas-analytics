/**
 * KPI Index Engine - Types & Constants
 *
 * VilkasAnalytics KPI Index System
 * Versio: 1.0
 */

/**
 * @typedef {'week' | 'month'} Granularity
 */

/**
 * @typedef {'core' | 'ppi' | 'spi' | 'oi'} IndexType
 */

/**
 * @typedef {Object} IndexComponent
 * @property {number} value - Raaka-arvo
 * @property {number} index - Normalisoitu indeksi (0-100)
 * @property {number} weight - Painokerroin (0-1)
 */

/**
 * @typedef {Object} KPISnapshot
 * @property {string} id
 * @property {string} store_id
 * @property {string} period_start
 * @property {string} period_end
 * @property {Granularity} granularity
 * @property {number} core_index
 * @property {number} product_profitability_index
 * @property {number} seo_performance_index
 * @property {number} operational_index
 * @property {number} overall_index
 * @property {number} core_index_delta
 * @property {number} ppi_delta
 * @property {number} spi_delta
 * @property {number} oi_delta
 * @property {number} overall_delta
 * @property {Object} core_components
 * @property {Object} spi_components
 * @property {Object} oi_components
 * @property {string[]} alerts
 * @property {string} created_at
 */

/**
 * @typedef {Object} AIContext
 * @property {string} period
 * @property {Granularity} granularity
 * @property {Object} indexes
 * @property {Object} deltas
 * @property {string[]} alerts
 * @property {Object[]} top_profit_drivers
 * @property {Object[]} capital_traps
 * @property {string} generated_at
 */

/**
 * Indeksien painotukset kokonaisindeksiin
 */
export const INDEX_WEIGHTS = {
  core: 0.35,
  ppi: 0.25,
  spi: 0.20,
  oi: 0.20
}

/**
 * Core Index -komponenttien painotukset
 */
export const CORE_INDEX_WEIGHTS = {
  gross_profit: 0.30,
  aov: 0.20,
  repeat_rate: 0.20,
  revenue_trend: 0.20,
  stock_availability: 0.10
}

/**
 * Product Profitability Index -komponenttien painotukset
 */
export const PPI_WEIGHTS = {
  margin: 0.30,
  sales: 0.40,
  stock_efficiency: 0.30
}

/**
 * SEO Performance Index -komponenttien painotukset
 */
export const SPI_WEIGHTS = {
  clicks_trend: 0.30,
  position: 0.30,
  nonbrand: 0.25,
  rising_queries: 0.15
}

/**
 * Operational Index -komponenttien painotukset
 */
export const OI_WEIGHTS = {
  fulfillment: 0.40,
  stock_availability: 0.35,
  seasonal_stability: 0.25
}

/**
 * Hälytysrajat
 */
export const ALERT_THRESHOLDS = {
  index_warning: 40,        // Indeksi alle 40 = varoitus
  index_critical: 25,       // Indeksi alle 25 = kriittinen
  delta_warning: -10,       // Lasku yli 10 pistettä = varoitus
  delta_critical: -20,      // Lasku yli 20 pistettä = kriittinen
  out_of_stock_warning: 10, // Yli 10% tuotteista loppu = varoitus
  out_of_stock_critical: 20 // Yli 20% tuotteista loppu = kriittinen
}

/**
 * Indeksin tulkinta-asteikko
 */
export const INDEX_INTERPRETATION = {
  excellent: { min: 80, label: 'Erinomainen', color: 'emerald' },
  good: { min: 60, label: 'Hyvä', color: 'green' },
  fair: { min: 40, label: 'Kohtalainen', color: 'amber' },
  poor: { min: 20, label: 'Heikko', color: 'orange' },
  critical: { min: 0, label: 'Kriittinen', color: 'red' }
}

/**
 * Palauttaa indeksin tulkinnan
 * @param {number} index
 * @returns {{ label: string, color: string, level: string }}
 */
export function getIndexInterpretation(index) {
  if (index >= 80) return { ...INDEX_INTERPRETATION.excellent, level: 'excellent' }
  if (index >= 60) return { ...INDEX_INTERPRETATION.good, level: 'good' }
  if (index >= 40) return { ...INDEX_INTERPRETATION.fair, level: 'fair' }
  if (index >= 20) return { ...INDEX_INTERPRETATION.poor, level: 'poor' }
  return { ...INDEX_INTERPRETATION.critical, level: 'critical' }
}

/**
 * Indeksien nimet ja kuvaukset (suomeksi)
 */
export const INDEX_INFO = {
  overall: {
    name: 'Kokonaisindeksi',
    shortName: 'Overall',
    description: 'Kaupan kokonaissuorituskyky'
  },
  core: {
    name: 'Liiketoiminnan terveys',
    shortName: 'Core',
    description: 'Myynti, kate, asiakkaat, varasto'
  },
  ppi: {
    name: 'Tuotekannattavuus',
    shortName: 'PPI',
    description: 'SKU-tason kannattavuus ja tehokkuus'
  },
  spi: {
    name: 'SEO-suorituskyky',
    shortName: 'SPI',
    description: 'Hakukonenäkyvyys ja trendit'
  },
  oi: {
    name: 'Operatiivinen tehokkuus',
    shortName: 'OI',
    description: 'Toimitus, varasto, prosessit'
  }
}

/**
 * Komponenttien nimet ja kuvaukset
 */
export const COMPONENT_INFO = {
  gross_profit: {
    name: 'Katetuotto',
    description: 'Myynti - ostohinta',
    unit: 'SEK'
  },
  aov: {
    name: 'Keskiostos',
    description: 'Keskimääräinen tilauksen arvo',
    unit: 'SEK'
  },
  repeat_rate: {
    name: 'Palaavat asiakkaat',
    description: 'Asiakkaat jotka ostaneet >1 kertaa',
    unit: '%'
  },
  revenue_trend: {
    name: 'Myynnin trendi',
    description: 'Muutos edellisestä jaksosta',
    unit: '%'
  },
  stock_availability: {
    name: 'Varaston saatavuus',
    description: '100% - out-of-stock %',
    unit: '%'
  },
  clicks_trend: {
    name: 'Klikkitrendi',
    description: 'GSC-klikkien muutos',
    unit: '%'
  },
  position: {
    name: 'Hakusijoitus',
    description: 'Keskimääräinen Google-positio',
    unit: 'pos'
  },
  nonbrand: {
    name: 'Non-brand osuus',
    description: 'Geneeristen hakujen osuus',
    unit: '%'
  },
  rising_queries: {
    name: 'Nousevat haut',
    description: 'Hakuja joissa kasvupotentiaalia',
    unit: 'kpl'
  },
  fulfillment: {
    name: 'Toimitusaika',
    description: 'Tilaus → toimitus päivinä',
    unit: 'pv'
  },
  seasonal_stability: {
    name: 'Sesonkivakaus',
    description: 'Poikkeama odotuksesta',
    unit: '%'
  }
}

export default {
  INDEX_WEIGHTS,
  CORE_INDEX_WEIGHTS,
  PPI_WEIGHTS,
  SPI_WEIGHTS,
  OI_WEIGHTS,
  ALERT_THRESHOLDS,
  INDEX_INTERPRETATION,
  INDEX_INFO,
  COMPONENT_INFO,
  getIndexInterpretation
}
