# KPI Index Engine - Tekninen Toteutussuunnitelma

**Versio:** 1.0
**Päivitetty:** 2026-01-07
**Projekti:** VilkasAnalytics
**Supabase:** tlothekaphtiwvusgwzh

---

## 1. Yleiskatsaus

### 1.1 Tavoite

Rakennetaan **indeksipohjainen analytiikkakerros** joka:
- Tiivistää liiketoiminnan tilan **4 indeksiksi (0-100)**
- Toimii dashboardin ytimenä
- Syöttää AI-agentille rakenteisen kontekstin
- Perustuu olemassa olevaan Supabase-dataan

### 1.2 Arkkitehtuuriperiaatteet

```
❌ Ei "32 KPI:tä" → ✅ 4 indeksiä
❌ Ei klikkejä → ✅ Eurot ensin
❌ Ei absoluuttisia lukuja → ✅ Suhteelliset indeksit (0-100)
❌ Ei Billackering-spesifejä → ✅ Geneerinen ratkaisu
```

### 1.3 MVP vs Phase 2

| Phase 1 (MVP) | Phase 2 (Myöhemmin) |
|---------------|---------------------|
| CORE INDEX | + GQI (Growth Quality Index) |
| PPI (Product Profitability) | + CLV/CAC-suhde |
| SPI (SEO Performance) | + €-attribuutio SEO:lle |
| OI (Operational) | + Kiertonopeus (vaatii historiaa) |
| | + Marketing Costs (Meta/Google Ads API) |

---

## 2. Tietokantarakenne

### 2.1 Uudet taulut

#### 2.1.1 `kpi_index_snapshots` (Pää-indeksitaulu)

```sql
CREATE TABLE kpi_index_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

    -- Aikajakso
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    granularity TEXT NOT NULL CHECK (granularity IN ('week', 'month')),

    -- Indeksit (0-100)
    core_index DECIMAL(5,2),
    product_profitability_index DECIMAL(5,2),
    seo_performance_index DECIMAL(5,2),
    operational_index DECIMAL(5,2),

    -- Yhdistetty kokonaisindeksi
    overall_index DECIMAL(5,2),

    -- Muutokset edellisestä jaksosta
    core_index_delta DECIMAL(5,2),
    ppi_delta DECIMAL(5,2),
    spi_delta DECIMAL(5,2),
    oi_delta DECIMAL(5,2),

    -- Raakadata JSON-muodossa (debug + AI context)
    raw_metrics JSONB,

    -- Hälytykset
    alerts TEXT[],

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(store_id, period_end, granularity)
);

CREATE INDEX idx_kpi_snapshots_store_period
ON kpi_index_snapshots(store_id, period_end DESC);

COMMENT ON TABLE kpi_index_snapshots IS
'Pääindeksitaulu: viikko/kuukausi-snapshotit kaikista KPI-indekseistä';
```

#### 2.1.2 `inventory_snapshots` (Varastohistoria - Phase 2 valmius)

```sql
CREATE TABLE inventory_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

    snapshot_date DATE NOT NULL,

    stock_level INTEGER NOT NULL DEFAULT 0,
    stock_value DECIMAL(12,2),  -- stock_level * cost_price

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(store_id, product_id, snapshot_date)
);

CREATE INDEX idx_inventory_snapshots_store_date
ON inventory_snapshots(store_id, snapshot_date DESC);

COMMENT ON TABLE inventory_snapshots IS
'Päivittäiset varastosnapshotit kiertonopeuden laskentaa varten (Phase 2)';
```

#### 2.1.3 `product_profitability` (SKU-tason kannattavuus)

```sql
CREATE TABLE product_profitability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

    -- Aikajakso
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- Indeksit (0-100)
    margin_index DECIMAL(5,2),
    sales_index DECIMAL(5,2),
    stock_efficiency_index DECIMAL(5,2),
    total_score DECIMAL(5,2),

    -- Raakametriikat
    revenue DECIMAL(12,2),
    cost DECIMAL(12,2),
    margin_percent DECIMAL(5,2),
    units_sold INTEGER,
    stock_days DECIMAL(5,1),  -- Varaston peitto päivinä

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(store_id, product_id, period_end)
);

CREATE INDEX idx_product_profitability_store_period
ON product_profitability(store_id, period_end DESC);

COMMENT ON TABLE product_profitability IS
'SKU-tason kannattavuusindeksit Product Profitability Index (PPI) laskentaa varten';
```

