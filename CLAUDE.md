# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Kieli

Kommunikoi suomeksi. Koodikommentit ja commit-viestit englanniksi.

## Projektin kuvaus

VilkasAnalytics on multi-tenant verkkokauppa-analytiikkatyökalu kahdelle automaalien verkkokaupalla. Suomessa verkkokauppa on www.automaalit.net ja Ruotsissa www.billackering.eu. Molemmat ovat samaa yritystä. 

Sovellus yhdistää ePages-verkkokaupan, Google Search Consolen, GA4:n ja Jiran dataa yhteen dashboardiin, ja tarjoaa AI-pohjaisia analyyseja ja suosituksia.

**Stack:** React 19 + React Router 7 + Vite 7 + Supabase (Postgres + RLS + Google OAuth) + Vercel serverless/cron + Tailwind 3 + shadcn/ui + Framer Motion + Recharts + TanStack Query v5
**URL:** https://vilkas-analytics.vercel.app
**Supabase project:** `tlothekaphtiwvusgwzh` (ÄLÄ sekoita VilkasInsightin `abbwfjishojcbifbruia`-DB:hen tai ParasX:n `dkqbzsphgqorstfcqthx`-DB:hen)

## Komennot

```bash
npm run dev       # Vite dev server (http://localhost:5173)
npm run build     # Tuotantobuildi -> dist/
npm run preview   # Esikatselu buildista
npm run lint      # ESLint koko projektille
npm run deploy    # = npx vercel --prod --yes
```

**Tärkeää deploymentista:** Pelkkä `git push` EI aina triggeröi Vercel-deployta. Aja `npm run deploy` muutosten jälkeen. Tarkista: `npx vercel list | head -5`.

Ei testikehystä konfiguroituna — tämä on dev-only-projekti ilman automaattisia testejä. Manuaaliset apuskriptit löytyvät `scripts/`-kansiosta (`.cjs`/`.js`), ajetaan `node scripts/<nimi>`.

## Path alias

`@/` → `src/` (konfiguroitu sekä `vite.config.js`:ssä että `jsconfig.json`:ssa). Esim. `import { STORE_ID } from '@/config/storeConfig'`.

## Kaupat

| Kauppa | store_id | shop_id | Valuutta | Kieli |
|--------|----------|---------|----------|-------|
| Billackering.eu | a28836f6-9487-4b67-9194-e907eaf94b69 | 3b93e9b1-d64c-4686-a14a-bec535495f71 | SEK | sv |
| Automaalit.net | 9a0ba934-bd6c-428c-8729-791d5c7ac7c2 | 9355ace7-3548-4023-91c8-5e9c14003c31 | EUR | fi |

## Kaksi-ID-järjestelmä (KRIITTINEN)

- **store_id** (stores.id, TEXT) = ePages-taulut: `orders`, `products`, `order_line_items`, `gsc_*`, `ga4_tokens`
- **shop_id** (shops.id, UUID) = analytics-taulut: `weekly_analyses`, `support_tickets`, `paste_*`, `growth_engine_snapshots` jne.

Käytä `useCurrentShop()` hookia — se palauttaa molemmat. Konfiguraatio: `src/config/storeConfig.js`.

## Auth ja multi-tenant-flow

Frontend: Supabase Auth (Google OAuth) → `AuthContext.jsx` lataa käyttäjän kaupat `get_user_shops()` RPC:llä → `currentShop` (storeId, shopId, currency, domain) on saatavilla `useCurrentShop()`:n kautta jokaisessa hookissa ja sivussa. Backend (cron): iteroi `shops`-taulun palvelinpuolella service_role_keyllä, ei hardkoodattuja ID:itä.

## Reitit (App.jsx)

| Polku | Sivu | Huomiot |
| --- | --- | --- |
| `/` | IndicatorsPage | Oletusnäkymä — KPI-indikaattorit |
| `/insights` | InsightsPage | AI-viikkoanalyysi, Emma-chat |
| `/sales` | Dashboard | ePages-myyntidata, top-tuotteet |
| `/customers` | CustomersPage | RFM, segmentit, marginaali |
| `/search-console` | SearchConsolePage | GSC |
| `/analytics` | GA4Page | GA4 (vain behavioral) |
| `/inventory` | InventoryPage | Varasto + täydennys |
| `/paste-inventory` | PasteInventoryPage | Vain `automaalit.net` |
| `/support` | SupportPage | Vain `hasJira`-kaupat |
| `/indicators/:indicatorId` | IndicatorDetailPage | KPI-syvänäkymä |
| `/settings` | SettingsPage | Kaupan asetukset |

Suojaus: kaikki paitsi `/login` ja `/auth/callback` `ProtectedRoute`-wrapperin alla.

## Data Mastership -periaate

1. **ePages API = MASTER** — kaikki rahalliset metriikat (liikevaihto, tilaukset, tuotteet, asiakkaat)
2. **Google Search Console = SEO** — hakusanat, positiot, klikkaukset, impressiot
3. **GA4 = BEHAVIORAL** — sessiot, traffic-lähteet, funnel (VAIN suhteellisina, EI revenue/transactions)

