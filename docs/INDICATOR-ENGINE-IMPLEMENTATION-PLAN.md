# Indicator Engine - Toteutussuunnitelma

> **⚠️ HUOM: Tämä dokumentti on VANHENTUNUT (2026-01-26)**
>
> Alkuperäinen suunnitelma korvattiin **Growth Engine** -toteutuksella.
>
> **Nykyinen toteutus:**
> - `src/hooks/useGrowthEngine.js` - 4 KPI-aluetta, 13 metriikkaa
> - YoY-pohjainen pisteytys (0-100)
> - Katso: `docs/INTEGRATIONS.md` → "Growth Engine" -osio
>
> Tämä dokumentti säilytetään historiallisena referenssinä.

---

**Päivämäärä:** 2026-01-05
**Status:** ARKISTOITU

---

## 1. Tavoite

Toteuttaa speksin (VILKAS-ANALYTICS-INDICATORS-SPEC-v1.2.md) mukainen Indicator Engine, joka:
- Laskee indikaattorit ePages + GSC datasta
- Tallentaa lasketut arvot tietokantaan
- Tarjoaa frontend-hookille valmiit indikaattorit
- Mahdollistaa AI-analyysin (Emma) kontekstiksi

---

## 2. MVP-indikaattorit (7 kpl)

| # | Indikaattori | Datalähde | Prioriteetti | Kuvaus |
|---|--------------|-----------|--------------|--------|
| 1 | **sales_trend** | ePages | HIGH | Myynnin kehityssuunta (7d/30d/90d) |
| 2 | **aov** | ePages | HIGH | Keskiostoksen arvo ja trendi |
| 3 | **gross_margin** | ePages | HIGH | Myyntikate (vaatii ostohinta-kentän!) |
| 4 | **position_change** | GSC | MEDIUM | SEO-positiomuutokset |
| 5 | **organic_conversion_rate** | GSC + ePages | **CRITICAL** | Orgaanisen liikenteen konversio |
| 6 | **stock_availability_risk** | ePages + GSC | **CRITICAL** | Varastoriski SEO-tuotteille |
| 7 | **brand_vs_nonbrand** | GSC | MEDIUM | Brändihaut vs. geneeriset |

---

## 3. Tietokantamuutokset

### 3.1 Uusi taulu: `calculated_indicators`

```sql
CREATE TABLE calculated_indicators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  -- Indikaattorin tunniste
  indicator_id TEXT NOT NULL,  -- 'sales_trend', 'aov', 'gross_margin', etc.

  -- Aikajakso
  period_label TEXT NOT NULL,  -- '7d', '30d', '90d'
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  comparison_period_start DATE,
  comparison_period_end DATE,

  -- Arvo (speksin mukainen rakenne)
  value JSONB NOT NULL,

  -- Metadata
  confidence TEXT DEFAULT 'high',  -- 'high', 'medium', 'low'
  priority TEXT DEFAULT 'medium',  -- 'critical', 'high', 'medium', 'low'
  alert_triggered BOOLEAN DEFAULT false,

  -- Timestamps
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  data_freshness TIMESTAMPTZ,

  -- Uniikki per store + indikaattori + jakso
  UNIQUE(store_id, indicator_id, period_label, period_end)
);

-- Indeksit
CREATE INDEX idx_calc_ind_store ON calculated_indicators(store_id);
CREATE INDEX idx_calc_ind_type ON calculated_indicators(indicator_id);
CREATE INDEX idx_calc_ind_date ON calculated_indicators(period_end DESC);
```

### 3.2 Products-taulun laajennus (myyntikate)

```sql
-- Lisää ostohinta tuotteille
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_currency TEXT DEFAULT 'EUR';

-- Kommentti
COMMENT ON COLUMN products.cost_price IS 'Tuotteen ostohinta/hankintahinta myyntikatteen laskentaan';
```