#### 2.1.4 `seo_performance_metrics` (SEO-metriikat korrelaatiolaskentaan)

```sql
CREATE TABLE seo_performance_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

    -- Aikajakso
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- GSC-metriikat
    total_clicks INTEGER,
    total_impressions INTEGER,
    avg_position DECIMAL(5,2),
    avg_ctr DECIMAL(7,4),

    -- Trendit (vs edellinen jakso)
    clicks_trend_percent DECIMAL(5,2),
    impressions_trend_percent DECIMAL(5,2),
    position_trend DECIMAL(5,2),  -- Negatiivinen = parantunut

    -- Segmentointi
    brand_clicks INTEGER,
    nonbrand_clicks INTEGER,
    brand_percent DECIMAL(5,2),

    -- Nousevat haut (impressions ↑ mutta clicks ↓ tai vakaa)
    rising_queries_count INTEGER,
    rising_queries JSONB,  -- Top 10 nousevaa hakua

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(store_id, period_end)
);

COMMENT ON TABLE seo_performance_metrics IS
'Aggregoidut SEO-metriikat korrelaatiolaskentaan (ei €-attribuutiota)';
```

#### 2.1.5 `ai_context_snapshots` (AI-agentin konteksti)

```sql
CREATE TABLE ai_context_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

    period_label TEXT NOT NULL,  -- '2026-W02' tai '2026-01'
    granularity TEXT NOT NULL CHECK (granularity IN ('week', 'month')),

    -- Strukturoitu konteksti AI:lle
    context JSONB NOT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(store_id, period_label, granularity)
);

COMMENT ON TABLE ai_context_snapshots IS
'Strukturoitu JSON-konteksti AI-agentille (Emma/Esko)';
```

#### 2.1.6 `marketing_costs` (Phase 2 - valmius)

```sql
-- PHASE 2: Ei toteuteta MVP:ssä, mutta arkkitehtuuri valmiina
CREATE TABLE marketing_costs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

    -- Aikajakso
    date DATE NOT NULL,

    -- Kanava
    channel TEXT NOT NULL,  -- 'meta', 'google_ads', 'tiktok', 'manual'
    campaign_id TEXT,
    campaign_name TEXT,

    -- Kustannukset
    spend DECIMAL(10,2) NOT NULL,
    currency TEXT DEFAULT 'SEK',

    -- Metriikat (API:sta)
    impressions INTEGER,
    clicks INTEGER,
    conversions INTEGER,

    -- Lähde
    source TEXT DEFAULT 'manual',  -- 'api', 'manual', 'import'

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(store_id, date, channel, campaign_id)
);

COMMENT ON TABLE marketing_costs IS
'Phase 2: Markkinointikustannukset Meta/Google Ads API:sta tai manuaalisesti';
```

---

## 3. Indeksien laskentakaavat

### 3.1 Normalisointi (0-100)

Kaikki indeksit normalisoidaan **suhteellisesti 3 kk dataan**:

