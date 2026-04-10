# VilkasAnalytics - Claude Code Context

## Kieli

Kommunikoi suomeksi. Koodikommentit ja commit-viestit englanniksi.

## Projektin kuvaus

VilkasAnalytics on multi-tenant verkkokauppa-analytiikkatyökalu kahdelle automaaliliikkeelle. Se yhdistää ePages-verkkokaupan, Google Search Consolen, GA4:n ja Jiran dataa yhteen dashboardiin, ja tarjoaa AI-pohjaisia analyyseja ja suosituksia.

**Stack:** React 19 + Vite 7 + Supabase + Vercel serverless + Tailwind CSS + Recharts
**URL:** https://vilkas-analytics.vercel.app

## Kaupat

| Kauppa | store_id | shop_id | Valuutta | Kieli |
|--------|----------|---------|----------|-------|
| Billackering.eu | a28836f6-9487-4b67-9194-e907eaf94b69 | 3b93e9b1-d64c-4686-a14a-bec535495f71 | SEK | sv |
| Automaalit.net | 9a0ba934-bd6c-428c-8729-791d5c7ac7c2 | 9355ace7-3548-4023-91c8-5e9c14003c31 | EUR | fi |

## Kaksi-ID-järjestelmä (KRIITTINEN)

- **store_id** (stores.id, TEXT) = ePages-taulut: `orders`, `products`, `order_line_items`, `gsc_*`, `ga4_tokens`
- **shop_id** (shops.id, UUID) = analytics-taulut: `weekly_analyses`, `support_tickets`, `paste_*`, `growth_engine_snapshots` jne.

Käytä `useCurrentShop()` hookia — se palauttaa molemmat. Konfiguraatio: `src/config/storeConfig.js`.

## Data Mastership -periaate

1. **ePages API = MASTER** — kaikki rahalliset metriikat (liikevaihto, tilaukset, tuotteet, asiakkaat)
2. **Google Search Console = SEO** — hakusanat, positiot, klikkaukset, impressiot
3. **GA4 = BEHAVIORAL** — sessiot, traffic-lähteet, funnel (VAIN suhteellisina, EI revenue/transactions)

**GA4:n ecommerce-dataa (transactions, revenue) EI KOSKAAN käytetä.** Syy: consent-kato 20-40%, ad blockerit, iOS ATT.

## Tärkeimmät tiedostot

```
src/config/storeConfig.js     — useCurrentShop(), getStoreIdForTable()
src/config/shopLogos.js       — Logo-mapping per kauppa
src/App.jsx                   — Kaikki reitit
src/components/Sidebar.jsx    — Navigaatio (ehdolliset itemit)
src/lib/i18n/translations/    — fi.json, sv.json käännökset
api/cron/                     — Kaikki cron-jobit
api/lib/slack.js              — Slack-webhookhelper
scripts/db.cjs                — Supabase-yhteys skripteille
```

## Cron-aikataulu (UTC)

| Aika | Cron | Kuvaus |
|------|------|--------|
| 06:00 | sync-data | ePages + inventory snapshot |
| 06:05 | sync-gsc | Google Search Console |
| 06:08 | sync-jira | Jira-tiketit |
| 06:15 | send-morning-brief-slack | Aamubrief |
| 06:30 Ma | send-reorder-slack | Viikkotilausehdotukset |
| 06:45 | index-emma-documents | Emma RAG-indeksointi |
| 07:00 Ma | save-growth-snapshot | Growth Engine snapshot |
| 07:15 Ma | generate-weekly-analyses | Deepseek-viikkoanalyysi |
| 07:30 Ma | send-weekly-slack | Viikkoyhteenveto |

## Koodikäytännöt

- **Multi-tenant:** Kaikki cron-jobit iteroivat `shops`-taulun. Ei hardkoodattuja store_id:itä.
- **Ehdolliset sivut:** Jira-support näkyy vain `hasJira`-kaupoilla, Sävytysvarasto vain `automaalit.net`:llä
- **Valuuttatietoinen:** FI ALV 24%, SE 25%. EUR/SEK symbolit dynaamisesti.
- **Hookit:** useState + useEffect -malli (ei TanStack Query varasto/paste-sivuilla)
- **Kaaviot:** Recharts (LineChart, BarChart, PieChart). Värit: brand blue #00b4e9
- **CSV-export:** Puolipiste-erotin (eurooppalainen Excel), UTF-8 BOM. Ks. `src/lib/csvExport.js`
- **RLS:** Kaikki taulut käyttävät Row Level Security. Cron-jobit käyttävät service_role_key.
- **Supabasen 1000 rivin raja:** Paginoi `.range()`:lla kun dataa voi olla yli 1000 riviä.

## Sävytysvarasto (Paste Inventory)

Automaalit.net:n sävytyspastojen erillinen varastojärjestelmä (eri ePages-instanssi).

- **CSV-saldot:** Kiinteä URL, synkataan "Päivitä saldot" -napista
- **XML-tilaukset:** Tuodaan manuaalisesti ~kuukausittain upload-toiminnolla
- **Taulut:** `paste_products`, `paste_snapshots`, `paste_orders` (kaikki shop_id)
- **Hook:** `usePasteInventory.js`
- **Sivu:** `/paste-inventory`

## Ympäristömuuttujat

```
VITE_SUPABASE_URL          — Supabase project URL
VITE_SUPABASE_ANON_KEY     — Supabase anon key (frontend)
SUPABASE_SERVICE_ROLE_KEY  — Supabase admin key (backend/cron)
CRON_SECRET                — Bearer token cron-autentikointi
GOOGLE_CLIENT_ID           — Google OAuth
GOOGLE_CLIENT_SECRET       — Google OAuth
OPENAI_API_KEY             — Emma AI chat
DEEPSEEK_API_KEY           — Viikkoanalyysit
SLACK_WEBHOOK_URL          — Fallback Slack webhook
```

## Älä tee

- ÄLÄ käytä GA4:n revenue/transactions-dataa
- ÄLÄ hardkoodaa store_id/shop_id arvoja (paitsi skripteissä joissa on selkeä mapping)
- ÄLÄ unohda paginoida Supabase-kyselyitä kun rivimäärä voi ylittää 1000
- ÄLÄ luo uusia tiedostoja turhaan — editoi olemassa olevia
- ÄLÄ lisää ylimääräistä error handlingia, docstringejä tai type annotaatioita koodiin jota et muokkaa