**HUOM:** ePages API:sta pitää tarkistaa palauttaako se `depositPrice`, `manufacturerPrice` tai vastaavaa. Jos ei, ostohinta pitää syöttää manuaalisesti tai tuoda CSV:stä.

---

## 4. Backend-arkkitehtuuri

### 4.1 Kansiorakenne

```
src/lib/indicators/
├── types.ts                    # TypeScript-tyypit (BaseIndicator, etc.)
├── constants.ts                # Kynnysarvot, aikaikkunat
├── utils/
│   ├── periodUtils.ts          # Aikajaksojen laskenta
│   ├── confidenceUtils.ts      # Luotettavuuden määritys
│   └── alertUtils.ts           # Alerttien generointi
├── calculators/
│   ├── salesTrend.ts           # sales_trend
│   ├── aov.ts                  # aov
│   ├── grossMargin.ts          # gross_margin (UUSI)
│   ├── positionChange.ts       # position_change
│   ├── organicConversionRate.ts # organic_conversion_rate
│   ├── stockAvailabilityRisk.ts # stock_availability_risk
│   └── brandVsNonBrand.ts      # brand_vs_nonbrand
├── engine.ts                   # Orchestrator (ajaa kaikki laskennat)
└── index.ts                    # Export
```

### 4.2 RPC-funktiot (Supabase)

```sql
-- Laske kaikki indikaattorit storelle
CREATE OR REPLACE FUNCTION calculate_all_indicators(
  p_store_id UUID,
  p_period_label TEXT DEFAULT '30d'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB := '[]'::jsonb;
BEGIN
  -- Kutsu jokaista indikaattorilaskentaa
  -- Tallenna tulokset calculated_indicators-tauluun
  -- Palauta yhteenveto
  RETURN v_result;
END;
$$;

-- Hae lasketut indikaattorit
CREATE OR REPLACE FUNCTION get_indicators(
  p_store_id UUID,
  p_period_label TEXT DEFAULT '30d'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN (
    SELECT jsonb_agg(
      jsonb_build_object(
        'indicator_id', indicator_id,
        'value', value,
        'confidence', confidence,
        'priority', priority,
        'alert_triggered', alert_triggered,
        'calculated_at', calculated_at
      )
    )
    FROM calculated_indicators
    WHERE store_id = p_store_id
    AND period_label = p_period_label
    AND period_end = (
      SELECT MAX(period_end)
      FROM calculated_indicators
      WHERE store_id = p_store_id
      AND period_label = p_period_label
    )
  );
END;
$$;
```

---

## 5. Indikaattorikohtaiset speksit

### 5.1 sales_trend

**Input:** orders-taulu
**Output:**
```json
{
  "value": "growing",  // 'growing' | 'declining' | 'stable'
  "metrics": {
    "current_revenue": 125000,
    "previous_revenue": 110000,
    "change_percent": 13.6,
    "current_orders": 450,
    "previous_orders": 420,
    "daily_average": 4166
  },
  "direction": "up",
  "thresholds": {
    "critical_high": 30,
    "warning_high": 15,
    "warning_low": -15,
    "critical_low": -30
  }
}
```

### 5.2 aov (Average Order Value)

**Input:** orders-taulu
**Output:**
```json
{
  "value": 278,
  "metrics": {
    "current_aov": 278,
    "previous_aov": 262,
    "change_percent": 6.1,
    "median_order_value": 245,
    "min_order": 25,
    "max_order": 1250
  },
  "direction": "up"
}
```

### 5.3 gross_margin (UUSI - Myyntikate)

**Input:** orders + products (cost_price)
**Output:**
```json
{
  "value": 42.5,  // Kate-%
  "metrics": {
    "total_revenue": 125000,
    "total_cost": 71875,
    "gross_profit": 53125,
    "margin_percent": 42.5,
    "previous_margin_percent": 41.2,
    "change_pp": 1.3
  },
  "by_category": [
    { "category": "Maalit", "revenue": 80000, "margin": 45.0 },
    { "category": "Tarvikkeet", "revenue": 45000, "margin": 38.0 }
  ],
  "alerts": [
    {
      "type": "margin_drop",
      "product": "Tuote X",
      "current_margin": 15,
      "expected_margin": 40,
      "details": "Kate laskenut merkittävästi"
    }
  ]
}
```

