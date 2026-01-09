# VilkasAnalytics - Integraatiot

Tekninen dokumentaatio ulkoisista datalähteiden integraatioista.

**Päivitetty:** 2026-01-09

---

## Yleiskatsaus

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        VilkasAnalytics                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐             │
│   │   ePages     │    │     GSC      │    │     GA4      │             │
│   │  (Vilkas)    │    │   (Google    │    │   (Google    │             │
│   │              │    │   Search     │    │  Analytics   │             │
│   │  MASTER      │    │   Console)   │    │      4)      │             │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘             │
│          │                   │                   │                      │
│          ▼                   ▼                   ▼                      │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐             │
│   │   orders     │    │ gsc_search_  │    │ ga4_analytics│             │
│   │   products   │    │  analytics   │    │ ga4_ecommerce│             │
│   │   shops      │    │              │    │ ga4_tokens   │             │
│   └──────────────┘    └──────────────┘    └──────────────┘             │
│                                                                         │
│                     Supabase (PostgreSQL)                               │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Mastership

| Datalähde | Rooli | Mitä dataa |
|-----------|-------|------------|
| **ePages** | MASTER | Tilaukset, tuotteet, asiakkaat, myynti |
| **GSC** | SEO | Hakukonepositiot, klikkaukset, impressiot |
| **GA4** | Behavioral | Sessiot, liikennelähteet, käyttäytyminen |

**Tärkeää:** ePages on ainoa luotettava lähde myyntidatalle. GA4:n transaktiodata on vain lisätietoa.

---

## 1. ePages/Vilkas-integraatio

### Yleistä

ePages on verkkokauppa-alusta jota Vilkas käyttää. Integraatio hakee tilaus- ja tuotedatan REST API:n kautta.

### Autentikointi

```
API Base URL: https://{shop-domain}/rs/shops/{shop-id}
Auth: Basic Authentication (API credentials)
```

Credentials tallennetaan `shops`-tauluun:
- `epages_api_url` - Kaupan API URL
- `epages_api_token` - API token (encrypted)

### API Endpoints

| Endpoint | Metodi | Kuvaus |
|----------|--------|--------|
| `/orders` | GET | Tilauslista (pagination) |
| `/orders/{id}` | GET | Yksittäinen tilaus + rivit |
| `/products` | GET | Tuotelista |
| `/products/{id}` | GET | Yksittäinen tuote |

### Synkronointi

**Cron Job:** `/api/cron/sync-epages.js`
- Ajetaan: Kerran päivässä (tai manuaalisesti)
- Hakee: Uudet/muuttuneet tilaukset viimeisen 7 päivän ajalta
- Tallentaa: `orders`, `order_line_items`, `products`

**Manuaalinen synkronointi:**
```bash
# Testiskripti
node scripts/test_epages_sync.cjs
```

### Tietokantataulut

```sql
-- Tilaukset
CREATE TABLE orders (
  id UUID PRIMARY KEY,
  store_id UUID REFERENCES shops(id),
  order_number TEXT,
  creation_date TIMESTAMPTZ,
  status TEXT,  -- 'pending', 'shipped', 'cancelled'
  grand_total DECIMAL,
  currency TEXT,
  customer_email TEXT,
  shipping_address JSONB,
  ...
);

-- Tilausrivit
CREATE TABLE order_line_items (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  product_id UUID,
  product_number TEXT,  -- SKU
  product_name TEXT,
  quantity INTEGER,
  unit_price DECIMAL,
  total_price DECIMAL,
  ...
);

-- Tuotteet
CREATE TABLE products (
  id UUID PRIMARY KEY,
  store_id UUID REFERENCES shops(id),
  product_number TEXT,  -- SKU (tärkein tunniste!)
  name TEXT,
  price DECIMAL,
  cost_price DECIMAL,  -- Hankintahinta (lisätty manuaalisesti)
  stock_level INTEGER,
  ...
);
```

### Huomioita

1. **SKU = product_number** on tärkein tunniste tuotteille
2. **cost_price** ei tule ePages API:sta - se täytyy lisätä manuaalisesti
3. Tilausten `status` voi muuttua - cancelled tilauksia ei lasketa myyntiin

---

## 2. Google Search Console (GSC)

### Yleistä

GSC tarjoaa hakukonedataa: millä hakusanoilla sivusto löytyy, klikkaukset, positiot.

### Autentikointi

OAuth 2.0 flow:
1. Käyttäjä kirjautuu Google-tilillä
2. Myöntää GSC-oikeudet
3. Tallennetaan refresh_token

**Tokens tallennetaan:** `gsc_tokens`-tauluun

### API

```
Base URL: https://www.googleapis.com/webmasters/v3
Scopes: https://www.googleapis.com/auth/webmasters.readonly
```

**Search Analytics API:**
```javascript
POST /sites/{siteUrl}/searchAnalytics/query
{
  "startDate": "2025-01-01",
  "endDate": "2025-01-31",
  "dimensions": ["query", "page", "date"],
  "rowLimit": 25000
}
```

### Synkronointi

**Endpoint:** `/api/gsc/sync.js`

