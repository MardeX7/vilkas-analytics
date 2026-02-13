# VilkasAnalytics - Indikaattorijärjestelmä

> **⚠️ HUOM: Tämä dokumentti on OSITTAIN VANHENTUNUT (2026-01-26)**
>
> Alkuperäinen 7 MVP -indikaattorin suunnitelma korvattiin **Growth Engine** -toteutuksella.
>
> **Nykyinen toteutus:**
> - `src/hooks/useGrowthEngine.js` - 4 KPI-aluetta, 13 metriikkaa
> - YoY-pohjainen pisteytys (0-100)
> - Katso: `docs/INTEGRATIONS.md` → "Growth Engine" -osio
>
> **Validia edelleen:** Data Mastership -periaate (ePages = master, GA4 = behavioral)

## Tekninen spesifikaatio v1.1 (ARKISTOITU)

---

## 1. Yleiskuvaus

### 1.1 Data Mastership -periaate

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     DATA MASTERSHIP HIERARCHY                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    ePages API = MASTER                          │   │
│  │                                                                  │   │
│  │  ✓ Tilaukset (€, kpl)         100% luotettava                   │   │
│  │  ✓ Tuotteet                   100% luotettava                   │   │
│  │  ✓ Asiakkaat                  100% luotettava                   │   │
│  │  ✓ Liikevaihto                100% luotettava                   │   │
│  │                                                                  │   │
│  │  → Kaikki rahalliset metriikat tulevat AINA täältä              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │              Google Search Console = ENRICHMENT                  │   │
│  │                                                                  │   │
│  │  ✓ Hakusanat                  ~100% (Googlen oma data)          │   │
│  │  ✓ Impressiot                 ~100%                             │   │
│  │  ✓ Klikkaukset                ~100%                             │   │
│  │  ✓ Positiot                   ~100%                             │   │
│  │                                                                  │   │
│  │  → SEO-metriikat, orgaaninen näkyvyys                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │              Google Analytics 4 = BEHAVIORAL ENRICHMENT          │   │
│  │                                                                  │   │
│  │  ⚠ Sessiot                    60-80% (consent, blockers)        │   │
│  │  ⚠ Traffic lähteet            60-80%                            │   │
│  │  ⚠ Käyttäytyminen             60-80%                            │   │
│  │  ✗ Transaktiot                EI KÄYTETÄ - epäluotettava        │   │
│  │  ✗ Revenue                    EI KÄYTETÄ - epäluotettava        │   │
│  │                                                                  │   │
│  │  → Käyttäytymisdata, funnel, traffic lähteet (suhteelliset)     │   │
│  │  → AINA esitetään suhteellisina (%, ratio) ei absoluuttisina    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**KRIITTINEN SÄÄNTÖ:** GA4:n ecommerce-dataa (transactions, revenue) EI koskaan käytetä. 
Syyt:
- Cookie consent → 20-40% käyttäjistä puuttuu
- Ad blockerit → lisää katoa
- iOS App Tracking Transparency
- GDPR/ePrivacy compliance

GA4:stä käytetään VAIN:
- Suhteellisia jakaumia (esim. "60% liikenteestä tulee orgaanisesta hausta")
- Käyttäytymismetriikoita (bounce rate, session duration)
- Funnel-suhteita (esim. "30% product view → add to cart")
- Traffic source -jakaumia

### 1.3 Arkkitehtuuri

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          DATA LAYER                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│  │  ePages API     │  │  Google Search  │  │  GA4 API        │         │
│  │  [MASTER]       │  │  Console API    │  │  [BEHAVIORAL]   │         │
│  │                 │  │  [SEO]          │  │                 │         │
│  │ • Tilaukset €   │  │ • Queries       │  │ • Sessions      │         │
│  │ • Tuotteet      │  │ • Clicks        │  │ • Traffic src   │         │
│  │ • Asiakkaat     │  │ • Position      │  │ • Bounce rate   │         │
│  │ • Revenue       │  │ • CTR           │  │ • Funnel %      │         │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘         │
└───────────┼────────────────────┼────────────────────┼───────────────────┘
            │                    │                    │
            ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       INDICATOR ENGINE                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Indicator Calculator                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────┐ │   │
│  │  │   Sales     │  │    SEO      │  │  Traffic    │  │Combined │ │   │
│  │  │ Indicators  │  │ Indicators  │  │ Indicators  │  │         │ │   │
│  │  │ [ePages]    │  │ [GSC]       │  │ [GA4]       │  │ [ALL]   │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────┘ │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                │                                        │
│                                ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │              Indicator Store (Supabase)                          │   │
│  │              - Lasketut indikaattorit                           │   │
│  │              - Historiadata vertailuun                          │   │
│  │              - Alertit ja kynnysarvot                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         AI ANALYSIS LAYER                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Claude API                                    │   │
│  │  - Vastaanottaa indikaattorit JSON-muodossa                     │   │
│  │  - Kontekstualisoi kaupan tilanteeseen                          │   │
│  │  - Generoi toimenpidesuositukset                                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       PRESENTATION LAYER                                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│  │   Dashboard     │  │   Alerts        │  │   Reports       │         │
│  │   (Real-time)   │  │   (Email/Push)  │  │   (PDF/Email)   │         │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Periaatteet

1. **Raakadata → Indikaattorit → AI → Toimenpiteet**
   - AI ei koskaan näe raakadataa suoraan
   - Indikaattorit ovat esiprosessoituja, normalisoituja signaaleja
   - Jokainen indikaattori sisältää kontekstin ja luotettavuustason

2. **Aikaikkunat**
   - Lyhyt (7d): Operatiivinen reagointi
   - Keskipitkä (30d): Trendien tunnistus
   - Pitkä (90d): Strategiset muutokset

3. **Kynnysarvot ja alertit**
   - Jokainen indikaattori määrittelee omat kynnysarvonsa
   - Alertit generoituvat automaattisesti kun kynnys ylittyy

---

## 2. Indikaattorityypit

### 2.1 Base Indicator Interface

```typescript
interface BaseIndicator {
  id: string;                          // Uniikki tunniste
  name: string;                        // Ihmisluettava nimi
  category: IndicatorCategory;         // Kategoria
  
  value: number | string | boolean;    // Indikaattorin arvo
  unit: string;                        // Yksikkö (%, €, kpl, etc.)
  
  direction: 'up' | 'down' | 'stable'; // Trendin suunta
  change_percent: number | null;       // Muutos-%
  change_absolute: number | null;      // Absoluuttinen muutos
  
  period: IndicatorPeriod;             // Aikaikkuna
  comparison_period: IndicatorPeriod;  // Vertailujakso
  
  confidence: ConfidenceLevel;         // Luotettavuus
  priority: PriorityLevel;             // Prioriteetti
  
  thresholds: IndicatorThresholds;     // Kynnysarvot
  alert_triggered: boolean;            // Onko alert aktiivinen
  
  context: IndicatorContext;           // Lisäkonteksti
  
  calculated_at: string;               // ISO timestamp
  data_freshness: string;              // Datan tuoreus
}

type IndicatorCategory = 
  | 'sales'           // Myynti-indikaattorit
  | 'seo'             // SEO-indikaattorit
  | 'combined'        // Yhdistetyt indikaattorit
  | 'customer'        // Asiakasindikaattorit
  | 'product'         // Tuoteindikaattorit
  | 'operational';    // Operatiiviset indikaattorit

interface IndicatorPeriod {
  start: string;      // ISO date
  end: string;        // ISO date
  days: number;       // Päivien määrä
  label: '7d' | '30d' | '90d' | 'custom';
}

type ConfidenceLevel = 'high' | 'medium' | 'low';
type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';

interface IndicatorThresholds {
  critical_high?: number;
  warning_high?: number;
  normal_low?: number;
  normal_high?: number;
  warning_low?: number;
  critical_low?: number;
}

interface IndicatorContext {
  seasonal_adjusted: boolean;
  seasonal_factor?: number;
  anomaly_detected: boolean;
  anomaly_type?: 'spike' | 'drop' | 'trend_break';
  related_indicators?: string[];      // Linkitetyt indikaattorit
  previous_values?: number[];         // Historia
  benchmark?: number;                 // Toimialan keskiarvo (jos saatavilla)
  notes?: string;                     // Lisähuomiot
}
```

---

## 3. Myynti-indikaattorit (Sales Indicators)

### 3.1 Sales Trend Indicator

```typescript
interface SalesTrendIndicator extends BaseIndicator {
  category: 'sales';
  id: 'sales_trend';
  
  value: 'growing' | 'declining' | 'stable';
  
  metrics: {
    current_revenue: number;
    previous_revenue: number;
    change_percent: number;
    
    current_orders: number;
    previous_orders: number;
    orders_change_percent: number;
    
    daily_average: number;
    daily_stddev: number;
  };
  
  seasonal: {
    adjusted: boolean;
    factor: number;                    // 1.0 = normaali, 1.2 = +20% sesonki
    yoy_comparison: number | null;     // vs. sama aika viime vuonna
  };
}
```

**Laskentalogiikka:**

```typescript
function calculateSalesTrend(
  orders: Order[],
  period: IndicatorPeriod,
  comparisonPeriod: IndicatorPeriod,
  seasonalData?: SeasonalData
): SalesTrendIndicator {
  
  // Laske perusmetriikat
  const currentRevenue = sumRevenue(orders, period);
  const previousRevenue = sumRevenue(orders, comparisonPeriod);
  const changePercent = ((currentRevenue - previousRevenue) / previousRevenue) * 100;
  
  // Sesonkikorjaus
  let seasonalFactor = 1.0;
  if (seasonalData) {
    seasonalFactor = getSeasonalFactor(period, seasonalData);
  }
  const adjustedChange = changePercent / seasonalFactor;
  
  // Määritä trendi
  let trend: 'growing' | 'declining' | 'stable';
  if (adjustedChange > 5) trend = 'growing';
  else if (adjustedChange < -5) trend = 'declining';
  else trend = 'stable';
  
  // Määritä prioriteetti
  let priority: PriorityLevel;
  if (Math.abs(adjustedChange) > 20) priority = 'critical';
  else if (Math.abs(adjustedChange) > 10) priority = 'high';
  else if (Math.abs(adjustedChange) > 5) priority = 'medium';
  else priority = 'low';
  
  // Confidence perustuu datan määrään
  const orderCount = orders.filter(o => isInPeriod(o, period)).length;
  let confidence: ConfidenceLevel;
  if (orderCount >= 30) confidence = 'high';
  else if (orderCount >= 10) confidence = 'medium';
  else confidence = 'low';
  
  return {
    id: 'sales_trend',
    name: 'Myyntitrendi',
    category: 'sales',
    value: trend,
    unit: '',
    direction: adjustedChange > 0 ? 'up' : adjustedChange < 0 ? 'down' : 'stable',
    change_percent: adjustedChange,
    change_absolute: currentRevenue - previousRevenue,
    period,
    comparison_period: comparisonPeriod,
    confidence,
    priority,
    thresholds: {
      critical_high: 30,
      warning_high: 15,
      warning_low: -15,
      critical_low: -30
    },
    alert_triggered: Math.abs(adjustedChange) > 15,
    context: {
      seasonal_adjusted: seasonalData !== undefined,
      seasonal_factor: seasonalFactor,
      anomaly_detected: Math.abs(adjustedChange) > 30,
      anomaly_type: adjustedChange > 30 ? 'spike' : adjustedChange < -30 ? 'drop' : undefined
    },
    metrics: {
      current_revenue: currentRevenue,
      previous_revenue: previousRevenue,
      change_percent: changePercent,
      current_orders: orderCount,
      previous_orders: orders.filter(o => isInPeriod(o, comparisonPeriod)).length,
      orders_change_percent: 0, // Laske erikseen
      daily_average: currentRevenue / period.days,
      daily_stddev: calculateStdDev(orders, period)
    },
    seasonal: {
      adjusted: seasonalData !== undefined,
      factor: seasonalFactor,
      yoy_comparison: null // Laske jos dataa
    },
    calculated_at: new Date().toISOString(),
    data_freshness: getDataFreshness(orders)
  };
}
```

### 3.2 Average Order Value (AOV) Indicator

```typescript
interface AOVIndicator extends BaseIndicator {
  category: 'sales';
  id: 'aov';
  
  value: number;  // Keskitilauksen arvo euroissa
  
  metrics: {
    current_aov: number;
    previous_aov: number;
    median_order_value: number;
    min_order: number;
    max_order: number;
    order_value_distribution: {
      bucket: string;        // "0-50€", "50-100€", etc.
      count: number;
      percentage: number;
    }[];
  };
}
```