**Laskentalogiikka:**
```
gross_margin = (myyntihinta - ostohinta) / myyntihinta * 100

Jos ostohinta puuttuu → käytä oletuskatetta (esim. 40%)
```

### 5.4 organic_conversion_rate

**Input:** gsc_search_analytics + orders
**Output:**
```json
{
  "value": 2.3,  // Kokonais-CR (%)
  "metrics": {
    "total_clicks": 15000,
    "attributed_orders": 345,
    "conversion_rate": 2.3
  },
  "by_page_type": [
    { "page_type": "product", "clicks": 8000, "cr": 3.2 },
    { "page_type": "category", "clicks": 5000, "cr": 1.8 },
    { "page_type": "blog", "clicks": 2000, "cr": 0.5 }
  ],
  "alerts": [
    {
      "type": "high_traffic_zero_sales",
      "page": "/product/xyz",
      "clicks": 500,
      "orders": 0,
      "details": "Paljon liikennettä, ei myyntiä"
    }
  ]
}
```

### 5.5 stock_availability_risk

**Input:** products (stock_level) + gsc_search_analytics
**Output:**
```json
{
  "value": 12500,  // € at risk
  "at_risk_products": [
    {
      "product_name": "Maali X",
      "stock_level": 2,
      "stock_status": "low_stock",
      "days_until_stockout": 5,
      "organic_clicks_30d": 450,
      "organic_revenue_30d": 8500,
      "risk_severity": "critical"
    }
  ],
  "summary": {
    "products_out_of_stock": 3,
    "products_low_stock": 8,
    "total_revenue_at_risk": 12500
  }
}
```

### 5.6 position_change

**Input:** gsc_search_analytics (2 jaksoa)
**Output:**
```json
{
  "value": -0.8,  // Keskimääräinen positiomuutos
  "metrics": {
    "avg_position_current": 12.3,
    "avg_position_previous": 13.1,
    "improved_queries": 45,
    "declined_queries": 23,
    "stable_queries": 120
  },
  "significant_changes": [
    {
      "query": "automaalit",
      "position_before": 18,
      "position_after": 8,
      "change": -10,
      "impressions": 2500,
      "impact": "high"
    }
  ]
}
```

### 5.7 brand_vs_nonbrand

**Input:** gsc_search_analytics + store config (brand names)
**Output:**
```json
{
  "value": 35,  // Non-brand share (%)
  "brand_queries": {
    "total_clicks": 6500,
    "attributed_revenue": 85000,
    "avg_position": 2.1
  },
  "nonbrand_queries": {
    "total_clicks": 3500,
    "attributed_revenue": 40000,
    "avg_position": 14.5
  },
  "analysis": {
    "brand_share": 65,
    "nonbrand_share": 35,
    "health": "brand_dependent",
    "recommendation": "Panosta geneeristen hakusanojen optimointiin"
  }
}
```

---

## 6. Frontend-integraatio

### 6.1 React Hook

```typescript
// src/hooks/useIndicators.ts
export function useIndicators(storeId: string, period: '7d' | '30d' | '90d' = '30d') {
  return useQuery({
    queryKey: ['indicators', storeId, period],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_indicators', {
        p_store_id: storeId,
        p_period_label: period
      });
      if (error) throw error;
      return data as Indicator[];
    }
  });
}
```

### 6.2 UI-komponentit

```
src/components/indicators/
├── IndicatorCard.tsx           # Yksittäinen indikaattori
├── IndicatorGrid.tsx           # Grid-näkymä kaikista
├── IndicatorTrend.tsx          # Trendi-sparkline
├── AlertBadge.tsx              # Hälytys-badge
└── IndicatorDetails.tsx        # Drill-down modal
```