**Manuaalinen synkronointi:**
```bash
node scripts/sync_gsc.cjs
```

### Tietokantataulut

```sql
-- GSC Tokens
CREATE TABLE gsc_tokens (
  id UUID PRIMARY KEY,
  store_id UUID REFERENCES shops(id),
  site_url TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  ...
);

-- GSC Data (raakadata)
CREATE TABLE gsc_search_analytics (
  id UUID PRIMARY KEY,
  store_id UUID,
  date DATE,
  query TEXT,
  page TEXT,
  clicks INTEGER,
  impressions INTEGER,
  ctr DECIMAL,
  position DECIMAL,
  ...
);

-- GSC Daily Summary (view)
CREATE VIEW v_gsc_daily_summary AS
SELECT
  store_id,
  date,
  SUM(clicks) as total_clicks,
  SUM(impressions) as total_impressions,
  AVG(ctr) as avg_ctr,
  AVG(position) as avg_position
FROM gsc_search_analytics
GROUP BY store_id, date;
```

### Käyttö frontendissä

```javascript
// src/hooks/useGSC.js
import { useGSC } from '@/hooks/useGSC'

const {
  topQueries,      // Top hakusanat
  topPages,        // Top sivut
  dailyData,       // Päiväkohtainen data
  syncGSC          // Synkronoi uusi data
} = useGSC(dateRange)
```

### Huomioita

1. GSC data viivästyy 2-3 päivää (Google rajoitus)
2. Max 25,000 riviä per query - käytä pagination
3. `clicks` voidaan käyttää sessioiden proxyna jos GA4 ei ole käytössä

---

## 3. Google Analytics 4 (GA4)

### Yleistä

GA4 tarjoaa käyttäytymisdataa: sessiot, liikennelähteet, bounce rate, käyttäjät.

**Tärkeää:** GA4 on BEHAVIORAL data - älä käytä myyntidataan (ePages on master)

### Autentikointi

OAuth 2.0 flow (sama kuin GSC):
1. Käyttäjä kirjautuu Google-tilillä
2. Myöntää GA4-oikeudet
3. Tallennetaan refresh_token

**Tokens tallennetaan:** `ga4_tokens`-tauluun

### API

**Data API (behavioral data):**
```
Base URL: https://analyticsdata.googleapis.com/v1beta
Scopes: https://www.googleapis.com/auth/analytics.readonly
```

```javascript
POST /properties/{propertyId}:runReport
{
  "dateRanges": [{ "startDate": "2025-01-01", "endDate": "2025-01-31" }],
  "dimensions": [
    { "name": "date" },
    { "name": "sessionSource" },
    { "name": "sessionMedium" },
    { "name": "sessionDefaultChannelGrouping" },
    { "name": "landingPage" }
  ],
  "metrics": [
    { "name": "sessions" },
    { "name": "engagedSessions" },
    { "name": "bounceRate" },
    { "name": "averageSessionDuration" },
    { "name": "newUsers" },
    { "name": "totalUsers" }
  ]
}
```

### Synkronointi

**Behavioral data:** `/api/ga4/sync.js`
**Ecommerce data:** `/api/ga4/sync-ecommerce.js`

**Manuaalinen synkronointi:**
```bash
# Behavioral data (sessiot, liikennelähteet)
node scripts/sync_ga4.cjs

# Ecommerce data (tuotenäytöt, ostoskori)
# (erillinen skripti tarvittaessa)
```

### Tietokantataulut

```sql
-- GA4 Tokens
CREATE TABLE ga4_tokens (
  id UUID PRIMARY KEY,
  store_id UUID,
  property_id TEXT,  -- 'properties/123456789'
  property_name TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  ...
);

-- GA4 Analytics (behavioral raakadata)
CREATE TABLE ga4_analytics (
  id UUID PRIMARY KEY,
  store_id UUID,
  property_id TEXT,
  date DATE,
  session_source TEXT,
  session_medium TEXT,
  session_default_channel_grouping TEXT,
  landing_page TEXT,
  sessions INTEGER,
  engaged_sessions INTEGER,
  bounce_rate DECIMAL,
  average_session_duration DECIMAL,
  new_users INTEGER,
  returning_users INTEGER,
  ...

  UNIQUE(store_id, property_id, date, session_source,
         session_medium, session_default_channel_grouping, landing_page)
);

-- GA4 Daily Summary (view)
CREATE VIEW v_ga4_daily_summary AS
SELECT
  store_id,
  property_id,
  date,
  SUM(sessions) as total_sessions,
  SUM(engaged_sessions) as total_engaged_sessions,
  AVG(bounce_rate) as avg_bounce_rate,
  AVG(average_session_duration) as avg_session_duration,
  SUM(new_users) as total_new_users,
  SUM(returning_users) as total_returning_users
FROM ga4_analytics
GROUP BY store_id, property_id, date;

-- GA4 Ecommerce (tuoteanalytiikka)
CREATE TABLE ga4_ecommerce (
  id UUID PRIMARY KEY,
  store_id UUID,  -- HUOM: sisältää SHOP_ID, ei STORE_ID!
  property_id TEXT,
  date DATE,
  item_id TEXT,
  item_name TEXT,
  item_category TEXT,
  item_brand TEXT,
  items_viewed INTEGER,
  items_added_to_cart INTEGER,
  items_purchased INTEGER,
  item_revenue DECIMAL,
  view_to_cart_rate DECIMAL,
  cart_to_purchase_rate DECIMAL,
  ...
);
```