**Kynnysarvot:**

| Taso | Muutos | Toimenpide |
|------|--------|------------|
| Critical | < -15% | Välitön analyysi |
| Warning | < -10% | Seuranta |
| Normal | -10% to +10% | OK |
| Positive | > +10% | Selvitä syy (toistettavuus?) |

### 3.3 Revenue Concentration Indicator

```typescript
interface RevenueConcentrationIndicator extends BaseIndicator {
  category: 'sales';
  id: 'revenue_concentration';
  
  value: number;  // Top 10 tuotteen osuus (0-1)
  
  metrics: {
    top10_share: number;
    top20_share: number;
    herfindahl_index: number;  // Keskittymisindeksi
    
    top_products: {
      product_id: string;
      name: string;
      revenue: number;
      share: number;
      trend: 'up' | 'down' | 'stable';
    }[];
  };
  
  risk_assessment: {
    level: 'low' | 'medium' | 'high';
    vulnerable_revenue: number;  // € joka riippuu top tuotteista
    recommendation: string;
  };
}
```

### 3.4 Customer Indicators

```typescript
interface NewVsReturningIndicator extends BaseIndicator {
  category: 'customer';
  id: 'new_vs_returning';
  
  value: number;  // Uusien asiakkaiden osuus (0-1)
  
  metrics: {
    new_customers: number;
    returning_customers: number;
    new_customer_revenue: number;
    returning_customer_revenue: number;
    new_customer_aov: number;
    returning_customer_aov: number;
  };
  
  health: {
    // Terve bisnes tarvitsee molempia
    balance_score: number;  // 0-100, 50 = tasapaino
    trend: 'more_new' | 'more_returning' | 'balanced';
  };
}

interface CustomerLifetimeIndicator extends BaseIndicator {
  category: 'customer';
  id: 'customer_lifetime';
  
  value: number;  // Arvioitu CLV euroissa
  
  metrics: {
    average_clv: number;
    median_clv: number;
    clv_by_cohort: {
      cohort: string;        // "2024-Q1", "2024-Q2"
      customer_count: number;
      average_clv: number;
      retention_rate: number;
    }[];
  };
}
```

### 3.5 Organic Conversion Rate Indicator

**KRIITTINEN MVP-indikaattori** - Palautteen perusteella lisätty v1.1.

```typescript
interface OrganicConversionRateIndicator extends BaseIndicator {
  category: 'combined';
  id: 'organic_conversion_rate';
  
  // Orgaanisen liikenteen konversioprosentti
  value: number;  // Kokonais-CR (orders / gsc_clicks)
  
  // Sivutyypeittäin (product, category, landing, blog)
  by_page_type: {
    page_type: 'product' | 'category' | 'landing' | 'blog' | 'other';
    
    clicks: number;              // GSC clicks
    attributed_orders: number;   // ePages orders (attribuutioikkunassa)
    conversion_rate: number;     // %
    
    // Trendi
    cr_change_7d: number;        // Muutos 7pv
    cr_change_30d: number;       // Muutos 30pv
    trend: 'improving' | 'stable' | 'declining';
    
    // Benchmark
    vs_site_average: number;     // % ero sivuston keskiarvosta
  }[];
  
  // Top tuottavat vs. huonoiten konvertoivat sivut
  top_converting: {
    page: string;
    clicks: number;
    orders: number;
    cr: number;
    revenue: number;
  }[];
  
  worst_converting: {
    page: string;
    clicks: number;
    orders: number;
    cr: number;
    lost_potential: number;  // € jos CR olisi keskitasoa
  }[];
  
  // Alertit
  alerts: {
    type: 'traffic_up_cr_down' | 'high_traffic_zero_sales' | 'cr_dropping';
    severity: 'critical' | 'warning';
    page: string;
    details: string;
  }[];
}
```

**Laskentalogiikka:**

```typescript
function calculateOrganicConversionRate(
  gscData: GSCData[],
  orders: Order[],
  products: Product[]
): OrganicConversionRateIndicator {
  
  // 1. Aggregoi GSC klikkaukset sivutyypeittäin
  const pageTypeClicks = new Map<string, number>();
  const pageClicks = new Map<string, number>();
  
  for (const row of gscData) {
    const pageType = classifyPageType(row.page);
    pageTypeClicks.set(pageType, (pageTypeClicks.get(pageType) || 0) + row.clicks);
    pageClicks.set(row.page, (pageClicks.get(row.page) || 0) + row.clicks);
  }
  
  // 2. Attribuoi tilaukset sivuille
  const pageOrders = attributeOrdersToPages(orders, products, gscData);
  
  // 3. Laske CR sivutyypeittäin
  const byPageType = ['product', 'category', 'landing', 'blog', 'other'].map(type => {
    const clicks = pageTypeClicks.get(type) || 0;
    const ordersCount = pageOrders
      .filter(p => classifyPageType(p.page) === type)
      .reduce((sum, p) => sum + p.orders, 0);
    
    return {
      page_type: type as any,
      clicks,
      attributed_orders: ordersCount,
      conversion_rate: clicks > 0 ? (ordersCount / clicks) * 100 : 0,
      cr_change_7d: 0,
      cr_change_30d: 0,
      trend: 'stable' as const,
      vs_site_average: 0
    };
  });
  
  // 4. Tunnista "Dead Traffic" - paljon klikkejä, 0 myyntiä
  const alerts: any[] = [];
  for (const [page, clicks] of pageClicks) {
    const pageOrderData = pageOrders.find(p => p.page === page);
    const ordersForPage = pageOrderData?.orders || 0;
    
    if (clicks > 50 && ordersForPage === 0) {
      alerts.push({
        type: 'high_traffic_zero_sales',
        severity: 'warning',
        page,
        details: `Sivu saa ${clicks} klikkausta mutta 0€ myyntiä. Tarkista hinta, tuotekuvat tai sisältö.`
      });
    }
  }
  
  // 5. Kokonais-CR
  const totalClicks = Array.from(pageClicks.values()).reduce((a, b) => a + b, 0);
  const totalOrders = pageOrders.reduce((sum, p) => sum + p.orders, 0);
  const overallCR = totalClicks > 0 ? (totalOrders / totalClicks) * 100 : 0;
  
  return {
    id: 'organic_conversion_rate',
    name: 'Orgaaninen konversioaste',
    category: 'combined',
    value: overallCR,
    unit: '%',
    by_page_type: byPageType,
    top_converting: getTopConverting(pageClicks, pageOrders, 5),
    worst_converting: getWorstConverting(pageClicks, pageOrders, 5, overallCR),
    alerts
    // ... rest of BaseIndicator fields
  };
}

function classifyPageType(url: string): string {
  if (url.includes('/product/') || url.includes('/tuote/')) return 'product';
  if (url.includes('/category/') || url.includes('/kategoria/')) return 'category';
  if (url.includes('/blog/') || url.includes('/blogi/')) return 'blog';
  if (url === '/' || url.includes('/landing/')) return 'landing';
  return 'other';
}
```

### 3.6 Stock Availability Risk Indicator

**KRIITTINEN MVP-indikaattori** - SEO ilman varastotietoa on vaarallinen.

```typescript
interface StockAvailabilityRiskIndicator extends BaseIndicator {
  category: 'combined';
  id: 'stock_availability_risk';
  
  // Riskitaso (kuinka paljon SEO-liikevaihtoa on vaarassa)
  value: number;  // € at risk
  
  // Tuotteet joilla SEO-liikennettä mutta varastoriski
  at_risk_products: {
    product_id: string;
    product_name: string;
    sku: string;
    
    // Varastotilanne (ePages)
    stock_level: number;
    stock_status: 'out_of_stock' | 'low_stock' | 'ok';
    days_until_stockout: number | null;
    
    // SEO-arvo (GSC + ePages)
    organic_clicks_30d: number;
    organic_revenue_30d: number;
    revenue_per_click: number;
    
    // Riski
    revenue_at_risk: number;
    risk_severity: 'critical' | 'high' | 'medium';
  }[];
  
  // Yhteenveto
  summary: {
    products_out_of_stock: number;
    products_low_stock: number;
    total_revenue_at_risk: number;
    
    top_risks: {
      product: string;
      revenue_at_risk: number;
      action: string;
    }[];
  };
  
  // Alertit
  alerts: {
    type: 'out_of_stock_high_seo' | 'running_low_high_seo' | 'stockout_imminent';
    severity: 'critical' | 'warning';
    product: string;
    details: string;
  }[];
}
```

**Laskentalogiikka:**

```typescript
function calculateStockAvailabilityRisk(
  products: Product[],
  orders: Order[],
  gscData: GSCData[]
): StockAvailabilityRiskIndicator {
  
  const atRiskProducts: any[] = [];
  const alerts: any[] = [];
  
  // 1. Laske jokaisen tuotteen SEO-arvo
  const productSEOValue = calculateProductSEOValue(products, orders, gscData);
  
  // 2. Yhdistä varastotietoihin
  for (const product of products) {
    const seoValue = productSEOValue.get(product.epages_product_id);
    if (!seoValue || seoValue.clicks < 10) continue;
    
    const stockLevel = product.stock_level || 0;
    const stockStatus = getStockStatus(stockLevel, product);
    
    // Laske päivät loppumiseen
    const dailySalesRate = calculateDailySalesRate(product.epages_product_id, orders, 30);
    const daysUntilStockout = dailySalesRate > 0 
      ? Math.floor(stockLevel / dailySalesRate) 
      : null;
    
    // Jos SEO-arvo korkea JA varastoriski
    if (seoValue.revenue > 100 && (stockStatus !== 'ok' || (daysUntilStockout && daysUntilStockout < 14))) {
      
      const riskSeverity = stockStatus === 'out_of_stock' ? 'critical' 
        : (daysUntilStockout && daysUntilStockout < 7) ? 'high' 
        : 'medium';
      
      atRiskProducts.push({
        product_id: product.epages_product_id,
        product_name: product.name,
        sku: product.sku,
        stock_level: stockLevel,
        stock_status: stockStatus,
        days_until_stockout: daysUntilStockout,
        organic_clicks_30d: seoValue.clicks,
        organic_revenue_30d: seoValue.revenue,
        revenue_per_click: seoValue.revenue / seoValue.clicks,
        revenue_at_risk: seoValue.revenue,
        risk_severity: riskSeverity
      });
      
      // Generoi alertit
      if (stockStatus === 'out_of_stock') {
        alerts.push({
          type: 'out_of_stock_high_seo',
          severity: 'critical',
          product: product.name,
          details: `LOPPU VARASTOSTA! Tuote tuottaa ${seoValue.revenue.toFixed(0)}€/kk orgaanisesta hausta.`
        });
      } else if (daysUntilStockout && daysUntilStockout < 7) {
        alerts.push({
          type: 'stockout_imminent',
          severity: 'critical',
          product: product.name,
          details: `Tuote loppuu arviolta ${daysUntilStockout} päivässä. SEO-arvo ${seoValue.revenue.toFixed(0)}€/kk.`
        });
      }
    }
  }
  
  atRiskProducts.sort((a, b) => b.revenue_at_risk - a.revenue_at_risk);
  const totalRevenueAtRisk = atRiskProducts.reduce((sum, p) => sum + p.revenue_at_risk, 0);
  
  return {
    id: 'stock_availability_risk',
    name: 'Varastosaatavuuden SEO-riski',
    category: 'combined',
    value: totalRevenueAtRisk,
    unit: '€',
    priority: totalRevenueAtRisk > 1000 ? 'critical' : totalRevenueAtRisk > 500 ? 'high' : 'medium',
    at_risk_products: atRiskProducts.slice(0, 20),
    summary: {
      products_out_of_stock: atRiskProducts.filter(p => p.stock_status === 'out_of_stock').length,
      products_low_stock: atRiskProducts.filter(p => p.stock_status === 'low_stock').length,
      total_revenue_at_risk: totalRevenueAtRisk,
      top_risks: atRiskProducts.slice(0, 3).map(p => ({
        product: p.product_name,
        revenue_at_risk: p.revenue_at_risk,
        action: p.stock_status === 'out_of_stock' 
          ? 'Täydennä varasto välittömästi'
          : `Tilaa lisää, loppuu ${p.days_until_stockout} päivässä`
      }))
    },
    alerts
    // ... rest of BaseIndicator fields
  };
}

function getStockStatus(level: number, product: Product): 'out_of_stock' | 'low_stock' | 'ok' {
  if (level === 0) return 'out_of_stock';
  const lowThreshold = product.low_stock_threshold || 5;
  if (level <= lowThreshold) return 'low_stock';
  return 'ok';
}
```