**GA4:n ecommerce-dataa (transactions, revenue) EI KOSKAAN käytetä.** Syy: consent-kato 20-40%, ad blockerit, iOS ATT.

## Tärkeimmät tiedostot

```
src/config/storeConfig.js     — useCurrentShop(), getStoreIdForTable()
src/config/shopLogos.js       — Logo-mapping per kauppa
src/contexts/AuthContext.jsx  — Auth + currentShop (get_user_shops RPC)
src/App.jsx                   — Kaikki reitit
src/components/Sidebar.jsx    — Navigaatio (ehdolliset itemit)
src/lib/indicators/           — Indicator Engine: aov, salesTrend, positionChange, organicConversionRate (engine.js orkestroi)
src/lib/kpi/                  — KPI-normalisointi
src/lib/i18n/translations/    — fi.json, sv.json käännökset
api/cron/                     — Kaikki cron-jobit (Bearer ${CRON_SECRET})
api/chat.js                   — Emma AI -chat-endpoint
api/lib/slack.js              — Slack-webhookhelper
scripts/db.cjs                — Supabase-yhteys skripteille
supabase/migrations/          — ~50+ SQL-migraatiota
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
- **Hookit:** TanStack Query useimmissa data-hookeissa (`useIndicators`, `useKPIDashboard`, `useCustomerSegments`, ...). useState + useEffect -malli varasto- ja paste-sivuilla (ks. `useInventory`, `usePasteInventory`).
- **Kaaviot:** Recharts (LineChart, BarChart, PieChart). Värit: brand blue #00b4e9
- **CSV-export:** Puolipiste-erotin (eurooppalainen Excel), UTF-8 BOM. Ks. `src/lib/csvExport.js`
- **RLS:** Kaikki taulut käyttävät Row Level Security. Cron-jobit käyttävät service_role_key.
- **Cron-auth:** Jokainen cron-handler tarkistaa `Authorization: Bearer ${CRON_SECRET}`. Manuaaliseen testaukseen lähetä header mukana.
- **Supabasen 1000 rivin raja:** Paginoi `.range()`:lla kun dataa voi olla yli 1000 riviä.
- **Vercel Pro 5 min:** Serverless-funktioiden maksimi `maxDuration: 300`. Pitkät synkat chunkkeina (esim. ePages historia 5 päivän paloissa).

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

## Verifiointi (LOCKED)

**1. Verifiointisuunnitelma ennen rakentamista.** Ennen monivaiheista toteutusta kirjaa ensin arviointikriteerit: mikä on "valmis" ja mistä sen tunnistaa. Ei kriteerejä → ei rakentamista.

**2. Lainaussääntö.** Kanoninen teksti: `ParasX2/CLAUDE.md` § `Verifiointi (LOCKED)`.

> **Ennen kuin väität dokumentin sanovan jotain, avaa se ja lainaa kohta sanatarkasti. Jos et voi lainata, et voi väittää.**
>
> Käytännössä: sitaatti tai rivinumero jokaiseen väitteeseen. Jos lähde on koodia, tarkista onko se ajossa ennen kuin siteeraat sitä.

Grep todistaa että merkkijono on olemassa. Se ei todista että koodi ajaa. 4.8.2026 tämä ero tuotti sisarrepossa neljä itsevarmaa virhepäätelmää — kuollut generaattori, yhdeksän kuollutta käännösavainta, importoimaton komponentti ja rekisteröimätön cron. Kaikki neljä luettiin oikein.

Havainto voi olla oikea vaikka perustelu on väärä. **Väärällä perustelulla oikeaan tulokseen päätyminen on onnea, ei menetelmä.**

**3. Toisen mallin katselmointi on pakollinen**, kun tuotos sisältää lähdeviittauksia tai faktaväitteitä, koskee kaksi-ID-järjestelmää tai multi-tenant-rajaa, tai muuttaa Data Mastership -sääntöjä, cron-ajoja tai mittarien laskentaa. Reititä `superpowers:code-reviewer` tai `/code-review`.

Saman mallin itsearviointi ei täytä tätä. 4.8.2026 `hallucination-detector` antoi kolmelle väärälle lähdeviittaukselle 100/100 — se ei epäonnistunut, se luki samasta kirjastosta.

**Ulkoinen signaali ratkaisee tasatilanteen** — CI, hookit, ajettu kysely — ei mallin oma varmuus.

## Älä tee

- ÄLÄ käytä GA4:n revenue/transactions-dataa
- ÄLÄ hardkoodaa store_id/shop_id arvoja (paitsi skripteissä joissa on selkeä mapping)
- ÄLÄ unohda paginoida Supabase-kyselyitä kun rivimäärä voi ylittää 1000
- ÄLÄ luo uusia tiedostoja turhaan — editoi olemassa olevia
- ÄLÄ lisää ylimääräistä error handlingia, docstringejä tai type annotaatioita koodiin jota et muokkaa
