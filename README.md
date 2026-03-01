# Vilkas Analytics

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  PROJEKTI: VilkasAnalytics                                                  ║
║  KANSIO: /Desktop/VilkasAnalytics                                           ║
║  SUPABASE: tlothekaphtiwvusgwzh.supabase.co                                 ║
║  VERCEL: vilkas-analytics.vercel.app                                        ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  TAMA ON ERI PROJEKTI KUIN:                                                 ║
║     VilkasInsight (/Desktop/VilkasInsight-Vercel)                           ║
║        -> abbwfjishojcbifbruia.supabase.co                                  ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

Verkkokauppiaan sisainen analytiikkasovellus, joka yhdistaa ePages/Vilkas-myyntidatan, Google Search Consolen ja Google Analytics 4:n yhteen nakymaan. Sisaltaa KPI-indikaattorit, AI-avusteisen Emma-chatin ja automaattiset Slack-ilmoitukset.

**Production:** [vilkas-analytics.vercel.app](https://vilkas-analytics.vercel.app)

## Kaupat (multi-tenant)

| Kauppa          | Valuutta | Kieli | Asiakaspalvelu   |
|-----------------|----------|-------|------------------|
| Automaalit.net  | EUR      | fi    | Jira (kaytossa)  |
| Billackering.eu | SEK      | sv    | Jira (syksy 2026)|

## Tech Stack

| Kerros | Teknologia |
|--------|-----------|
| Frontend | React 19, React Router 7, Vite 7 |
| Tyylitys | Tailwind CSS 3, shadcn/ui, Framer Motion |
| Tietovarasto | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth (Google OAuth) |
| Data-haku | TanStack React Query |
| Visualisointi | Recharts |
| AI | OpenAI API (Emma-chat) |
| Integraatiot | ePages REST API, Google Search Console, Google Analytics 4 |
| Ilmoitukset | Slack Webhooks |
| Hosting | Vercel (Serverless Functions + Cron Jobs) |

## Datan hierarkia

```
ePages     = MASTER      Myynti, tilaukset         100% luotettava
GSC        = SEO         Haut, positiot            100% luotettava
GA4        = BEHAVIORAL  Traffic, bounce rate      ~70% kattavuus (ad blockers)
```

**Tarkeaa:** GA4:sta EI kayteta transaktiotietoja - ePages on ainoa totuus myyntidatalle.

## Alkuun paaseminen

### Vaatimukset

- Node.js 18+
- npm

### Asennus

```bash
git clone https://github.com/MardeX7/vilkas-analytics.git
cd vilkas-analytics
npm install
```

### Ymparistomuuttujat

Luo `.env.local` projektin juureen:

```bash
# Supabase (frontend)
VITE_SUPABASE_URL="https://tlothekaphtiwvusgwzh.supabase.co"
VITE_SUPABASE_ANON_KEY="eyJ..."

# Supabase (backend, vain serverless functions)
SUPABASE_SERVICE_ROLE_KEY="eyJ..."

# Google OAuth (GA4 + GSC)
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GOOGLE_REDIRECT_URI="https://vilkas-analytics.vercel.app/api/auth/callback/google"

# AI (Emma-chat)
OPENAI_API_KEY="sk-..."
```

### Kehityspalvelin

```bash
npm run dev
# http://localhost:5173
```

## Kansiorakenne

```
VilkasAnalytics/
├── api/                          # Vercel Serverless Functions
│   ├── auth/callback/google.js   # Google OAuth callback
│   ├── ga4/                      # GA4 connect & sync
│   │   ├── connect.js
│   │   ├── sync.js
│   │   └── sync-ecommerce.js
│   ├── gsc/                      # GSC connect & sync
│   │   ├── connect.js
│   │   └── sync.js
│   ├── cron/                     # Ajastetut taustatyot (9 kpl)
│   │   ├── sync-data.js          # Paasynkronointi
│   │   ├── sync-products.js
│   │   ├── calculate-kpi.js
│   │   ├── save-growth-snapshot.js
│   │   ├── index-emma-documents.js
│   │   ├── send-orders-slack.js
│   │   ├── send-stock-slack.js
│   │   ├── send-lowstock-slack.js
│   │   ├── send-reorder-slack.js
│   │   ├── send-daily-slack.js
│   │   └── send-weekly-slack.js
│   ├── chat.js                   # Emma AI chat endpoint
│   ├── generate-analysis.js      # AI-analyysi
│   ├── generate-recommendations.js
│   └── lib/slack.js              # Slack-apukirjasto
├── src/
│   ├── components/               # React-komponentit (~39 kpl)
│   │   ├── ui/                   # shadcn/ui peruskomponentit
│   │   ├── auth/                 # Kirjautumiskomponentit
│   │   ├── EmmaChat.jsx          # AI-chat
│   │   ├── EmmaChatFullscreen.jsx
│   │   ├── Layout.jsx            # Paasovelluskehys
│   │   ├── Sidebar.jsx           # Navigaatio
│   │   └── MobileNav.jsx         # Mobiilinavigaatio
│   ├── config/
│   │   └── storeConfig.js        # Kaupan ID-konfiguraatio
│   ├── hooks/                    # Custom hookit (~25 kpl)
│   ├── lib/
│   │   ├── supabase.js           # Supabase client
│   │   ├── csvExport.js          # CSV-vienti
│   │   └── i18n/translations/    # Kaannokset (fi, sv)
│   ├── pages/                    # Sivut (9 kpl)
│   └── main.jsx                  # Entry point
├── scripts/                      # Node.js apuskriptit
│   └── db.cjs                    # Supabase client (skripteille)
├── supabase/
│   └── migrations/               # SQL-migraatiot (~45 kpl)
├── docs/                         # Tekninen dokumentaatio
├── vercel.json                   # Cron-ajastukset + rewrite-saannot
└── package.json
```

## Sivut ja reititys

| Polku | Sivu | Kuvaus |
|-------|------|--------|
| `/` | Tilannekuva | KPI-indikaattorit (oletusnakymä) |
| `/insights` | Oivallukset | AI-analyysit, Emma-chat, viikkoanalyysi |
| `/sales` | Myynti | ePages-myyntidata, trendit, top-tuotteet |
| `/customers` | Asiakkaat | Asiakassegmentit, RFM-analyysi, marginaali |
| `/search-console` | Haku | GSC: positiot, klikkaukset, impressiot |
| `/analytics` | Analytiikka | GA4: liikennelahteet, kayttaytyminen |
| `/inventory` | Varasto | Varastotasot, halytykset, taydennyssuositukset |
| `/indicators/:id` | Indikaattori | Yksittaisen KPI:n syvaanalyysi |
| `/settings` | Asetukset | Kaupan konfiguraatio |

## KPI-indikaattorit (Indicator Engine)

7 MVP-indikaattoria kolmesta datalahtesta:

| Indikaattori | Lahde | Kategoria |
|-------------|-------|-----------|
| Myyntitrendi (`sales_trend`) | ePages | Sales |
| Keskiostos (`aov`) | ePages | Sales |
| Myyntikate (`gross_margin`) | ePages | Sales |
| SEO-positiot (`position_change`) | GSC | SEO |
| Non-brand-haut (`brand_vs_nonbrand`) | GSC | SEO |
| Orgaaninen konversio (`organic_conversion_rate`) | ePages + GSC | Combined |
| Varastoriski (`stock_availability_risk`) | ePages + GSC | Combined |

Aikavalit: `7d`, `30d` (oletus), `90d`

## Store ID vs Shop ID

Projektissa on kaksi eri UUID:ta samalle kaupalle. Kayta aina keskitettya konfiguraatiota:

```javascript
// Frontend
import { STORE_ID, SHOP_ID, getStoreIdForTable } from '@/config/storeConfig'

// Node.js-skriptit
const { STORE_ID, SHOP_ID, getStoreIdForTable } = require('./scripts/db.cjs')
```

| Taulut | Kayttaa |
|--------|---------|
| `orders`, `products`, `gsc_*`, `ga4_tokens`, `order_line_items` | `STORE_ID` |
| `shops`, `ga4_ecommerce`, `weekly_analyses`, `chat_sessions`, `merchant_goals` | `SHOP_ID` |

**Ala koskaan kovakoodaa UUID:ta suoraan koodiin!**

## Tietokanta (Supabase)

### Paataulut

| Taulu | Kuvaus |
|-------|--------|
| `shops` | Kaupat (multi-tenant) |
| `orders` | Tilaukset (ePages) |
| `order_line_items` | Tilausrivit |
| `products` | Tuotteet (+ cost_price) |
| `gsc_search_analytics` | Search Console data |
| `gsc_tokens` | GSC OAuth tokenit |
| `ga4_ecommerce` | GA4 tuotedata |
| `ga4_tokens` | GA4 OAuth tokenit |
| `indicators` | Lasketut indikaattorit |
| `indicator_history` | Historiadata trendeihin |
| `alerts` | Halytykset |
| `weekly_analyses` | Viikkoanalyysit (AI) |
| `chat_sessions` | Emma-chat historia |
| `merchant_goals` | Kauppiaan tavoitteet |
| `context_notes` | Kontekstimuistiinpanot |
| `growth_engine_snapshots` | Kasvumoottori-snapshotit |
| `action_recommendations` | Toimenpidesuositukset |
| `emma_rag_documents` | Emma RAG -dokumentit |

### RPC-funktiot

- `get_indicators(store_id, period_label)` - Hae indikaattorit
- `upsert_indicator(...)` - Tallenna indikaattori
- `get_indicator_history(store_id, indicator_id, days)` - Historia
- `get_active_alerts(store_id)` - Aktiiviset halytykset

## Cron-ajastukset (Vercel)

Kaikki ajat UTC (Suomen aika = UTC + 2/3).

| Aika (UTC) | Endpoint | Kuvaus |
|------------|----------|--------|
| 05:00 | `send-orders-slack` | Eilisen tilaukset Slackiin |
| 05:15 | `send-stock-slack` | Varastohalytys |
| 05:30 | `send-lowstock-slack` | Matalat varastotasot |
| 06:00 | `sync-data` | **Paasynkronointi** (ePages, GA4, GSC, KPI) |
| 06:15 ma | `send-reorder-slack` | Taydennyssuositukset (viikoittain) |
| 06:30 | `send-daily-slack` | Paivittainen yhteenveto |
| 06:45 | `index-emma-documents` | Emma RAG -dokumenttien indeksointi |
| 07:00 ma | `save-growth-snapshot` | Kasvumoottori-snapshot (viikoittain) |
| 07:30 ma | `send-weekly-slack` | Viikkoyhteenveto |

## Skriptit

```bash
npm run dev       # Kehityspalvelin (Vite)
npm run build     # Tuotantobuildi
npm run preview   # Esikatselu buildista
npm run lint      # ESLint
npm run deploy    # Vercel production deploy
```

### Hyodyllisia apuskripteja

```bash
node scripts/sync_epages.js          # Synkkaa ePages-tilaukset manuaalisesti
node scripts/sync_ga4_now.cjs        # Synkkaa GA4 manuaalisesti
node scripts/sync_gsc_now.cjs        # Synkkaa GSC manuaalisesti
```

## Deployment

**Git push EI aina triggeroidy Vercel-deployta automaattisesti!**

```bash
# Aja aina manuaalinen deploy muutosten jalkeen:
npm run deploy    # = npx vercel --prod --yes

# Tarkista deployment:
npx vercel list | head -5
```

### Ymparistomuuttujat Vercelissa

Aseta Vercel Dashboard > Settings > Environment Variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `OPENAI_API_KEY`

## Liittyvat projektit

| Projekti | Kuvaus | Supabase |
|----------|--------|----------|
| **VilkasAnalytics** (tama) | Kauppiaan oma analytiikka | `tlothekaphtiwvusgwzh` |
| VilkasInsight | Benchmark-palvelu | `abbwfjishojcbifbruia` |
| ParasX | Autokorjaamo-liidit | `dkqbzsphgqorstfcqthx` |

**Ala sekoita naita tietokantoja keskenaan!**

## Lisenssi

Proprietary - Vilkas Group Oy