### 3.7 Brand vs Non-Brand Query Indicator

**MVP-indikaattori** - Erottaa bränditunnettuuden ja uusasiakashankinnan.

```typescript
interface BrandVsNonBrandIndicator extends BaseIndicator {
  category: 'combined';
  id: 'brand_vs_nonbrand';
  
  // Non-brand osuus (uusasiakashankinta)
  value: number;  // Non-brand revenue share (%)
  
  brand_queries: {
    total_clicks: number;
    total_impressions: number;
    attributed_revenue: number;
    avg_position: number;
    avg_ctr: number;
    clicks_change_30d: number;
    revenue_change_30d: number;
  };
  
  nonbrand_queries: {
    total_clicks: number;
    total_impressions: number;
    attributed_revenue: number;
    avg_position: number;
    avg_ctr: number;
    clicks_change_30d: number;
    revenue_change_30d: number;
  };
  
  analysis: {
    brand_share: number;
    nonbrand_share: number;
    health: 'healthy' | 'brand_dependent' | 'weak_brand';
    recommendation: string;
    
    nonbrand_growth_opportunity: {
      current_revenue: number;
      potential_if_improved: number;
      top_opportunities: string[];
    };
  };
  
  top_brand_queries: QueryDetail[];
  top_nonbrand_queries: QueryDetail[];
}
```

**Laskentalogiikka:**

```typescript
function calculateBrandVsNonBrand(
  gscData: GSCData[],
  orders: Order[],
  products: Product[],
  shopConfig: ShopConfig
): BrandVsNonBrandIndicator {
  
  // 1. Määrittele brändisanat
  const brandKeywords = [
    shopConfig.shop_name.toLowerCase(),
    ...shopConfig.brand_names.map(b => b.toLowerCase()),
    shopConfig.shop_name.toLowerCase().replace(/\s/g, ''),
    shopConfig.shop_name.toLowerCase().replace(/\./g, '')
  ];
  
  // 2. Luokittele queryt
  const brandQueries: GSCData[] = [];
  const nonBrandQueries: GSCData[] = [];
  
  for (const row of gscData) {
    const queryLower = row.query.toLowerCase();
    const isBrand = brandKeywords.some(brand => queryLower.includes(brand));
    (isBrand ? brandQueries : nonBrandQueries).push(row);
  }
  
  // 3. Laske revenue attribuutio molemmille
  const brandRevenue = calculateQueryGroupRevenue(brandQueries, orders, products);
  const nonBrandRevenue = calculateQueryGroupRevenue(nonBrandQueries, orders, products);
  const totalRevenue = brandRevenue.total + nonBrandRevenue.total;
  
  // 4. Analysoi tasapaino
  const brandShare = totalRevenue > 0 ? (brandRevenue.total / totalRevenue) * 100 : 0;
  const nonBrandShare = 100 - brandShare;
  
  let health: 'healthy' | 'brand_dependent' | 'weak_brand';
  let recommendation: string;
  
  if (brandShare > 70) {
    health = 'brand_dependent';
    recommendation = 'Liikaa riippuvuutta brändihauista. Panosta geneeristen hakusanojen optimointiin.';
  } else if (brandShare < 20) {
    health = 'weak_brand';
    recommendation = 'Bränditunnettuus on heikko. Harkitse brändimarkkinointia.';
  } else {
    health = 'healthy';
    recommendation = 'Terve tasapaino brändi- ja geneeristen hakujen välillä.';
  }
  
  return {
    id: 'brand_vs_nonbrand',
    name: 'Brändi vs. geneerinen haku',
    category: 'combined',
    value: nonBrandShare,
    unit: '%',
    brand_queries: aggregateQueryMetrics(brandQueries, brandRevenue),
    nonbrand_queries: aggregateQueryMetrics(nonBrandQueries, nonBrandRevenue),
    analysis: { brand_share: brandShare, nonbrand_share: nonBrandShare, health, recommendation },
    top_brand_queries: getTopQueries(brandQueries, brandRevenue.byQuery, 10),
    top_nonbrand_queries: getTopQueries(nonBrandQueries, nonBrandRevenue.byQuery, 10)
    // ... rest of fields
  };
}
```

---

## 4. SEO-indikaattorit (GSC Indicators)

### 4.1 Position Change Indicator

```typescript
interface PositionChangeIndicator extends BaseIndicator {
  category: 'seo';
  id: 'position_change';
  
  value: number;  // Keskimääräinen positiomuutos
  
  metrics: {
    average_position_current: number;
    average_position_previous: number;
    position_change: number;
    
    improved_queries: number;
    declined_queries: number;
    stable_queries: number;
    
    significant_changes: {
      query: string;
      page: string;
      position_before: number;
      position_after: number;
      change: number;
      impressions: number;
      impact: 'high' | 'medium' | 'low';
    }[];
  };
}
```

### 4.2 CTR Performance Indicator

```typescript
interface CTRPerformanceIndicator extends BaseIndicator {
  category: 'seo';
  id: 'ctr_performance';
  
  value: number;  // Keskimääräinen CTR
  
  metrics: {
    overall_ctr: number;
    ctr_by_position: {
      position_bucket: string;  // "1-3", "4-10", "11-20"
      ctr: number;
      expected_ctr: number;     // Toimialan benchmark
      performance: 'above' | 'at' | 'below';
    }[];
    
    underperforming_pages: {
      page: string;
      position: number;
      ctr: number;
      expected_ctr: number;
      gap_percent: number;
      impressions: number;
      potential_clicks: number;
    }[];
  };
}
```

**Expected CTR by Position (benchmarks):**

| Positio | Odotettu CTR |
|---------|--------------|
| 1 | 28-32% |
| 2 | 15-18% |
| 3 | 10-12% |
| 4-5 | 6-8% |
| 6-10 | 3-5% |
| 11-20 | 1-2% |

### 4.3 Low Hanging Fruit Indicator

```typescript
interface LowHangingFruitIndicator extends BaseIndicator {
  category: 'seo';
  id: 'low_hanging_fruit';
  
  value: number;  // Mahdollisuuksien määrä
  
  opportunities: {
    query: string;
    page: string;
    
    current_position: number;
    target_position: number;     // Realistinen tavoite
    
    impressions: number;
    current_clicks: number;
    potential_clicks: number;    // Jos tavoitepositio saavutetaan
    
    effort: 'low' | 'medium' | 'high';
    priority_score: number;      // 0-100
    
    recommendation: string;
  }[];
  
  total_potential: {
    additional_clicks: number;
    estimated_revenue: number;   // Jos konversio tunnetaan
  };
}
```

**Laskentalogiikka:**

```typescript
function identifyLowHangingFruit(
  gscData: GSCData[],
  minImpressions: number = 100,
  positionRange: [number, number] = [4, 20]
): LowHangingFruitIndicator {
  
  const opportunities = gscData
    .filter(row => 
      row.impressions >= minImpressions &&
      row.position >= positionRange[0] &&
      row.position <= positionRange[1]
    )
    .map(row => {
      // Laske potentiaali
      const currentCTR = row.clicks / row.impressions;
      const targetPosition = Math.max(3, Math.floor(row.position) - 3);
      const targetCTR = getExpectedCTR(targetPosition);
      const potentialClicks = Math.round(row.impressions * targetCTR);
      
      // Arvioi vaivannäkö
      const positionGap = row.position - targetPosition;
      let effort: 'low' | 'medium' | 'high';
      if (positionGap <= 3) effort = 'low';
      else if (positionGap <= 6) effort = 'medium';
      else effort = 'high';
      
      // Priority score: korkea impressions + pieni gap = paras
      const priorityScore = Math.round(
        (row.impressions / 1000) * (10 - positionGap) * 10
      );
      
      return {
        query: row.query,
        page: row.page,
        current_position: row.position,
        target_position: targetPosition,
        impressions: row.impressions,
        current_clicks: row.clicks,
        potential_clicks: potentialClicks,
        effort,
        priority_score: Math.min(100, priorityScore),
        recommendation: generateRecommendation(row, targetPosition)
      };
    })
    .sort((a, b) => b.priority_score - a.priority_score)
    .slice(0, 20);  // Top 20 mahdollisuutta
  
  return {
    id: 'low_hanging_fruit',
    name: 'SEO-mahdollisuudet',
    category: 'seo',
    value: opportunities.length,
    // ... rest of indicator fields
    opportunities,
    total_potential: {
      additional_clicks: opportunities.reduce(
        (sum, o) => sum + (o.potential_clicks - o.current_clicks), 0
      ),
      estimated_revenue: 0  // Lasketaan combined indicatorissa
    }
  };
}
```

### 4.4 Cannibalisation Indicator

```typescript
interface CannibalisationIndicator extends BaseIndicator {
  category: 'seo';
  id: 'cannibalisation';
  
  value: number;  // Kannibalisoivien termien määrä
  
  issues: {
    query: string;
    competing_pages: {
      page: string;
      position: number;
      impressions: number;
      clicks: number;
    }[];
    
    severity: 'high' | 'medium' | 'low';
    estimated_lost_clicks: number;
    
    recommendation: 'consolidate' | 'differentiate' | 'canonical';
    primary_page_suggestion: string;
  }[];
}
```

### 4.5 Query Trend Indicators

```typescript
interface RisingQueriesIndicator extends BaseIndicator {
  category: 'seo';
  id: 'rising_queries';
  
  value: number;  // Nousevien termien määrä
  
  queries: {
    query: string;
    page: string;
    
    impressions_change: number;
    clicks_change: number;
    position_change: number;
    
    is_new: boolean;           // Ei dataa edellisellä jaksolla
    growth_rate: number;       // % kasvu
    
    opportunity_type: 'emerging_trend' | 'seasonal' | 'competitor_gap';
  }[];
}

interface DecliningQueriesIndicator extends BaseIndicator {
  category: 'seo';
  id: 'declining_queries';
  
  value: number;  // Laskevien termien määrä
  
  queries: {
    query: string;
    page: string;
    
    impressions_change: number;
    clicks_change: number;
    position_change: number;
    
    revenue_at_risk: number;   // Jos tiedossa
    decline_rate: number;      // % lasku
    
    likely_cause: 'competition' | 'algorithm' | 'content_decay' | 'seasonal' | 'unknown';
    urgency: 'immediate' | 'soon' | 'monitor';
  }[];
}
```

---

## 5. Traffic-indikaattorit (GA4)

**HUOM:** GA4-dataa käytetään VAIN suhteellisiin metriikoihin. Absoluuttisia lukuja (€, tilaukset) ei koskaan oteta GA4:stä.

### 5.1 GA4 Data Principles

```typescript
// SALLITTU: Suhteelliset metriikat
const ALLOWED_GA4_METRICS = [
  'bounce_rate',           // Suhteellinen (%)
  'session_duration',      // Käyttäytyminen
  'pages_per_session',     // Käyttäytyminen
  'traffic_source_share',  // Suhteellinen jakauma (%)
  'device_distribution',   // Suhteellinen jakauma (%)
  'funnel_step_rates',     // Suhteelliset konversiot (%)
];

// KIELLETTY: Absoluuttiset transaktionaaliset metriikat
const FORBIDDEN_GA4_METRICS = [
  'transactions',          // Käytä ePages
  'revenue',               // Käytä ePages
  'purchase_count',        // Käytä ePages
  'item_revenue',          // Käytä ePages
];
```

### 5.2 Traffic Source Distribution Indicator

```typescript
interface TrafficSourceDistributionIndicator extends BaseIndicator {
  category: 'traffic';
  id: 'traffic_source_distribution';
  
  // HUOM: Esitetään VAIN prosentteina, ei absoluuttisina lukuina
  value: number;  // Suurimman lähteen osuus (riski-indikaattori)
  
  distribution: {
    source_medium: string;     // 'google / organic', 'direct / none', etc.
    share_percent: number;     // Osuus kaikesta liikenteestä
    
    // Trendi (suhteellinen muutos)
    share_change: number;      // Muutos %-yksiköissä
    trend: 'growing' | 'stable' | 'declining';
  }[];
  
  // Suhteelliset jakaumat
  channel_groups: {
    organic_search: number;    // % kokonaisliikenteestä
    paid_search: number;
    direct: number;
    referral: number;
    social: number;
    email: number;
    other: number;
  };
  
  // Riskianalyysi
  concentration_risk: {
    level: 'low' | 'medium' | 'high';
    dominant_source: string;
    dominant_share: number;
    recommendation: string;
  };
  
  // Data quality warning
  data_coverage_warning: string;  // "GA4 data kattaa arviolta 60-80% liikenteestä"
}
```