```javascript
/**
 * Normalisoi arvo 0-100 asteikolle käyttäen 3kk historiaa
 *
 * @param {number} value - Nykyinen arvo
 * @param {number[]} history - 3kk historiadata (päivittäin tai viikoittain)
 * @param {boolean} higherIsBetter - Onko korkeampi arvo parempi
 * @returns {number} Normalisoitu arvo 0-100
 */
function normalizeToIndex(value, history, higherIsBetter = true) {
    if (!history || history.length === 0) return 50; // Oletusarvo

    // Laske mediaani ja keskihajonta
    const sorted = [...history].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const mean = history.reduce((a, b) => a + b, 0) / history.length;
    const stdDev = Math.sqrt(
        history.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / history.length
    );

    // Z-score
    const zScore = stdDev > 0 ? (value - median) / stdDev : 0;

    // Muunna 0-100 asteikolle
    // mediaani = 50, +1 SD = 75, +2 SD = 100, -1 SD = 25, -2 SD = 0
    let index = 50 + (zScore * 25);

    // Käännä jos pienempi on parempi (esim. position, läpimenoaika)
    if (!higherIsBetter) {
        index = 100 - index + 50; // Peilaa 50:n ympäri
    }

    // Rajaa 0-100
    return Math.max(0, Math.min(100, Math.round(index)));
}
```

### 3.2 CORE INDEX (Business Health)

```javascript
/**
 * CORE INDEX - Liiketoiminnan terveysindeksi
 *
 * Painotus:
 * - Katetuotto € (30%)
 * - AOV (20%)
 * - Repeat Purchase Rate (20%)
 * - Myynnin trendi (20%)
 * - Out-of-stock % (10%)
 */
function calculateCoreIndex(data, history) {
    const {
        grossProfit,          // € katetuotto jaksolla
        aov,                  // Keskiostos
        repeatPurchaseRate,   // % asiakkaista jotka ostaneet >1 kertaa
        revenueTrendPercent,  // % muutos edellisestä jaksosta
        outOfStockPercent     // % tuotteista joilla stock_level = 0
    } = data;

    // Normalisoi jokainen komponentti
    const grossProfitIndex = normalizeToIndex(grossProfit, history.grossProfit, true);
    const aovIndex = normalizeToIndex(aov, history.aov, true);
    const repeatIndex = normalizeToIndex(repeatPurchaseRate, history.repeatRate, true);

    // Trendi: +10% = 75, 0% = 50, -10% = 25
    const trendIndex = Math.max(0, Math.min(100, 50 + (revenueTrendPercent * 2.5)));

    // Out-of-stock: 0% = 100, 10% = 50, 20% = 0 (pienempi on parempi)
    const stockIndex = Math.max(0, Math.min(100, 100 - (outOfStockPercent * 5)));

    // Painotettu keskiarvo
    const coreIndex = (
        grossProfitIndex * 0.30 +
        aovIndex * 0.20 +
        repeatIndex * 0.20 +
        trendIndex * 0.20 +
        stockIndex * 0.10
    );

    return {
        index: Math.round(coreIndex),
        components: {
            gross_profit: { value: grossProfit, index: grossProfitIndex, weight: 0.30 },
            aov: { value: aov, index: aovIndex, weight: 0.20 },
            repeat_rate: { value: repeatPurchaseRate, index: repeatIndex, weight: 0.20 },
            revenue_trend: { value: revenueTrendPercent, index: trendIndex, weight: 0.20 },
            stock_availability: { value: 100 - outOfStockPercent, index: stockIndex, weight: 0.10 }
        }
    };
}
```

### 3.3 PRODUCT PROFITABILITY INDEX (PPI)