---

## 7. Toteutusjärjestys

### Päivä 1: Tietokanta + Perus-infra
- [ ] Luo `calculated_indicators` -taulu
- [ ] Lisää `cost_price` products-tauluun
- [ ] Luo RPC: `get_indicators`
- [ ] Luo `src/lib/indicators/` -kansiorakenne
- [ ] Toteuta `types.ts` ja `constants.ts`

### Päivä 2: Perus-indikaattorit (ePages)
- [ ] `sales_trend` calculator
- [ ] `aov` calculator
- [ ] `gross_margin` calculator (jos cost_price saatavilla)
- [ ] Testaa Billackering-datalla

### Päivä 3: SEO-indikaattorit (GSC)
- [ ] `position_change` calculator
- [ ] `brand_vs_nonbrand` calculator
- [ ] Testaa GSC-datalla

### Päivä 4: Yhdistetyt indikaattorit (GSC + ePages)
- [ ] `organic_conversion_rate` calculator
- [ ] `stock_availability_risk` calculator
- [ ] Attribuutiologiikka (GSC klikkaus → ePages tilaus)

### Päivä 5: Frontend + Integraatio
- [ ] `useIndicators` hook
- [ ] `IndicatorCard` komponentti
- [ ] Integroi InsightsPage.jsx:ään
- [ ] Emma AI konteksti-integraatio

### Päivä 6: Testaus + Polish
- [ ] End-to-end testaus
- [ ] Edge case -käsittely
- [ ] Dokumentaatio
- [ ] Deploy staging → production

---

## 8. Avoimet kysymykset

### 8.1 Ostohinnat (cost_price) - RATKAISU SELVITETTY
- **Vastaus:** Vilkas/ePages tarjoaa kentän: **Inköpspris [GBasePurchasePrice]**
- **ePages API kenttä:** `GBasePurchasePrice` tai `purchasePrice`
- **Toimenpide:**
  1. Lisää `cost_price` kenttä products-tauluun (migration)
  2. Päivitä sync-skripti hakemaan `GBasePurchasePrice`
  3. Importoi historiallisille tuotteille

### 8.2 Brand keywords
- **Kysymys:** Mistä saadaan kaupan brändisanat?
- **Vaihtoehdot:**
  1. Stores-tauluun `brand_keywords` JSONB-kenttä
  2. Onboarding-vaiheessa kysytään
  3. Automaattinen tunnistus domain-nimestä

### 8.3 Laskennan ajastus
- **Kysymys:** Milloin indikaattorit lasketaan?
- **Vaihtoehdot:**
  1. Real-time (joka sivunlataus)
  2. Scheduled (kerran päivässä yöllä)
  3. Hybrid (cache 1h)
- **Suositus:** Scheduled + cache

---

## 9. Riskit ja mitigaatio

| Riski | Todennäköisyys | Vaikutus | Mitigaatio |
|-------|----------------|----------|------------|
| Ostohinnat puuttuvat | Korkea | Ei gross_margin | Käytä oletuskatetta |
| GSC-data liian vanha | Matala | Väärät CR-luvut | Tarkista data_freshness |
| Attribuutio epätarkka | Keskitaso | Harhaanjohtavat luvut | Näytä confidence-taso |
| Suorituskyky | Matala | Hidas UI | Precompute + cache |

---

## 10. Definition of Done

- [ ] Kaikki 7 indikaattoria lasketaan oikein
- [ ] Tulokset tallennetaan tietokantaan
- [ ] Frontend näyttää indikaattorit
- [ ] Alertit generoituvat automaattisesti
- [ ] Emma AI saa indikaattorit kontekstiksi
- [ ] Dokumentaatio päivitetty
- [ ] Testit läpäisevät

---

**Seuraava askel:** Aloitetaan huomenna Päivä 1 -tehtävistä.