**Laskentalogiikka:**

```typescript
function calculateTrafficDistribution(
  ga4Data: GA4TrafficData[]
): TrafficSourceDistributionIndicator {
  
  const totalSessions = ga4Data.reduce((sum, d) => sum + d.sessions, 0);
  
  // Laske jakaumat
  const bySourceMedium = new Map<string, number>();
  for (const row of ga4Data) {
    const key = `${row.source} / ${row.medium}`;
    bySourceMedium.set(key, (bySourceMedium.get(key) || 0) + row.sessions);
  }
  
  const distribution = Array.from(bySourceMedium.entries())
    .map(([source_medium, sessions]) => ({
      source_medium,
      share_percent: (sessions / totalSessions) * 100,
      share_change: 0,  // Lasketaan vertailujaksosta
      trend: 'stable' as const
    }))
    .sort((a, b) => b.share_percent - a.share_percent);
  
  // Channel groups
  const channelGroups = {
    organic_search: sumShareByMedium(ga4Data, 'organic', totalSessions),
    paid_search: sumShareByMedium(ga4Data, 'cpc', totalSessions) + 
                 sumShareByMedium(ga4Data, 'ppc', totalSessions),
    direct: sumShareBySource(ga4Data, '(direct)', totalSessions),
    referral: sumShareByMedium(ga4Data, 'referral', totalSessions),
    social: sumShareByMedium(ga4Data, 'social', totalSessions),
    email: sumShareByMedium(ga4Data, 'email', totalSessions),
    other: 0  // Lasketaan jäännöksenä
  };
  channelGroups.other = 100 - Object.values(channelGroups).reduce((a, b) => a + b, 0);
  
  // Riskianalyysi
  const dominantSource = distribution[0];
  let riskLevel: 'low' | 'medium' | 'high';
  if (dominantSource.share_percent > 60) riskLevel = 'high';
  else if (dominantSource.share_percent > 40) riskLevel = 'medium';
  else riskLevel = 'low';
  
  return {
    id: 'traffic_source_distribution',
    name: 'Liikenteen lähteet',
    category: 'traffic',
    value: dominantSource.share_percent,
    unit: '%',
    direction: 'stable',
    change_percent: null,
    change_absolute: null,
    period: { start: '', end: '', days: 30, label: '30d' },
    comparison_period: { start: '', end: '', days: 30, label: '30d' },
    confidence: 'medium',  // GA4 data on aina 'medium' confidence
    priority: riskLevel === 'high' ? 'high' : 'medium',
    thresholds: {
      warning_high: 50,
      critical_high: 70
    },
    alert_triggered: dominantSource.share_percent > 50,
    context: {
      seasonal_adjusted: false,
      anomaly_detected: false
    },
    calculated_at: new Date().toISOString(),
    data_freshness: 'GA4 data is 24-48h delayed',
    
    distribution,
    channel_groups: channelGroups,
    concentration_risk: {
      level: riskLevel,
      dominant_source: dominantSource.source_medium,
      dominant_share: dominantSource.share_percent,
      recommendation: riskLevel === 'high' 
        ? `Liikenne on keskittynyt vahvasti (${dominantSource.share_percent.toFixed(0)}%) lähteeseen "${dominantSource.source_medium}". Monipuolista liikennelähteitä.`
        : 'Liikennelähteet ovat kohtuullisen hajautuneet.'
    },
    data_coverage_warning: 'GA4-data kattaa arviolta 60-80% todellisesta liikenteestä (cookie consent, ad blockers). Käytä suhteellisia jakaumia, älä absoluuttisia lukuja.'
  };
}
```

### 5.3 Engagement Quality Indicator

```typescript
interface EngagementQualityIndicator extends BaseIndicator {
  category: 'traffic';
  id: 'engagement_quality';
  
  value: number;  // Engagement score 0-100
  
  metrics: {
    // Käyttäytymismetriikat (ei absoluuttisia)
    bounce_rate: number;
    avg_session_duration_seconds: number;
    pages_per_session: number;
    engaged_sessions_rate: number;  // GA4:n engaged sessions %
  };
  
  by_source: {
    source_medium: string;
    bounce_rate: number;
    avg_session_duration: number;
    pages_per_session: number;
    engagement_score: number;
    
    // Vertailu keskiarvoon
    vs_site_average: 'better' | 'same' | 'worse';
  }[];
  
  insights: {
    best_engaging_source: string;
    worst_engaging_source: string;
    recommendation: string;
  };
}
```

### 5.4 Funnel Behavior Indicator

```typescript
interface FunnelBehaviorIndicator extends BaseIndicator {
  category: 'traffic';
  id: 'funnel_behavior';
  
  // HUOM: Kaikki luvut ovat SUHTEELLISIA (%)
  // Absoluuttiset konversiot tulevat ePages-datasta
  
  value: number;  // Overall funnel efficiency score
  
  steps: {
    step: 'landing' | 'product_view' | 'add_to_cart' | 'begin_checkout' | 'purchase';
    
    // Suhteellinen eteneminen edellisestä
    progression_rate: number;     // % joka etenee seuraavaan
    drop_off_rate: number;        // % joka tippuu pois
    
    // Trendi
    rate_change: number;          // Muutos edellisestä jaksosta (%-yksikköä)
    trend: 'improving' | 'stable' | 'declining';
  }[];
  
  // Missä suurin ongelma?
  bottleneck: {
    step: string;
    drop_off_rate: number;
    severity: 'critical' | 'warning' | 'ok';
    
    // Ei arvioida euromääräistä vaikutusta GA4:stä - se tehdään Combined-indikaattorissa
    recommendation: string;
  } | null;
  
  // Per traffic source (suhteelliset)
  by_source: {
    source_medium: string;
    landing_to_product: number;
    product_to_cart: number;
    cart_to_checkout: number;
    checkout_to_purchase: number;
    overall_rate: number;
  }[];
}
```

**Laskentalogiikka:**

```typescript
function calculateFunnelBehavior(
  ga4Events: GA4EventData[]
): FunnelBehaviorIndicator {
  
  // Laske tapahtumat per vaihe
  const eventCounts = {
    session_start: countEvents(ga4Events, 'session_start'),
    view_item: countEvents(ga4Events, 'view_item'),
    add_to_cart: countEvents(ga4Events, 'add_to_cart'),
    begin_checkout: countEvents(ga4Events, 'begin_checkout'),
    purchase: countEvents(ga4Events, 'purchase')  // Käytetään vain suhteelliseen
  };
  
  // Laske suhteelliset etenemisasteet
  const steps = [
    {
      step: 'landing' as const,
      progression_rate: (eventCounts.view_item / eventCounts.session_start) * 100,
      drop_off_rate: 100 - (eventCounts.view_item / eventCounts.session_start) * 100,
      rate_change: 0,
      trend: 'stable' as const
    },
    {
      step: 'product_view' as const,
      progression_rate: (eventCounts.add_to_cart / eventCounts.view_item) * 100,
      drop_off_rate: 100 - (eventCounts.add_to_cart / eventCounts.view_item) * 100,
      rate_change: 0,
      trend: 'stable' as const
    },
    {
      step: 'add_to_cart' as const,
      progression_rate: (eventCounts.begin_checkout / eventCounts.add_to_cart) * 100,
      drop_off_rate: 100 - (eventCounts.begin_checkout / eventCounts.add_to_cart) * 100,
      rate_change: 0,
      trend: 'stable' as const
    },
    {
      step: 'begin_checkout' as const,
      progression_rate: (eventCounts.purchase / eventCounts.begin_checkout) * 100,
      drop_off_rate: 100 - (eventCounts.purchase / eventCounts.begin_checkout) * 100,
      rate_change: 0,
      trend: 'stable' as const
    }
  ];
  
  // Etsi bottleneck (suurin drop-off)
  const worstStep = steps.reduce((worst, current) => 
    current.drop_off_rate > worst.drop_off_rate ? current : worst
  );
  
  let severity: 'critical' | 'warning' | 'ok';
  if (worstStep.drop_off_rate > 80) severity = 'critical';
  else if (worstStep.drop_off_rate > 60) severity = 'warning';
  else severity = 'ok';
  
  return {
    id: 'funnel_behavior',
    name: 'Ostopolun käyttäytyminen',
    category: 'traffic',
    value: calculateFunnelScore(steps),
    // ... rest of BaseIndicator fields
    
    steps,
    bottleneck: {
      step: worstStep.step,
      drop_off_rate: worstStep.drop_off_rate,
      severity,
      recommendation: generateFunnelRecommendation(worstStep)
    },
    by_source: []  // Lasketaan erikseen
  };
}
```

### 5.5 Device & Location Distribution

```typescript
interface DeviceDistributionIndicator extends BaseIndicator {
  category: 'traffic';
  id: 'device_distribution';
  
  value: number;  // Mobile osuus (tärkeä seurattava)
  
  distribution: {
    device: 'desktop' | 'mobile' | 'tablet';
    share_percent: number;
    
    // Käyttäytyminen per laite
    bounce_rate: number;
    pages_per_session: number;
    avg_session_duration: number;
  }[];
  
  mobile_performance: {
    share: number;
    bounce_rate_vs_desktop: number;  // Ero %-yksikköinä
    engagement_vs_desktop: 'better' | 'same' | 'worse';
    
    // Jos mobiili performoi huonosti
    issue_detected: boolean;
    recommendation: string | null;
  };
}

interface GeoDistributionIndicator extends BaseIndicator {
  category: 'traffic';
  id: 'geo_distribution';
  
  value: number;  // Suurimman maan osuus
  
  countries: {
    country: string;
    share_percent: number;
    
    // Käyttäytyminen
    bounce_rate: number;
    engagement_score: number;
  }[];
  
  // Vain suhteellisia havaintoja
  insights: {
    primary_market: string;
    secondary_markets: string[];
    unexpected_traffic: {
      country: string;
      share: number;
      note: string;
    }[];
  };
}
```

### 5.6 Landing Page Performance (Behavioral)

```typescript
interface LandingPageBehaviorIndicator extends BaseIndicator {
  category: 'traffic';
  id: 'landing_page_behavior';
  
  value: number;  // Keskimääräinen engagement score
  
  pages: {
    page_path: string;
    
    // Suhteellinen osuus liikenteestä
    traffic_share_percent: number;
    
    // Käyttäytymismetriikat
    bounce_rate: number;
    avg_session_duration: number;
    pages_per_session: number;
    
    // Funnel progression (suhteellinen)
    view_to_cart_rate: number;
    
    // Vertailu
    engagement_score: number;
    vs_site_average: 'better' | 'same' | 'worse';
  }[];
  
  // Tunnistetut ongelmat
  problem_pages: {
    page: string;
    issue: 'high_bounce' | 'low_engagement' | 'poor_conversion';
    metric_value: number;
    benchmark: number;
    recommendation: string;
  }[];
}
```

---

## 6. Yhdistetyt indikaattorit (Combined Indicators)

Nämä ovat **arvokkainta dataa** - yhdistävät kaikki kolme datalähdettä.

**KRIITTINEN SÄÄNTÖ:** Kaikki euromääräiset arvot tulevat ePages-datasta. GA4 täydentää käyttäytymisdatalla.

### 6.0 Data Combination Rules

```typescript
// Yhdistämissäännöt - mikä data tulee mistä lähteestä
const DATA_SOURCE_RULES = {
  // Rahalliset metriikat: AINA ePages (100% luotettava)
  revenue: 'epages',
  orders: 'epages', 
  order_count: 'epages',
  aov: 'epages',
  products_sold: 'epages',
  line_items: 'epages',
  
  // SEO metriikat: AINA GSC (Googlen oma data)
  impressions: 'gsc',
  organic_clicks: 'gsc',
  position: 'gsc',
  ctr: 'gsc',
  queries: 'gsc',
  
  // Käyttäytyminen: GA4 (VAIN suhteellisena, ~60-80% kattavuus)
  bounce_rate: 'ga4_relative',
  session_duration: 'ga4_relative',
  pages_per_session: 'ga4_relative',
  funnel_rates: 'ga4_relative',
  traffic_source_distribution: 'ga4_relative',
  device_distribution: 'ga4_relative',
  
  // Yhdistetyt laskelmat
  revenue_per_click: 'epages.revenue / gsc.clicks',
  revenue_per_impression: 'epages.revenue / gsc.impressions',
  estimated_organic_share: 'gsc.clicks correlation with epages.orders'
};

// Varoitus GA4-datan käytöstä
const GA4_DATA_WARNING = `
  GA4-data kattaa arviolta 60-80% todellisesta liikenteestä johtuen:
  - Cookie consent (GDPR)
  - Ad blockerit
  - iOS App Tracking Transparency
  
  Käytä GA4-dataa VAIN:
  - Suhteellisiin jakaumiin (%)
  - Käyttäytymistrendeihin
  - Vertailuihin (A vs B)
  
  ÄLÄ käytä GA4:n transaction/revenue -dataa.