```javascript
/**
 * PRODUCT PROFITABILITY INDEX - Tuotekannattavuusindeksi
 *
 * Lasketaan SKU-tasolla, aggregoidaan kokonaisindeksiksi.
 * Tunnistaa: top_profit_drivers[], capital_traps[]
 */
function calculatePPI(products, orders, history) {
    const productScores = [];

    for (const product of products) {
        const productOrders = getProductOrders(orders, product.id);

        // 1. Kate-indeksi (30%)
        const marginPercent = product.cost_price && product.price_amount
            ? ((product.price_amount - product.cost_price) / product.price_amount) * 100
            : 40; // Oletus 40% jos cost_price puuttuu
        const marginIndex = normalizeToIndex(marginPercent, history.margins, true);

        // 2. Myynti-indeksi (40%)
        const revenue = productOrders.reduce((sum, o) => sum + o.total_price, 0);
        const salesIndex = normalizeToIndex(revenue, history.revenues, true);

        // 3. Varastotehokkuus-indeksi (30%)
        // Varaston peitto päivinä = stock_level / (units_sold / days_in_period)
        const unitsSold = productOrders.reduce((sum, o) => sum + o.quantity, 0);
        const dailySales = unitsSold / 30; // Oletus 30 päivän jakso
        const stockDays = dailySales > 0
            ? product.stock_level / dailySales
            : (product.stock_level > 0 ? 999 : 0);

        // Optimi: 30-60 päivää. Alle 14 = riski, yli 90 = pääomaloukkuu
        let stockEfficiencyIndex;
        if (stockDays >= 30 && stockDays <= 60) {
            stockEfficiencyIndex = 100;
        } else if (stockDays < 30) {
            stockEfficiencyIndex = Math.max(0, stockDays * (100/30));
        } else {
            stockEfficiencyIndex = Math.max(0, 100 - ((stockDays - 60) * 0.5));
        }

        // Kokonaispistemäärä
        const totalScore = (
            marginIndex * 0.30 +
            salesIndex * 0.40 +
            stockEfficiencyIndex * 0.30
        );

        productScores.push({
            product_id: product.id,
            product_name: product.name,
            sku: product.product_number,
            margin_index: Math.round(marginIndex),
            sales_index: Math.round(salesIndex),
            stock_efficiency_index: Math.round(stockEfficiencyIndex),
            total_score: Math.round(totalScore),
            raw: { revenue, marginPercent, stockDays, unitsSold }
        });
    }

    // Aggregoi kokonaisindeksi (painotettu myynnillä)
    const totalRevenue = productScores.reduce((sum, p) => sum + p.raw.revenue, 0);
    const weightedIndex = productScores.reduce((sum, p) => {
        const weight = totalRevenue > 0 ? p.raw.revenue / totalRevenue : 1 / productScores.length;
        return sum + (p.total_score * weight);
    }, 0);

    // Tunnista top drivers ja capital traps
    const sorted = [...productScores].sort((a, b) => b.total_score - a.total_score);
    const topDrivers = sorted.slice(0, 10);
    const capitalTraps = sorted
        .filter(p => p.stock_efficiency_index < 30 && p.raw.stockDays > 90)
        .slice(0, 10);

    return {
        index: Math.round(weightedIndex),
        product_count: productScores.length,
        top_profit_drivers: topDrivers,
        capital_traps: capitalTraps,
        products: productScores
    };
}
```

### 3.4 SEO PERFORMANCE INDEX (SPI)

```javascript
/**
 * SEO PERFORMANCE INDEX - SEO-suorituskykyindeksi
 *
 * Perustuu GSC-dataan, EI €-attribuutiota (korrelaatio)
 *
 * Painotus:
 * - Klikkien trendi (30%)
 * - Position-muutokset (30%)
 * - Non-brand osuus (25%)
 * - Nousevat haut (15%)
 */
function calculateSPI(gscData, history) {
    const {
        clicksTrend,          // % muutos klikeissä
        avgPositionChange,    // Positiomuutos (negatiivinen = parantunut)
        nonBrandPercent,      // % non-brand hauista
        risingQueriesCount    // Nousevien hakujen määrä
    } = gscData;

    // 1. Klikkitrendi-indeksi (30%)
    // +20% = 100, 0% = 50, -20% = 0
    const clicksTrendIndex = Math.max(0, Math.min(100, 50 + (clicksTrend * 2.5)));

    // 2. Positio-indeksi (30%)
    // -2 (parantunut) = 100, 0 = 50, +2 (heikentynyt) = 0
    const positionIndex = Math.max(0, Math.min(100, 50 - (avgPositionChange * 25)));

    // 3. Non-brand indeksi (25%)
    // Tavoite: 40-70% non-brand on tervettä
    // 50% = 100, 20% = 50, 80% = 70 (liikaa voi tarkoittaa heikkoa brändiä)
    let nonBrandIndex;
    if (nonBrandPercent >= 40 && nonBrandPercent <= 70) {
        nonBrandIndex = 100;
    } else if (nonBrandPercent < 40) {
        nonBrandIndex = nonBrandPercent * (100/40);
    } else {
        nonBrandIndex = Math.max(50, 100 - ((nonBrandPercent - 70) * 1.5));
    }

    // 4. Nousevat haut -indeksi (15%)
    // Normalisoidaan historiaan
    const risingIndex = normalizeToIndex(risingQueriesCount, history.risingQueries, true);

    // Painotettu keskiarvo
    const spiIndex = (
        clicksTrendIndex * 0.30 +
        positionIndex * 0.30 +
        nonBrandIndex * 0.25 +
        risingIndex * 0.15
    );

    return {
        index: Math.round(spiIndex),
        components: {
            clicks_trend: { value: clicksTrend, index: clicksTrendIndex, weight: 0.30 },
            position: { value: avgPositionChange, index: positionIndex, weight: 0.30 },
            non_brand: { value: nonBrandPercent, index: nonBrandIndex, weight: 0.25 },
            rising_queries: { value: risingQueriesCount, index: risingIndex, weight: 0.15 }
        }
    };
}
```