### Käyttö frontendissä

```javascript
// src/hooks/useGA4.js
import { useGA4 } from '@/hooks/useGA4'

const {
  connected,        // Boolean: onko GA4 yhdistetty
  propertyName,     // GA4 property nimi
  summary,          // Yhteenveto (sessiot, bounce rate, jne)
  trafficSources,   // Liikennelähteet
  landingPages,     // Top laskeutumissivut
  dailySummary,     // Päiväkohtainen data
  // Vertailudata
  previousSummary,
  comparisonEnabled,
  // Actions
  connectGA4,       // Aloita OAuth flow
  syncGA4,          // Synkronoi data
  disconnectGA4     // Poista yhteys
} = useGA4(dateRange, comparisonMode)

// src/hooks/useGA4Ecommerce.js
import { useGA4Ecommerce } from '@/hooks/useGA4Ecommerce'

const {
  topProducts,           // Eniten katsotut tuotteet
  productFunnel,         // Näyttö → Kori → Osto
  lowConversionProducts, // Heikon konversion tuotteet
  highPerformers,        // Hyvän konversion tuotteet
  syncEcommerce          // Synkronoi ecommerce data
} = useGA4Ecommerce(dateRange)
```

### GSC Fallback

Jos GA4 dataa ei ole saatavilla, `useGA4` käyttää automaattisesti GSC-dataa:

```javascript
// useGA4.js
if (!hasGA4Data) {
  // Käytä GSC clicks = sessions proxy
  // Arvioi engagement rate, bounce rate
}
```

### Huomioita

1. **Token refresh:** Access token vanhenee 1h - refresh automaattisesti
2. **ga4_ecommerce.store_id** sisältää SHOP_ID (ei STORE_ID) - historiallinen bugi
3. **Vertailudata:** Synkronoi vähintään 90 päivää jotta MoM-vertailu toimii
4. **Rate limits:** GA4 API:lla on rate limitit - älä hae liikaa kerralla

---

## Store ID -sekaannus

**KRIITTINEN:** Projektissa on kaksi eri ID:tä samalle kaupalle:

```javascript
// scripts/db.cjs
const BILLACKERING = {
  SHOP_ID: '3b93e9b1-d64c-4686-a14a-bec535495f71',   // shops.id
  STORE_ID: 'a28836f6-9487-4b67-9194-e907eaf94b69', // orders.store_id (ePages ID)
}
```

| Taulu | Käytä | Sarake |
|-------|-------|--------|
| `orders` | STORE_ID | `store_id` |
| `products` | STORE_ID | `store_id` |
| `gsc_search_analytics` | STORE_ID | `store_id` |
| `ga4_analytics` | STORE_ID | `store_id` |
| `ga4_tokens` | STORE_ID | `store_id` |
| `ga4_ecommerce` | **SHOP_ID** | `store_id` (väärä nimi!) |
| `shops` | SHOP_ID | `id` |

---

## Synkronointi-skriptit

```bash
# ePages tilaukset
node scripts/test_epages_sync.cjs

# GSC hakudata
node scripts/sync_gsc.cjs

# GA4 behavioral data
node scripts/sync_ga4.cjs

# Tarkista GSC data
node scripts/check_gsc_dates.cjs

# Tarkista GA4 data
node scripts/check_ga4.cjs
```

---

## Troubleshooting

### "GA4 näyttää nollia"

1. Tarkista onko token vanhentunut: `ga4_tokens.expires_at`
2. Tarkista onko dataa: `SELECT COUNT(*) FROM ga4_analytics WHERE store_id = '...'`
3. Aja synkronointi: `node scripts/sync_ga4.cjs`

### "GSC data puuttuu"

1. GSC data viivästyy 2-3 päivää
2. Tarkista token: `gsc_tokens` taulu
3. Aja synkronointi manuaalisesti

### "Vertailuluvut epärealistisia"

1. Tarkista onko edellisellä kaudella dataa
2. Synkronoi vähintään 90 päivää GA4-dataa
3. Tarkista päivämäärävälit molemmilla kausilla

### "ga4_ecommerce ei näytä dataa"

1. Muista: käytä SHOP_ID, ei STORE_ID
2. Query: `.eq('store_id', SHOP_ID)` (sarake on `store_id` mutta arvo on SHOP_ID)

---

## Ympäristömuuttujat

```bash
# .env.local
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Google OAuth (GA4 & GSC)
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
```

---

## Lisätietoja

- [ePages REST API Docs](https://developer.epages.com/api/)
- [Google Search Console API](https://developers.google.com/webmaster-tools/v1/api_reference_index)
- [GA4 Data API](https://developers.google.com/analytics/devguides/reporting/data/v1)