`;
```

### 6.1 Query Revenue Attribution (ePages Master)

```typescript
interface QueryRevenueIndicator extends BaseIndicator {
  category: 'combined';
  id: 'query_revenue';
  
  value: number;  // Kokonaisattribuoitu liikevaihto
  
  attribution_model: 'last_click' | 'time_decay' | 'linear';
  attribution_window_days: number;  // Esim. 7 päivää
  
  queries: {
    query: string;
    page: string;
    
    // GSC metriikat
    clicks: number;
    impressions: number;
    position: number;
    ctr: number;
    
    // Attribuoidut myyntimetriikat
    attributed_orders: number;
    attributed_revenue: number;
    
    // Lasketut arvot
    revenue_per_click: number;
    revenue_per_impression: number;
    conversion_rate: number;
    
    // Trendi
    trend: 'growing' | 'stable' | 'declining';
    trend_change_percent: number;
  }[];
  
  summary: {
    total_attributed_revenue: number;
    attribution_coverage: number;  // % myynnistä joka pystytään attribuoimaan
    top_query_concentration: number;  // Top 10 queryn osuus
  };
}
```

**Attribuutiologiikka:**

```typescript
async function calculateQueryRevenue(
  gscData: GSCData[],
  orders: Order[],
  products: Product[],
  windowDays: number = 7
): Promise<QueryRevenueIndicator> {
  
  const queryRevenue = new Map<string, QueryRevenueData>();
  
  for (const order of orders) {
    const orderDate = new Date(order.order_created_at);
    
    // Käy läpi tilauksen tuotteet
    for (const lineItem of order.line_items || []) {
      const product = products.find(p => p.epages_product_id === lineItem.productId);
      if (!product?.slug) continue;
      
      // Etsi GSC data joka osuu tuotesivulle attribuutioikkunassa
      const relevantGSC = gscData.filter(gsc => {
        const gscDate = new Date(gsc.date);
        const daysDiff = (orderDate.getTime() - gscDate.getTime()) / (1000 * 60 * 60 * 24);
        
        return (
          gsc.page.includes(product.slug) &&
          daysDiff >= 0 &&
          daysDiff <= windowDays &&
          gsc.clicks > 0
        );
      });
      
      // Attribuoi liikevaihto quereihin (time decay)
      for (const gsc of relevantGSC) {
        const daysDiff = (orderDate.getTime() - new Date(gsc.date).getTime()) / (1000 * 60 * 60 * 24);
        const decayFactor = Math.pow(0.9, daysDiff);  // 10% decay per päivä
        
        const totalClicks = relevantGSC.reduce((sum, g) => sum + g.clicks, 0);
        const clickShare = gsc.clicks / totalClicks;
        
        const attributedRevenue = lineItem.line_total * clickShare * decayFactor;
        
        const key = `${gsc.query}|${gsc.page}`;
        const existing = queryRevenue.get(key) || {
          query: gsc.query,
          page: gsc.page,
          clicks: 0,
          impressions: 0,
          attributed_orders: 0,
          attributed_revenue: 0
        };
        
        existing.clicks += gsc.clicks;
        existing.impressions += gsc.impressions;
        existing.attributed_orders += clickShare * decayFactor;
        existing.attributed_revenue += attributedRevenue;
        
        queryRevenue.set(key, existing);
      }
    }
  }
  
  // Muunna ja laske johdannaismetriikat
  const queries = Array.from(queryRevenue.values())
    .map(q => ({
      ...q,
      position: 0,  // Täydennetään GSC datasta
      ctr: q.clicks / q.impressions,
      revenue_per_click: q.attributed_revenue / q.clicks,
      revenue_per_impression: q.attributed_revenue / q.impressions,
      conversion_rate: q.attributed_orders / q.clicks,
      trend: 'stable' as const,  // Lasketaan erikseen
      trend_change_percent: 0
    }))
    .sort((a, b) => b.attributed_revenue - a.attributed_revenue);
  
  return {
    id: 'query_revenue',
    name: 'Hakusanojen liikevaihto',
    category: 'combined',
    value: queries.reduce((sum, q) => sum + q.attributed_revenue, 0),
    // ... rest of fields
    attribution_model: 'time_decay',
    attribution_window_days: windowDays,
    queries,
    summary: {
      total_attributed_revenue: queries.reduce((sum, q) => sum + q.attributed_revenue, 0),
      attribution_coverage: 0,  // Lasketaan
      top_query_concentration: queries.slice(0, 10).reduce((sum, q) => sum + q.attributed_revenue, 0) /
        queries.reduce((sum, q) => sum + q.attributed_revenue, 0)
    }
  };
}
```

### 5.2 SEO-Sales Gap Indicator

```typescript
interface SEOSalesGapIndicator extends BaseIndicator {
  category: 'combined';
  id: 'seo_sales_gap';
  
  value: number;  // Gap-tapausten määrä
  
  gaps: {
    gap_type: 'high_sales_low_seo' | 'high_seo_low_sales';
    
    product_id: string;
    product_name: string;
    product_slug: string;
    
    // Myynti
    monthly_revenue: number;
    monthly_orders: number;
    sales_rank: number;
    
    // SEO
    organic_clicks: number;
    organic_impressions: number;
    average_position: number | null;
    seo_rank: number | null;
    
    // Gap analyysi
    gap_score: number;           // 0-100, korkeampi = suurempi gap
    opportunity_value: number;   // Arvioitu € potentiaali
    
    recommendation: string;
  }[];
}
```

**Laskentalogiikka:**

```typescript
function identifySEOSalesGaps(
  products: Product[],
  orderLineItems: OrderLineItem[],
  gscData: GSCData[]
): SEOSalesGapIndicator {
  
  // Aggregoi myynti per tuote
  const salesByProduct = new Map<string, { revenue: number; orders: number }>();
  for (const item of orderLineItems) {
    const existing = salesByProduct.get(item.epages_product_id) || { revenue: 0, orders: 0 };
    existing.revenue += item.line_total;
    existing.orders += 1;
    salesByProduct.set(item.epages_product_id, existing);
  }
  
  // Aggregoi SEO per tuote (perustuen slugiin)
  const seoByProduct = new Map<string, { clicks: number; impressions: number; position: number }>();
  for (const product of products) {
    if (!product.slug) continue;
    
    const productGSC = gscData.filter(g => g.page.includes(product.slug));
    if (productGSC.length === 0) {
      seoByProduct.set(product.epages_product_id, { clicks: 0, impressions: 0, position: 0 });
    } else {
      seoByProduct.set(product.epages_product_id, {
        clicks: productGSC.reduce((sum, g) => sum + g.clicks, 0),
        impressions: productGSC.reduce((sum, g) => sum + g.impressions, 0),
        position: productGSC.reduce((sum, g) => sum + g.position * g.impressions, 0) /
          productGSC.reduce((sum, g) => sum + g.impressions, 0)
      });
    }
  }
  
  // Tunnista gapit
  const gaps: SEOSalesGapIndicator['gaps'] = [];
  
  // Rankaa tuotteet
  const productsSortedBySales = [...salesByProduct.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue);
  const productsSortedBySEO = [...seoByProduct.entries()]
    .sort((a, b) => b[1].clicks - a[1].clicks);
  
  for (const product of products) {
    const sales = salesByProduct.get(product.epages_product_id);
    const seo = seoByProduct.get(product.epages_product_id);
    
    if (!sales || !seo) continue;
    
    const salesRank = productsSortedBySales.findIndex(([id]) => id === product.epages_product_id) + 1;
    const seoRank = productsSortedBySEO.findIndex(([id]) => id === product.epages_product_id) + 1;
    
    // High sales, low SEO: myy hyvin mutta ei orgaanista näkyvyyttä
    if (salesRank <= 20 && (seoRank > 50 || seo.clicks < 10)) {
      gaps.push({
        gap_type: 'high_sales_low_seo',
        product_id: product.epages_product_id,
        product_name: product.name,
        product_slug: product.slug || '',
        monthly_revenue: sales.revenue,
        monthly_orders: sales.orders,
        sales_rank: salesRank,
        organic_clicks: seo.clicks,
        organic_impressions: seo.impressions,
        average_position: seo.position || null,
        seo_rank: seoRank || null,
        gap_score: calculateGapScore(salesRank, seoRank),
        opportunity_value: estimateSEOOpportunity(sales.revenue, seo.clicks),
        recommendation: `Tuote "${product.name}" myy hyvin (${sales.revenue}€/kk) mutta saa vain ${seo.clicks} orgaanista klikkiä. SEO-optimointi voi tuoda merkittävää lisämyyntiä.`
      });
    }
    
    // High SEO, low sales: saa liikennettä mutta ei konvertoi
    if (seoRank <= 20 && seo.clicks > 50 && (salesRank > 50 || sales.orders < 2)) {
      gaps.push({
        gap_type: 'high_seo_low_sales',
        product_id: product.epages_product_id,
        product_name: product.name,
        product_slug: product.slug || '',
        monthly_revenue: sales.revenue,
        monthly_orders: sales.orders,
        sales_rank: salesRank,
        organic_clicks: seo.clicks,
        organic_impressions: seo.impressions,
        average_position: seo.position || null,
        seo_rank: seoRank,
        gap_score: calculateGapScore(seoRank, salesRank),
        opportunity_value: estimateConversionOpportunity(seo.clicks, sales.orders),
        recommendation: `Tuote "${product.name}" saa ${seo.clicks} orgaanista klikkiä mutta vain ${sales.orders} tilausta. Tarkista tuotesivu ja hinnoittelu.`
      });
    }
  }
  
  return {
    id: 'seo_sales_gap',
    name: 'SEO-myynti-kuilu',
    category: 'combined',
    value: gaps.length,
    // ... rest of fields
    gaps: gaps.sort((a, b) => b.opportunity_value - a.opportunity_value)
  };
}
```

### 5.3 Page Efficiency Indicator

```typescript
interface PageEfficiencyIndicator extends BaseIndicator {
  category: 'combined';
  id: 'page_efficiency';
  
  value: number;  // Keskimääräinen €/click
  
  pages: {
    page: string;
    page_type: 'product' | 'category' | 'landing' | 'other';
    
    // Traffic
    organic_clicks: number;
    organic_impressions: number;
    
    // Revenue
    attributed_revenue: number;
    attributed_orders: number;
    
    // Efficiency
    revenue_per_click: number;
    revenue_per_impression: number;
    conversion_rate: number;
    
    // Benchmarking
    efficiency_score: number;     // 0-100 vs. muut sivut
    vs_site_average: number;      // % ero keskiarvosta
    
    // Recommendations
    optimization_priority: 'high' | 'medium' | 'low';
    issues: string[];
  }[];
  
  summary: {
    best_performing_pages: string[];
    worst_performing_pages: string[];
    total_optimization_potential: number;  // € jos huonoimmat nostetaan keskitasolle
  };
}
```

### 6.4 Organic Revenue Share Indicator

```typescript
interface OrganicRevenueShareIndicator extends BaseIndicator {
  category: 'combined';
  id: 'organic_revenue_share';
  
  value: number;  // Orgaanisen haun osuus (0-1)
  
  breakdown: {
    organic_attributed: number;      // € attribuoitu orgaaniseen (ePages)
    total_revenue: number;           // € kokonaismyynti (ePages)
    organic_share: number;           // %
    
    trend: 'increasing' | 'stable' | 'decreasing';
    trend_change: number;            // Muutos edellisestä jaksosta
  };
  
  risk_assessment: {
    // Liian korkea organic dependency = riski
    dependency_level: 'healthy' | 'moderate' | 'high_risk';
    recommendation: string;
  };
}
```

### 6.5 Full Funnel Performance Indicator (GA4 + GSC + ePages)