### 3.5 OPERATIONAL INDEX (OI)

```javascript
/**
 * OPERATIONAL INDEX - Operatiivinen tehokkuusindeksi
 *
 * Painotus:
 * - Läpimenoaika (40%)
 * - Out-of-stock % (35%)
 * - Sesonkipoikkeama (25%)
 */
function calculateOI(orders, products, history) {
    // 1. Läpimenoaika (40%)
    // creation_date → dispatched_on
    const fulfillmentTimes = orders
        .filter(o => o.dispatched_on && o.creation_date)
        .map(o => {
            const created = new Date(o.creation_date);
            const dispatched = new Date(o.dispatched_on);
            return (dispatched - created) / (1000 * 60 * 60 * 24); // Päivinä
        });

    const avgFulfillmentDays = fulfillmentTimes.length > 0
        ? fulfillmentTimes.reduce((a, b) => a + b, 0) / fulfillmentTimes.length
        : 0;

    // Tavoite: 1 päivä = 100, 3 päivää = 50, 7 päivää = 0
    const fulfillmentIndex = Math.max(0, Math.min(100, 100 - ((avgFulfillmentDays - 1) * 16.67)));

    // 2. Out-of-stock (35%)
    const outOfStockCount = products.filter(p => p.stock_level === 0 && p.for_sale).length;
    const totalProducts = products.filter(p => p.for_sale).length;
    const outOfStockPercent = totalProducts > 0 ? (outOfStockCount / totalProducts) * 100 : 0;

    // 0% = 100, 5% = 75, 10% = 50, 20% = 0
    const stockIndex = Math.max(0, Math.min(100, 100 - (outOfStockPercent * 5)));

    // 3. Sesonkipoikkeama (25%)
    // Vertaa nykyistä myyntiä odotettuun (3kk trendi)
    const currentRevenue = orders.reduce((sum, o) => sum + parseFloat(o.grand_total || 0), 0);
    const expectedRevenue = history.revenue.length > 0
        ? history.revenue.reduce((a, b) => a + b, 0) / history.revenue.length
        : currentRevenue;

    const deviationPercent = expectedRevenue > 0
        ? ((currentRevenue - expectedRevenue) / expectedRevenue) * 100
        : 0;

    // ±10% = 100 (normaali), ±30% = 50, ±50% = 0 (suuri poikkeama)
    const absDeviation = Math.abs(deviationPercent);
    const seasonalIndex = Math.max(0, Math.min(100, 100 - (absDeviation * 2)));

    // Painotettu keskiarvo
    const oiIndex = (
        fulfillmentIndex * 0.40 +
        stockIndex * 0.35 +
        seasonalIndex * 0.25
    );

    return {
        index: Math.round(oiIndex),
        components: {
            fulfillment: { value: avgFulfillmentDays, index: fulfillmentIndex, weight: 0.40 },
            stock_availability: { value: 100 - outOfStockPercent, index: stockIndex, weight: 0.35 },
            seasonal_stability: { value: 100 - absDeviation, index: seasonalIndex, weight: 0.25 }
        },
        alerts: {
            slow_fulfillment: avgFulfillmentDays > 3,
            high_out_of_stock: outOfStockPercent > 10,
            unusual_deviation: absDeviation > 30
        }
    };
}
```