```typescript
interface FullFunnelPerformanceIndicator extends BaseIndicator {
  category: 'combined';
  id: 'full_funnel_performance';
  
  // Yhdistää kaikki kolme datalähdettä oikealla tavalla
  
  value: number;  // Overall funnel efficiency score
  
  funnel: {
    // Vaihe 1: Discovery (GSC)
    discovery: {
      source: 'gsc';
      impressions: number;
      clicks: number;
      ctr: number;
      avg_position: number;
    };
    
    // Vaihe 2: Engagement (GA4 - suhteellinen)
    engagement: {
      source: 'ga4';
      data_coverage_note: string;  // "~60-80% kattavuus"
      
      bounce_rate: number;
      pages_per_session: number;
      product_view_rate: number;    // % sessioista jotka katselivat tuotteita
      add_to_cart_rate: number;     // % product vieweistä
    };
    
    // Vaihe 3: Conversion (ePages - 100% tarkka)
    conversion: {
      source: 'epages';
      orders: number;
      revenue: number;
      aov: number;
    };
  };
  
  // Lasketut yhdistelmämetriikat
  calculated: {
    // GSC clicks → ePages orders (tarkka)
    click_to_order_rate: number;
    revenue_per_click: number;
    revenue_per_impression: number;
    
    // GA4:n funnel-suhteet skaalattu ePages-konversioon
    estimated_cart_abandonment: number;  // Perustuu GA4 suhteisiin
  };
  
  // Per traffic source (GA4 jakauma + ePages master revenue)
  by_channel: {
    channel: string;
    
    // GA4: Suhteellinen osuus liikenteestä
    traffic_share: number;
    
    // Käyttäytyminen (GA4)
    bounce_rate: number;
    engagement_score: number;
    funnel_efficiency: number;  // Suhteellinen add-to-cart / session
    
    // ePages: Attribuoitu myynti perustuen korrelaatioon
    // HUOM: Tämä on arvio, koska ePages ei tiedä traffic sourcea
    estimated_revenue_share: number;
    confidence: 'high' | 'medium' | 'low';
  }[];
  
  insights: {
    best_channel: string;
    worst_channel: string;
    biggest_funnel_leak: string;
    recommendation: string;
  };
}
```

**Laskentalogiikka (Full Funnel):**

```typescript
async function calculateFullFunnelPerformance(
  gscData: GSCData[],
  ga4Data: GA4Data,
  orders: Order[],
  products: Product[]
): Promise<FullFunnelPerformanceIndicator> {
  
  // 1. GSC aggregaatit (100% luotettava)
  const gscTotals = {
    impressions: gscData.reduce((sum, d) => sum + d.impressions, 0),
    clicks: gscData.reduce((sum, d) => sum + d.clicks, 0),
    ctr: 0,
    avg_position: 0
  };
  gscTotals.ctr = gscTotals.clicks / gscTotals.impressions;
  gscTotals.avg_position = weightedAvgPosition(gscData);
  
  // 2. ePages aggregaatit (100% luotettava - MASTER)
  const epagesTotals = {
    orders: orders.length,
    revenue: orders.reduce((sum, o) => sum + o.grand_total, 0),
    aov: 0
  };
  epagesTotals.aov = epagesTotals.revenue / epagesTotals.orders;
  
  // 3. GA4 aggregaatit (suhteelliset - ~60-80% kattavuus)
  const ga4Engagement = {
    bounce_rate: ga4Data.aggregated.bounce_rate,
    pages_per_session: ga4Data.aggregated.pages_per_session,
    product_view_rate: ga4Data.funnel.view_item / ga4Data.funnel.session_start,
    add_to_cart_rate: ga4Data.funnel.add_to_cart / ga4Data.funnel.view_item
  };
  
  // 4. Lasketut yhdistelmämetriikat (GSC + ePages = tarkka)
  const calculated = {
    click_to_order_rate: epagesTotals.orders / gscTotals.clicks,
    revenue_per_click: epagesTotals.revenue / gscTotals.clicks,
    revenue_per_impression: epagesTotals.revenue / gscTotals.impressions,
    
    // GA4:n cart abandonment skaalattu - tämä on ARVIO
    estimated_cart_abandonment: 1 - (ga4Data.funnel.purchase / ga4Data.funnel.add_to_cart)
  };
  
  // 5. Per channel analyysi
  const byChannel = calculateChannelPerformance(ga4Data, epagesTotals, gscTotals);
  
  return {
    id: 'full_funnel_performance',
    name: 'Koko ostopolun suorituskyky',
    category: 'combined',
    value: calculateFunnelScore(gscTotals, ga4Engagement, epagesTotals),
    // ... BaseIndicator fields
    
    funnel: {
      discovery: {
        source: 'gsc',
        ...gscTotals
      },
      engagement: {
        source: 'ga4',
        data_coverage_note: 'GA4-data kattaa arviolta 60-80% liikenteestä',
        ...ga4Engagement
      },
      conversion: {
        source: 'epages',
        ...epagesTotals
      }
    },
    calculated,
    by_channel: byChannel,
    insights: generateFunnelInsights(byChannel, calculated)
  };
}
```

### 6.6 Landing Page ROI Indicator (Combined)

```typescript
interface LandingPageROIIndicator extends BaseIndicator {
  category: 'combined';
  id: 'landing_page_roi';
  
  value: number;  // Keskimääräinen €/session
  
  pages: {
    page_path: string;
    
    // GSC data (100% tarkka)
    organic_clicks: number;
    impressions: number;
    position: number;
    
    // GA4 käyttäytyminen (suhteellinen)
    bounce_rate: number;
    avg_session_duration: number;
    funnel_progression_rate: number;  // Kuinka moni etenee funnelissa
    
    // ePages attribuutio (master)
    attributed_orders: number;
    attributed_revenue: number;
    
    // Lasketut (ePages revenue / GSC clicks = tarkka)
    revenue_per_click: number;
    conversion_rate: number;
    
    // Scoring
    efficiency_score: number;  // 0-100
    vs_site_average: number;   // % ero keskiarvosta
    
    // Ongelmat (GA4:stä tunnistettu)
    issues: ('high_bounce' | 'low_engagement' | 'poor_funnel')[];
  }[];
  
  summary: {
    best_pages: string[];
    worst_pages: string[];
    total_optimization_potential: number;  // € jos huonoimmat nostetaan keskitasolle
  };
}
```

### 6.7 Traffic Source Revenue Estimation

```typescript
interface TrafficSourceRevenueIndicator extends BaseIndicator {
  category: 'combined';
  id: 'traffic_source_revenue';
  
  // HUOM: Tämä on ARVIO koska ePages ei tiedä traffic sourcea
  // Perustuu korrelaatioon: GA4 traffic share + ePages total revenue
  
  estimation_method: 'correlation' | 'attribution_model';
  confidence_level: 'estimated';  // Aina 'estimated' koska GA4-pohjainen
  
  value: number;  // Suurimman kanavan arvioitu osuus €
  
  channels: {
    channel: string;  // 'organic', 'direct', 'paid', 'referral', 'social'
    
    // GA4: Traffic jakauma (suhteellinen)
    traffic_share_percent: number;
    
    // GA4: Käyttäytyminen (suhteellinen)
    bounce_rate: number;
    engagement_quality_score: number;
    funnel_efficiency: number;  // add_to_cart rate suhteessa
    
    // ARVIO: Revenue attribuutio
    // Laskettu: (traffic_share * engagement_quality * funnel_efficiency) normalized
    estimated_revenue: number;
    estimated_revenue_share: number;
    
    // Confidence
    estimation_confidence: 'high' | 'medium' | 'low';
    confidence_reason: string;
  }[];
  
  // Organic-specific (korkea confidence koska GSC + ePages)
  organic_detail: {
    // Tämä on TARKKA koska GSC clicks + ePages orders
    gsc_clicks: number;
    attributed_orders: number;
    attributed_revenue: number;
    revenue_per_click: number;
    
    confidence: 'high';  // Aina korkea koska ei GA4-riippuvuutta
  };
  
  data_quality_note: string;
}
```

**Laskentalogiikka:**

```typescript
function calculateTrafficSourceRevenue(
  ga4Traffic: GA4TrafficData[],
  gscData: GSCData[],
  orders: Order[],
  totalRevenue: number
): TrafficSourceRevenueIndicator {
  
  // 1. Organic on TARKKA (GSC + ePages, ei GA4 riippuvuutta)
  const organicDetail = calculateOrganicRevenue(gscData, orders);
  
  // 2. Muut kanavat ovat ARVIOITA (GA4-pohjaisia)
  const totalSessions = ga4Traffic.reduce((sum, t) => sum + t.sessions, 0);
  
  const channels = getUniqueChannels(ga4Traffic).map(channel => {
    const channelData = ga4Traffic.filter(t => getChannel(t) === channel);
    const sessions = channelData.reduce((sum, t) => sum + t.sessions, 0);
    const trafficShare = sessions / totalSessions;
    
    // Laske engagement quality
    const bounceRate = weightedAvg(channelData, 'bounce_rate', 'sessions');
    const engagementScore = calculateEngagementScore(channelData);
    const funnelEfficiency = calculateFunnelEfficiency(channelData);
    
    // Arvio revenue share perustuen käyttäytymiseen
    // Oletus: parempi engagement = parempi konversio
    const qualityMultiplier = engagementScore * funnelEfficiency;
    
    return {
      channel,
      traffic_share_percent: trafficShare * 100,
      bounce_rate: bounceRate,
      engagement_quality_score: engagementScore,
      funnel_efficiency: funnelEfficiency,
      
      // Arviot
      estimated_revenue: 0,  // Lasketaan normalisoinnin jälkeen
      estimated_revenue_share: 0,
      
      estimation_confidence: trafficShare > 0.1 ? 'medium' : 'low',
      confidence_reason: 'Perustuu GA4 traffic-jakaumaan ja käyttäytymiseen'
    };
  });
  
  // 3. Normalisoi revenue arviot
  // Organic revenue on tarkka, jäljelle jäävä jaetaan muiden kesken
  const nonOrganicRevenue = totalRevenue - organicDetail.attributed_revenue;
  const totalQualityScore = channels
    .filter(c => c.channel !== 'organic')
    .reduce((sum, c) => sum + (c.traffic_share_percent * c.engagement_quality_score), 0);
  
  for (const channel of channels) {
    if (channel.channel === 'organic') {
      channel.estimated_revenue = organicDetail.attributed_revenue;
      channel.estimated_revenue_share = (organicDetail.attributed_revenue / totalRevenue) * 100;
      channel.estimation_confidence = 'high';
      channel.confidence_reason = 'Perustuu GSC + ePages dataan (ei GA4)';
    } else {
      const qualityShare = (channel.traffic_share_percent * channel.engagement_quality_score) / totalQualityScore;
      channel.estimated_revenue = nonOrganicRevenue * qualityShare;
      channel.estimated_revenue_share = (channel.estimated_revenue / totalRevenue) * 100;
    }
  }
  
  return {
    id: 'traffic_source_revenue',
    name: 'Liikennelähteiden arvioitu myynti',
    category: 'combined',
    value: Math.max(...channels.map(c => c.estimated_revenue)),
    // ... BaseIndicator fields
    
    estimation_method: 'correlation',
    confidence_level: 'estimated',
    channels,
    organic_detail: {
      ...organicDetail,
      confidence: 'high'
    },
    data_quality_note: 'Organic search -arvio on tarkka (GSC + ePages). Muut kanavat ovat arvioita perustuen GA4 traffic-jakaumaan ja käyttäytymiseen. GA4-data kattaa ~60-80% liikenteestä.'
  };
}
```

---

## 7. GA4 Data Sync & Storage

### 7.1 GA4 API Configuration

```typescript
// GA4 Data API configuration
const GA4_CONFIG = {
  // Haetaan VAIN käyttäytymisdataa, EI ecommerce transactions
  reports: {
    traffic: {
      dimensions: [
        { name: 'date' },
        { name: 'sessionSource' },
        { name: 'sessionMedium' },
        { name: 'sessionCampaignName' }
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'newUsers' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
        { name: 'screenPageViewsPerSession' },
        { name: 'engagedSessions' }
      ]
    },
    
    funnel_events: {
      dimensions: [
        { name: 'date' },
        { name: 'eventName' }
      ],
      metrics: [
        { name: 'eventCount' }
      ],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          inListFilter: {
            values: [
              'session_start',
              'view_item',
              'add_to_cart',
              'begin_checkout'
              // HUOM: 'purchase' haetaan vain suhteelliseen funnel-analyysiin
            ]
          }
        }
      }
    },
    
    landing_pages: {
      dimensions: [
        { name: 'date' },
        { name: 'landingPage' },
        { name: 'sessionSource' },
        { name: 'sessionMedium' }
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
        { name: 'engagedSessions' }
      ]
    },
    
    device_geo: {
      dimensions: [
        { name: 'date' },
        { name: 'deviceCategory' },
        { name: 'country' }
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'bounceRate' },
        { name: 'engagedSessions' }
      ]
    }
  }
};

// EI HAETA - ecommerce metriikat
const FORBIDDEN_GA4_METRICS = [
  'transactions',
  'totalRevenue', 
  'purchaseRevenue',
  'ecommercePurchases',
  'itemRevenue',
  'itemsPurchased'
];
```

### 7.2 Supabase Schema (GA4 Tables)

```sql
-- =====================================================
-- GA4 TRAFFIC DATA
-- =====================================================
CREATE TABLE ga4_traffic (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  
  date DATE NOT NULL,
  source TEXT,
  medium TEXT,
  campaign TEXT,
  
  -- Käyttäytymismetriikat (suhteellisia)
  sessions INT DEFAULT 0,
  users INT DEFAULT 0,
  new_users INT DEFAULT 0,
  engaged_sessions INT DEFAULT 0,
  bounce_rate DECIMAL(5,4),              -- 0.0000 - 1.0000
  avg_session_duration DECIMAL(10,2),    -- sekunteina
  pages_per_session DECIMAL(6,2),
  
  synced_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(shop_id, date, source, medium, campaign)
);

CREATE INDEX idx_ga4_traffic_shop_date ON ga4_traffic(shop_id, date DESC);
CREATE INDEX idx_ga4_traffic_source ON ga4_traffic(shop_id, source, medium);

-- =====================================================
-- GA4 FUNNEL EVENTS (suhteelliset)
-- =====================================================
CREATE TABLE ga4_funnel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  
  date DATE NOT NULL,
  event_name TEXT NOT NULL,   -- 'session_start', 'view_item', 'add_to_cart', 'begin_checkout'
  event_count INT DEFAULT 0,
  
  synced_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(shop_id, date, event_name)
);

CREATE INDEX idx_ga4_funnel_shop_date ON ga4_funnel_events(shop_id, date DESC);

-- =====================================================
-- GA4 LANDING PAGES (käyttäytyminen)
-- =====================================================
CREATE TABLE ga4_landing_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  
  date DATE NOT NULL,
  landing_page TEXT NOT NULL,
  source TEXT,
  medium TEXT,
  
  sessions INT DEFAULT 0,
  bounce_rate DECIMAL(5,4),
  avg_session_duration DECIMAL(10,2),
  engaged_sessions INT DEFAULT 0,
  
  synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ga4_landing_shop_date ON ga4_landing_pages(shop_id, date DESC);
CREATE INDEX idx_ga4_landing_page ON ga4_landing_pages(shop_id, landing_page);

-- =====================================================
-- GA4 DEVICE & GEO (jakaumat)
-- =====================================================
CREATE TABLE ga4_device_geo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  
  date DATE NOT NULL,
  device_category TEXT,      -- 'desktop', 'mobile', 'tablet'
  country TEXT,
  
  sessions INT DEFAULT 0,
  bounce_rate DECIMAL(5,4),
  engaged_sessions INT DEFAULT 0,
  
  synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ga4_device_shop_date ON ga4_device_geo(shop_id, date DESC);

-- =====================================================
-- RLS POLICIES
-- =====================================================
ALTER TABLE ga4_traffic ENABLE ROW LEVEL SECURITY;
ALTER TABLE ga4_funnel_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ga4_landing_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ga4_device_geo ENABLE ROW LEVEL SECURITY;

-- Copy RLS policies from other tables...
```

### 7.3 GA4 Sync Service

```typescript
// /lib/sync/ga4-sync.ts

import { BetaAnalyticsDataClient } from '@google-analytics/data';

export class GA4SyncService {
  private client: BetaAnalyticsDataClient;
  private propertyId: string;
  
  constructor(credentials: GA4Credentials, propertyId: string) {
    this.client = new BetaAnalyticsDataClient({ credentials });
    this.propertyId = propertyId;
  }
  
  async syncTrafficData(shopId: string, startDate: Date, endDate: Date) {
    const [response] = await this.client.runReport({
      property: `properties/${this.propertyId}`,
      dateRanges: [{
        startDate: formatDate(startDate),
        endDate: formatDate(endDate)
      }],
      dimensions: [
        { name: 'date' },
        { name: 'sessionSource' },
        { name: 'sessionMedium' },
        { name: 'sessionCampaignName' }
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'newUsers' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
        { name: 'screenPageViewsPerSession' },
        { name: 'engagedSessions' }
      ]
    });
    
    // Transform and save to Supabase
    const records = response.rows?.map(row => ({
      shop_id: shopId,
      date: parseGA4Date(row.dimensionValues[0].value),
      source: row.dimensionValues[1].value || '(not set)',
      medium: row.dimensionValues[2].value || '(not set)',
      campaign: row.dimensionValues[3].value || '(not set)',
      sessions: parseInt(row.metricValues[0].value),
      users: parseInt(row.metricValues[1].value),
      new_users: parseInt(row.metricValues[2].value),
      bounce_rate: parseFloat(row.metricValues[3].value),
      avg_session_duration: parseFloat(row.metricValues[4].value),
      pages_per_session: parseFloat(row.metricValues[5].value),
      engaged_sessions: parseInt(row.metricValues[6].value)
    })) || [];
    
    await supabase.from('ga4_traffic').upsert(records, {
      onConflict: 'shop_id,date,source,medium,campaign'
    });
    
    return records.length;
  }
  
  async syncFunnelEvents(shopId: string, startDate: Date, endDate: Date) {
    const [response] = await this.client.runReport({
      property: `properties/${this.propertyId}`,
      dateRanges: [{
        startDate: formatDate(startDate),
        endDate: formatDate(endDate)
      }],
      dimensions: [
        { name: 'date' },
        { name: 'eventName' }
      ],
      metrics: [
        { name: 'eventCount' }
      ],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          inListFilter: {
            values: ['session_start', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase']
          }
        }
      }
    });
    
    const records = response.rows?.map(row => ({
      shop_id: shopId,
      date: parseGA4Date(row.dimensionValues[0].value),
      event_name: row.dimensionValues[1].value,
      event_count: parseInt(row.metricValues[0].value)
    })) || [];
    
    await supabase.from('ga4_funnel_events').upsert(records, {
      onConflict: 'shop_id,date,event_name'
    });
    
    return records.length;
  }
}
```

---

## 8. Indikaattorien laskenta-aikataulu

### 8.1 Laskentafrekvenssi

| Indikaattori | Frekvenssi | Datalähde | Syy |
|--------------|------------|-----------|-----|
| Sales trend (7d) | Päivittäin | ePages | Operatiivinen seuranta |
| Sales trend (30d) | Päivittäin | ePages | Trendien tunnistus |
| AOV | Päivittäin | ePages | Nopea reagointi |
| Revenue concentration | Viikoittain | ePages | Ei muutu nopeasti |
| GSC indicators | Päivittäin | GSC | GSC data 2-3 päivää vanha |
| GA4 traffic | Päivittäin | GA4 | GA4 data 24-48h vanha |
| GA4 funnel | Päivittäin | GA4 | Suhteelliset konversiot |
| Combined indicators | Päivittäin | All | Yhdistää kaikki lähteet |
| Customer LTV | Viikoittain | ePages | Vaatii enemmän laskentaa |

### 8.2 Data Freshness

| Lähde | Viive | Huomio |
|-------|-------|--------|
| ePages | Real-time | Päivitetään synkronoinnissa |
| GSC | 2-3 päivää | Googlen prosessointi |
| GA4 | 24-48h | Googlen prosessointi |

### 8.3 Cron Job rakenne

```typescript
// /api/cron/calculate-indicators/route.ts

export async function GET(request: Request) {
  const shops = await getActiveShops();
  
  for (const shop of shops) {
    // 1. Hae raakadata KAIKISTA lähteistä
    
    // ePages (MASTER - 100% luotettava)
    const orders = await getOrders(shop.id, 90);
    const products = await getProducts(shop.id);
    
    // GSC (SEO - 100% luotettava)
    const gscData = await getGSCData(shop.id, 90);
    
    // GA4 (Behavioral - ~60-80% kattavuus, VAIN suhteelliset)
    const ga4Data = await getGA4Data(shop.id, 90);
    
    // 2. Laske indikaattorit
    const indicators: BaseIndicator[] = [];
    
    // === Sales indicators (ePages MASTER) ===
    indicators.push(calculateSalesTrend(orders, '7d'));
    indicators.push(calculateSalesTrend(orders, '30d'));
    indicators.push(calculateAOV(orders, '7d'));
    indicators.push(calculateRevenueConcentration(orders, products));
    
    // === SEO indicators (GSC) ===
    indicators.push(calculatePositionChange(gscData));
    indicators.push(calculateCTRPerformance(gscData));
    indicators.push(identifyLowHangingFruit(gscData));
    indicators.push(identifyCannibalisation(gscData));
    indicators.push(identifyRisingQueries(gscData));
    indicators.push(identifyDecliningQueries(gscData));
    
    // === Traffic indicators (GA4 - suhteelliset) ===
    indicators.push(calculateTrafficDistribution(ga4Data.traffic));
    indicators.push(calculateEngagementQuality(ga4Data.traffic));
    indicators.push(calculateFunnelBehavior(ga4Data.funnel));
    indicators.push(calculateDeviceDistribution(ga4Data.deviceGeo));
    indicators.push(calculateLandingPageBehavior(ga4Data.landingPages));
    
    // === Combined indicators (kaikki lähteet) ===
    // Revenue tulee AINA ePages:sta, GA4 täydentää käyttäytymisellä
    indicators.push(await calculateQueryRevenue(gscData, orders, products));
    indicators.push(identifySEOSalesGaps(products, orders, gscData));
    indicators.push(calculatePageEfficiency(gscData, orders, products, ga4Data.landingPages));
    indicators.push(calculateOrganicRevenueShare(gscData, orders));
    indicators.push(calculateFullFunnelPerformance(gscData, ga4Data, orders, products));
    indicators.push(calculateLandingPageROI(gscData, ga4Data.landingPages, orders, products));
    indicators.push(calculateTrafficSourceRevenue(ga4Data.traffic, gscData, orders));
    
    // 3. Tallenna indikaattorit
    await saveIndicators(shop.id, indicators);
    
    // 4. Tarkista alertit
    const alerts = checkAlertThresholds(indicators);
    if (alerts.length > 0) {
      await createAlerts(shop.id, alerts);
    }
  }
  
  return Response.json({ success: true });
}

// GA4 Data Helper
async function getGA4Data(shopId: string, days: number): Promise<GA4DataBundle> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return {
    traffic: await supabase
      .from('ga4_traffic')
      .select('*')
      .eq('shop_id', shopId)
      .gte('date', startDate.toISOString())
      .lte('date', endDate.toISOString()),
      
    funnel: await supabase
      .from('ga4_funnel_events')
      .select('*')
      .eq('shop_id', shopId)
      .gte('date', startDate.toISOString())
      .lte('date', endDate.toISOString()),
      
    landingPages: await supabase
      .from('ga4_landing_pages')
      .select('*')
      .eq('shop_id', shopId)
      .gte('date', startDate.toISOString())
      .lte('date', endDate.toISOString()),
      
    deviceGeo: await supabase
      .from('ga4_device_geo')
      .select('*')
      .eq('shop_id', shopId)
      .gte('date', startDate.toISOString())
      .lte('date', endDate.toISOString())
  };
}

interface GA4DataBundle {
  traffic: GA4TrafficData[];
  funnel: GA4FunnelData[];
  landingPages: GA4LandingPageData[];
  deviceGeo: GA4DeviceGeoData[];
}
```

---

## 7. Indikaattorien tallennus (Supabase)

### 7.1 Tietokantaskeema