---

## 4. RPC-funktiot

### 4.1 `calculate_kpi_snapshot`

```sql
CREATE OR REPLACE FUNCTION calculate_kpi_snapshot(
    p_store_id UUID,
    p_period_end DATE DEFAULT CURRENT_DATE,
    p_granularity TEXT DEFAULT 'week'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_period_start DATE;
    v_snapshot_id UUID;
    v_core_index DECIMAL;
    v_ppi DECIMAL;
    v_spi DECIMAL;
    v_oi DECIMAL;
    v_overall DECIMAL;
    v_raw_metrics JSONB;
    v_alerts TEXT[];
BEGIN
    -- Määritä jakson alku
    IF p_granularity = 'week' THEN
        v_period_start := p_period_end - INTERVAL '6 days';
    ELSE
        v_period_start := DATE_TRUNC('month', p_period_end)::DATE;
    END IF;

    -- Laske indeksit (kutsuu helper-funktioita)
    v_core_index := calculate_core_index(p_store_id, v_period_start, p_period_end);
    v_ppi := calculate_ppi(p_store_id, v_period_start, p_period_end);
    v_spi := calculate_spi(p_store_id, v_period_start, p_period_end);
    v_oi := calculate_oi(p_store_id, v_period_start, p_period_end);

    -- Kokonaisindeksi (painotettu keskiarvo)
    v_overall := (v_core_index * 0.35 + v_ppi * 0.25 + v_spi * 0.20 + v_oi * 0.20);

    -- Kerää hälytykset
    v_alerts := ARRAY[]::TEXT[];
    IF v_core_index < 40 THEN v_alerts := v_alerts || 'core_health_warning'; END IF;
    IF v_ppi < 40 THEN v_alerts := v_alerts || 'profitability_warning'; END IF;
    IF v_spi < 40 THEN v_alerts := v_alerts || 'seo_warning'; END IF;
    IF v_oi < 40 THEN v_alerts := v_alerts || 'operational_warning'; END IF;

    -- Tallenna snapshot (upsert)
    INSERT INTO kpi_index_snapshots (
        store_id, period_start, period_end, granularity,
        core_index, product_profitability_index, seo_performance_index, operational_index,
        overall_index, alerts, raw_metrics
    )
    VALUES (
        p_store_id, v_period_start, p_period_end, p_granularity,
        v_core_index, v_ppi, v_spi, v_oi,
        v_overall, v_alerts, v_raw_metrics
    )
    ON CONFLICT (store_id, period_end, granularity)
    DO UPDATE SET
        core_index = EXCLUDED.core_index,
        product_profitability_index = EXCLUDED.product_profitability_index,
        seo_performance_index = EXCLUDED.seo_performance_index,
        operational_index = EXCLUDED.operational_index,
        overall_index = EXCLUDED.overall_index,
        alerts = EXCLUDED.alerts,
        raw_metrics = EXCLUDED.raw_metrics,
        created_at = NOW()
    RETURNING id INTO v_snapshot_id;

    RETURN v_snapshot_id;
END;
$$;
```

### 4.2 `get_kpi_dashboard`