```sql
-- Lasketut indikaattorit
CREATE TABLE indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  
  indicator_id TEXT NOT NULL,          -- 'sales_trend', 'aov', etc.
  indicator_category TEXT NOT NULL,    -- 'sales', 'seo', 'combined'
  
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_label TEXT,                   -- '7d', '30d', '90d'
  
  value JSONB NOT NULL,                -- Koko indikaattori JSON
  
  -- Denormalisoidut kentät nopeisiin hakuihin
  numeric_value DECIMAL(14,4),
  direction TEXT,
  priority TEXT,
  alert_triggered BOOLEAN DEFAULT false,
  
  calculated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(shop_id, indicator_id, period_label, period_end)
);

CREATE INDEX idx_indicators_shop_date ON indicators(shop_id, period_end DESC);
CREATE INDEX idx_indicators_alerts ON indicators(shop_id, alert_triggered) WHERE alert_triggered = true;

-- Indikaattorihistoria (aggregoitu)
CREATE TABLE indicator_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  
  indicator_id TEXT NOT NULL,
  date DATE NOT NULL,
  
  value DECIMAL(14,4),
  direction TEXT,
  
  UNIQUE(shop_id, indicator_id, date)
);

CREATE INDEX idx_indicator_history ON indicator_history(shop_id, indicator_id, date DESC);

-- Alertit
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  
  indicator_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,            -- 'threshold_breach', 'anomaly', 'trend_change'
  severity TEXT NOT NULL,              -- 'critical', 'warning', 'info'
  
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  
  indicator_value JSONB,
  threshold_breached DECIMAL(14,4),
  
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_alerts_shop ON alerts(shop_id, created_at DESC);
CREATE INDEX idx_alerts_unack ON alerts(shop_id, acknowledged) WHERE acknowledged = false;
```

---

## 8. AI-analyysin rajapinta

### 8.1 Indikaattorien formatointi AI:lle

```typescript
interface AIAnalysisInput {
  shop: {
    id: string;
    name: string;
    domain: string;
    industry?: string;
    size?: 'small' | 'medium' | 'large';
  };
  
  analysis_date: string;
  
  indicators: {
    sales: SalesIndicatorSummary;
    seo: SEOIndicatorSummary;
    combined: CombinedIndicatorSummary;
  };
  
  alerts: Alert[];
  
  context: {
    previous_recommendations?: Recommendation[];
    seasonality_notes?: string;
    known_issues?: string[];
  };
}

interface SalesIndicatorSummary {
  trend_7d: {
    direction: string;
    change_percent: number;
    confidence: string;
  };
  trend_30d: {
    direction: string;
    change_percent: number;
  };
  aov: {
    current: number;
    change_percent: number;
  };
  top_products: {
    name: string;
    revenue: number;
    trend: string;
  }[];
  concentration_risk: string;
}

interface SEOIndicatorSummary {
  overall_trend: string;
  position_changes: {
    improved: number;
    declined: number;
  };
  opportunities: {
    query: string;
    potential_clicks: number;
    priority: string;
  }[];
  issues: {
    type: string;
    query: string;
    severity: string;
  }[];
}

interface CombinedIndicatorSummary {
  top_revenue_queries: {
    query: string;
    revenue_per_click: number;
    trend: string;
  }[];
  seo_sales_gaps: {
    product: string;
    gap_type: string;
    opportunity_value: number;
  }[];
  organic_share: {
    percentage: number;
    trend: string;
  };
}
```

### 8.2 AI Prompt Template

```typescript
const AI_ANALYSIS_PROMPT = `
Olet VilkasAnalytics-järjestelmän analyytikko. Tehtäväsi on analysoida verkkokaupan 
indikaattorit ja antaa konkreettisia, toimenpideorientoituneita suosituksia kauppiaalle.

## KAUPAN TIEDOT
Nimi: {{shop.name}}
Domain: {{shop.domain}}
{{#if shop.industry}}Toimiala: {{shop.industry}}{{/if}}

## INDIKAATTORIT

### Myynti
- Trendi (7pv): {{indicators.sales.trend_7d.direction}} ({{indicators.sales.trend_7d.change_percent}}%)
- Trendi (30pv): {{indicators.sales.trend_30d.direction}} ({{indicators.sales.trend_30d.change_percent}}%)
- Keskitilaus: {{indicators.sales.aov.current}}€ (muutos: {{indicators.sales.aov.change_percent}}%)
- Keskittymisriski: {{indicators.sales.concentration_risk}}

### SEO
- Yleinen trendi: {{indicators.seo.overall_trend}}
- Positiot paranivat: {{indicators.seo.position_changes.improved}} hakusanaa
- Positiot heikkenivät: {{indicators.seo.position_changes.declined}} hakusanaa

### Mahdollisuudet
{{#each indicators.seo.opportunities}}
- {{this.query}}: +{{this.potential_clicks}} klikkiä potentiaalia ({{this.priority}})
{{/each}}

### Yhdistetyt näkemykset
Parhaiten tuottavat hakusanat:
{{#each indicators.combined.top_revenue_queries}}
- "{{this.query}}": {{this.revenue_per_click}}€/klikki ({{this.trend}})
{{/each}}

SEO-myynti kuilut:
{{#each indicators.combined.seo_sales_gaps}}
- {{this.product}}: {{this.gap_type}}, potentiaali {{this.opportunity_value}}€
{{/each}}

## AKTIIVISET ALERTIT
{{#each alerts}}
- [{{this.severity}}] {{this.title}}: {{this.message}}
{{/each}}

## TEHTÄVÄ

Analysoi yllä olevat indikaattorit ja tuota:

1. **YHTEENVETO** (2-3 lausetta)
   Kaupan nykytila ja tärkein huomio.

2. **KRIITTISET TOIMENPITEET** (max 3)
   Asiat joihin pitää reagoida heti. Jokaiselle:
   - Mikä ongelma
   - Konkreettinen toimenpide
   - Odotettu vaikutus (€ tai %)

3. **KASVUMAHDOLLISUUDET** (max 3)
   Asiat jotka voivat tuoda lisämyyntiä. Jokaiselle:
   - Mikä mahdollisuus
   - Toimenpide
   - Arvioitu potentiaali

4. **SEURATTAVAT MITTARIT**
   Mitkä indikaattorit pitäisi tarkistaa ensi viikolla.

## VASTAUKSEN MUOTO

Vastaa suomeksi, selkeästi ja konkreettisesti. Älä käytä teknistä jargonia.
Kun puhut rahoista, käytä euroja. Kun puhut muutoksista, käytä prosentteja.
Priorisoi aina toimenpiteet jotka tuovat eniten arvoa vähimmällä vaivalla.
`;
```

### 8.3 AI Response Interface

```typescript
interface AIAnalysisOutput {
  summary: string;
  
  critical_actions: {
    issue: string;
    action: string;
    expected_impact: string;
    priority: number;
  }[];
  
  growth_opportunities: {
    opportunity: string;
    action: string;
    potential: string;
    effort: 'low' | 'medium' | 'high';
  }[];
  
  metrics_to_watch: {
    metric: string;
    current_value: string;
    watch_for: string;
  }[];
  
  generated_at: string;
  confidence: 'high' | 'medium' | 'low';
}
```

---

## 9. Alertit ja notifikaatiot

### 9.1 Alert-tyypit

```typescript
type AlertType = 
  // Myynti & konversio
  | 'sales_drop'              // Myynti laski merkittävästi
  | 'sales_spike'             // Myynti nousi merkittävästi
  | 'aov_change'              // Keskitilaus muuttui
  | 'conversion_drop'         // Konversio heikkeni
  
  // SEO
  | 'position_drop'           // SEO-positio tippui
  | 'traffic_drop'            // Orgaaninen liikenne laski
  | 'cannibalisation'         // Kannibalisaatio havaittu
  | 'high_value_query_drop'   // Arvokas hakusana heikkenee
  
  // Uudet v1.1 (palautteen perusteella)
  | 'dead_traffic'            // Sivu saa klikkejä mutta 0€ myyntiä
  | 'out_of_stock_high_seo'   // Loppu varastosta, korkea SEO-arvo
  | 'stockout_imminent'       // Tuote loppumassa, korkea SEO-arvo
  | 'ctr_drop_same_position'  // CTR laski mutta positio sama (kilpailija?)
  | 'brand_dependency_high'   // Liikaa riippuvuutta brändihauista
  | 'product_no_sales';       // Tuote ei ole myynyt X päivään

interface AlertDefinition {
  type: AlertType;
  indicator_id: string;
  
  condition: {
    field: string;
    operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'change_gt' | 'change_lt';
    value: number;
  };
  
  severity: 'critical' | 'warning' | 'info';
  
  notification: {
    email: boolean;
    dashboard: boolean;
    push: boolean;
  };
  
  cooldown_hours: number;  // Älä lähetä samaa alerttia uudelleen ennen tätä
}

const ALERT_DEFINITIONS: AlertDefinition[] = [
  {
    type: 'sales_drop',
    indicator_id: 'sales_trend',
    condition: { field: 'change_percent', operator: 'lt', value: -20 },
    severity: 'critical',
    notification: { email: true, dashboard: true, push: true },
    cooldown_hours: 24
  },
  {
    type: 'position_drop',
    indicator_id: 'query_revenue',
    condition: { field: 'position_change', operator: 'gt', value: 5 },
    severity: 'warning',
    notification: { email: false, dashboard: true, push: false },
    cooldown_hours: 48
  },
  // ... lisää määrityksiä
];
```

---

## 10. Laajennettavuus

### 10.1 Uuden indikaattorin lisääminen

1. Määrittele interface `BaseIndicator`-pohjalta
2. Implementoi laskentafunktio
3. Lisää laskenta cron job:iin
4. Lisää alertit jos tarpeen
5. Päivitä AI-promptin template
6. Lisää dashboard-näkymään

### 10.2 Uuden datalähteen lisääminen

Arkkitehtuuri tukee uusien datalähteiden lisäämistä:

- Google Analytics 4
- Meta Ads / Google Ads
- Varastonhallintajärjestelmät
- Asiakaspalvelujärjestelmät

Jokainen uusi datalähde tuo uusia indikaattoreita ja mahdollistaa uusia yhdistettyjä indikaattoreita.

---

## 11. Versiohistoria

| Versio | Päivämäärä | Muutokset |
|--------|------------|-----------|
| 1.0 | 2025-01-05 | Alkuperäinen spesifikaatio (ePages + GSC) |
| 1.1 | 2025-01-05 | GA4 lisätty behavioral datana. Data Mastership -periaate: ePages = Master kaikelle transaktionaaliselle datalle (€, tilaukset). GA4 vain suhteellisiin metriikoihin. |
| 1.2 | 2025-01-05 | SEO-asiantuntijoiden palaute huomioitu. Lisätty: Organic Conversion Rate, Stock Availability Risk, Brand vs Non-Brand. Uudet alertit: dead_traffic, out_of_stock_high_seo, stockout_imminent, ctr_drop_same_position. |

### Tuleva v2.0 (seuraava iteraatio)
- Category SEO Performance Indicator
- Paid Equivalent Value (SEO vs Ads vertailu)
- Intent Mismatch Signal
- Share of Voice (kilpailutilanteen muutos)

---

## 12. Liitteet

### A. Indikaattorien prioriteettilaskenta

```typescript
function calculatePriority(indicator: BaseIndicator): PriorityLevel {
  const { confidence, change_percent, thresholds } = indicator;
  
  // Critical jos ylittää kriittisen kynnyksen ja confidence on korkea
  if (confidence === 'high') {
    if (change_percent && thresholds.critical_low && change_percent < thresholds.critical_low) {
      return 'critical';
    }
    if (change_percent && thresholds.critical_high && change_percent > thresholds.critical_high) {
      return 'critical';
    }
  }
  
  // High jos ylittää warning-kynnyksen
  if (change_percent && thresholds.warning_low && change_percent < thresholds.warning_low) {
    return 'high';
  }
  if (change_percent && thresholds.warning_high && change_percent > thresholds.warning_high) {
    return 'high';
  }
  
  // Medium jos muutos on merkittävä mutta ei ylitä kynnyksiä
  if (change_percent && Math.abs(change_percent) > 5) {
    return 'medium';
  }
  
  return 'low';
}
```

### B. Sesonkikorjauskertoimet (esimerkki)

```typescript
const SEASONAL_FACTORS: Record<string, Record<number, number>> = {
  // Kuukausi -> kerroin (1.0 = normaali)
  'general_retail': {
    1: 0.85,   // Tammikuu: -15%
    2: 0.90,
    3: 0.95,
    4: 1.00,
    5: 1.00,
    6: 0.95,
    7: 0.90,   // Heinäkuu: lomat
    8: 0.95,
    9: 1.00,
    10: 1.05,
    11: 1.15,  // Black Friday
    12: 1.30   // Joulu
  }
};
```