```sql
CREATE OR REPLACE FUNCTION get_kpi_dashboard(
    p_store_id UUID,
    p_granularity TEXT DEFAULT 'week'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current RECORD;
    v_previous RECORD;
    v_result JSONB;
BEGIN
    -- Hae viimeisin snapshot
    SELECT * INTO v_current
    FROM kpi_index_snapshots
    WHERE store_id = p_store_id AND granularity = p_granularity
    ORDER BY period_end DESC
    LIMIT 1;

    -- Hae edellinen snapshot (vertailuun)
    SELECT * INTO v_previous
    FROM kpi_index_snapshots
    WHERE store_id = p_store_id
      AND granularity = p_granularity
      AND period_end < v_current.period_end
    ORDER BY period_end DESC
    LIMIT 1;

    -- Rakenna vastaus
    v_result := jsonb_build_object(
        'period', jsonb_build_object(
            'start', v_current.period_start,
            'end', v_current.period_end,
            'granularity', p_granularity
        ),
        'indexes', jsonb_build_object(
            'overall', v_current.overall_index,
            'core', v_current.core_index,
            'ppi', v_current.product_profitability_index,
            'spi', v_current.seo_performance_index,
            'oi', v_current.operational_index
        ),
        'deltas', jsonb_build_object(
            'overall', v_current.overall_index - COALESCE(v_previous.overall_index, v_current.overall_index),
            'core', v_current.core_index - COALESCE(v_previous.core_index, v_current.core_index),
            'ppi', v_current.product_profitability_index - COALESCE(v_previous.product_profitability_index, v_current.product_profitability_index),
            'spi', v_current.seo_performance_index - COALESCE(v_previous.seo_performance_index, v_current.seo_performance_index),
            'oi', v_current.operational_index - COALESCE(v_previous.operational_index, v_current.operational_index)
        ),
        'alerts', v_current.alerts,
        'calculated_at', v_current.created_at
    );

    RETURN v_result;
END;
$$;
```

### 4.3 `generate_ai_context`

```sql
CREATE OR REPLACE FUNCTION generate_ai_context(
    p_store_id UUID,
    p_granularity TEXT DEFAULT 'week'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_dashboard JSONB;
    v_top_products JSONB;
    v_alerts JSONB;
    v_context JSONB;
    v_period_label TEXT;
BEGIN
    -- Hae dashboard-data
    v_dashboard := get_kpi_dashboard(p_store_id, p_granularity);

    -- Hae top tuotteet
    SELECT jsonb_agg(jsonb_build_object(
        'name', product_name,
        'score', total_score,
        'margin', margin_index,
        'sales', sales_index
    ))
    INTO v_top_products
    FROM (
        SELECT product_name, total_score, margin_index, sales_index
        FROM product_profitability pp
        JOIN products p ON pp.product_id = p.id
        WHERE pp.store_id = p_store_id
        ORDER BY total_score DESC
        LIMIT 5
    ) t;

    -- Muodosta period label
    IF p_granularity = 'week' THEN
        v_period_label := TO_CHAR(CURRENT_DATE, 'IYYY-"W"IW');
    ELSE
        v_period_label := TO_CHAR(CURRENT_DATE, 'YYYY-MM');
    END IF;

    -- Rakenna AI-konteksti
    v_context := jsonb_build_object(
        'period', v_period_label,
        'granularity', p_granularity,
        'indexes', v_dashboard->'indexes',
        'deltas', v_dashboard->'deltas',
        'alerts', v_dashboard->'alerts',
        'top_products', COALESCE(v_top_products, '[]'::jsonb),
        'generated_at', NOW()
    );

    -- Tallenna konteksti
    INSERT INTO ai_context_snapshots (store_id, period_label, granularity, context)
    VALUES (p_store_id, v_period_label, p_granularity, v_context)
    ON CONFLICT (store_id, period_label, granularity)
    DO UPDATE SET context = EXCLUDED.context, created_at = NOW();

    RETURN v_context;
END;
$$;
```

---

## 5. Varastosnapshotit (aloitetaan heti)

### 5.1 Päivittäinen snapshot-funktio

```sql
CREATE OR REPLACE FUNCTION create_daily_inventory_snapshot(
    p_store_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    INSERT INTO inventory_snapshots (store_id, product_id, snapshot_date, stock_level, stock_value)
    SELECT
        p.store_id,
        p.id,
        CURRENT_DATE,
        COALESCE(p.stock_level, 0),
        COALESCE(p.stock_level, 0) * COALESCE(p.cost_price, 0)
    FROM products p
    WHERE p.for_sale = true
      AND (p_store_id IS NULL OR p.store_id = p_store_id)
    ON CONFLICT (store_id, product_id, snapshot_date)
    DO UPDATE SET
        stock_level = EXCLUDED.stock_level,
        stock_value = EXCLUDED.stock_value;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;
```

### 5.2 Cron-job (pg_cron tai Edge Function)

```sql
-- Vaihtoehto 1: pg_cron (jos käytössä)
SELECT cron.schedule(
    'daily-inventory-snapshot',
    '0 2 * * *',  -- Joka yö klo 02:00
    $$SELECT create_daily_inventory_snapshot()$$
);

-- Vaihtoehto 2: Edge Function + Supabase Cron
-- Katso /supabase/functions/daily-snapshot/index.ts
```

---

## 6. Tiedostorakenne

```
src/lib/kpi/
├── index.js                    # Pääexportti
├── types.js                    # TypeScript-tyypit
├── normalizer.js               # Normalisointifunktiot
├── calculators/
│   ├── coreIndex.js           # CORE INDEX laskenta
│   ├── ppi.js                 # Product Profitability Index
│   ├── spi.js                 # SEO Performance Index
│   └── oi.js                  # Operational Index
├── aggregators/
│   ├── weeklySnapshot.js      # Viikkosnapshot
│   └── monthlySnapshot.js     # Kuukausisnapshot
└── aiContext.js               # AI-kontekstin generointi

scripts/
├── calculate_kpi.cjs          # CLI: Laske KPI:t
├── create_inventory_snapshot.cjs  # CLI: Varastosnapshot
└── migrate_kpi_tables.cjs     # Migraatioajo
```

---

## 7. Migraatio-järjestys

```bash
# 1. Luo taulut
supabase migration new create_kpi_tables

# 2. Aja migraatio
supabase db push

# 3. Aloita varastosnapshotit
node scripts/create_inventory_snapshot.cjs

# 4. Testaa laskenta
node scripts/calculate_kpi.cjs --store-id=xxx --period=week
```

---

## 8. Phase 2 -valmius (checklist)

| Komponentti | MVP-tila | Phase 2 -vaatimus |
|-------------|----------|-------------------|
| `marketing_costs` taulu | ✅ Luotu (tyhjä) | Meta/Google Ads API integraatio |
| `inventory_snapshots` | ✅ Aloitettu | 30+ päivää dataa → kiertonopeus |
| GQI (Growth Quality Index) | ❌ Ei toteuteta | CAC-data vaaditaan |
| SEO €-attribuutio | ❌ Korrelaatio | UTM tracking tai session matching |
| Bundle-analyysi | ❌ Ei toteuteta | Tuoterakenteen laajennus |

---

## 9. Aikataulu-arvio

| Vaihe | Kesto | Sisältö |
|-------|-------|---------|
| **Taulut + migraatiot** | 1 päivä | SQL, indeksit, RLS |
| **Varastosnapshot** | 0.5 päivää | Funktio + cron |
| **Core Index** | 1 päivä | Laskenta + testaus |
| **PPI** | 1.5 päivää | SKU-taso + aggregointi |
| **SPI** | 1 päivä | GSC-integraatio |
| **OI** | 0.5 päivää | Yksinkertaisin |
| **AI Context** | 0.5 päivää | JSON-generointi |
| **Dashboard RPC** | 0.5 päivää | get_kpi_dashboard |
| **Testaus + debug** | 1 päivä | End-to-end |
| **YHTEENSÄ** | **~7-8 työpäivää** | |

---

## 10. Avoimet kysymykset

1. **Granulariteetti**: Aloitetaanko viikko- vai kuukausitasolla?
2. **Historiadata**: Onko 3 kk dataa olemassa kaikille metriikoille?
3. **Cron**: Käytetäänkö pg_cronia vai Edge Function + external cron?
4. **UI**: Tehdäänkö uusi sivu vai korvataan nykyinen IndicatorsPage?

---

**Dokumentin status:** VALMIS ARVIOINTIIN
**Seuraava vaihe:** Käyttäjän hyväksyntä → Toteutus
