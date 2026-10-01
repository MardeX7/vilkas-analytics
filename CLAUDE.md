# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Kieli

Kommunikoi suomeksi. Koodikommentit ja commit-viestit englanniksi.

## Projektin kuvaus

> **TÄSSÄ REPOSSA ON KAKSI KAUPPAA.** Automaalit.net (Suomi, EUR) **ja**
> Billackering.eu (Ruotsi, SEK). Jokainen kysely, näkymä ja cron on
> kauppakohtainen — mikään luku ei ole "koko liiketoiminta" ellei se ole
> nimenomaan summattu molemmista. Automaalit.netiä koskeva analytiikkatyö
> kuuluu **tänne**, ei `~/dev/Automaalit-net`-repoon, joka on
> uutiskirjedashboard (MailerLite).

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

### Valuutta: älä lue sitä orders- tai stores-taulusta

**`orders.currency` on väärä molemmissa kaupoissa**, eri suuntaan ja eri aikaan.
Automaalitilla (EUR-kauppa) arvo oli EUR tammikuun 2026 loppuun ja on ollut SEK
helmikuusta 2026; tammikuu on sekakuukausi (EUR 283 / SEK 15). Billackeringilla
arvo vaihtui joulukuussa 2025, eli siellä se on nyt oikein ja oli ennen väärin.

Juurisyy on kahdessa synkkatiedostossa, jotka kirjoittavat eri kovakoodatun
vakion:

```js
api/cron/sync-epages.js:152        ... : 'SEK'   // päiväcron
api/cron/sync-epages-range.js:165  ... : 'EUR'   // historiatäyttö
```

Molemmat testaavat `typeof order.grandTotal === 'object'`, mutta ePages palauttaa
`grandTotal`in **merkkijonona** ("806", "294.03"), joten ehto on aina epätosi ja
koodi ottaa aina kovakoodatun haaran. Oikea arvo `currencyId` on vieressä samassa
vastauksessa eikä sitä lueta koskaan. Vaihtumispäivä on kaupoittain eri, koska
kummankin historiatäyttö päättyi eri aikaan. Koskemattomat rivit kantavat lisäksi
skeeman oletusta `currency TEXT DEFAULT 'EUR'`
(`001_initial_schema.sql:117`).

**`stores.currency` on hyödytön** — se on `'EUR'` **molemmille** kaupoille, koska
`001_initial_schema.sql:15` asettaa oletuksen eikä sitä koskaan ylikirjoiteta.
Se ei siis ole väärä vain toiselle, vaan vakio.

Lue valuutta `shops.currency`-sarakkeesta (oikein: FI EUR, SE SEK) tai
`products.price_currency`ista (FI 461 EUR / 1 SEK, SE 470 SEK / 0 EUR).
Summat itsessään ovat aina kaupan omassa valuutassa; vain leima on rikki.
`*_eur`-sarakkeita eikä `exchange_rates`-taulua ei tässä repossa ole.

### Tilauksen tila: hylätty tilaus ei ole myyntiä

ePages ei lähetä tilaukselle tilakenttää. Tila on tilauksen omina aikaleimoina,
ja `api/lib/epagesOrderStatus.js` johtaa niistä `orders.status`in:

| ePages | `status` | Myyntiä? |
|---|---|---|
| `rejectedOn` | `cancelled` | ei |
| `returnedOn` | `returned` | kyllä, ePages laskee mukaan |
| `deliveredOn` | `delivered` | kyllä |
| `dispatchedOn` | `shipped` | kyllä |
| `closedOn` ilman lähetystä | `closed` | kyllä, ePages laskee mukaan |
| `paidOn` | `paid` | kyllä |
| ei mitään | `pending` | kyllä |

Ensimmäinen osuva rivi ylhäältä voittaa.

Myyntinäkymät ja -kyselyt rajaavat `status <> 'cancelled'`, ja uuden kyselyn on
tehtävä samoin. Hylkäys tulee joskus viikkoja tilauksen jälkeen, joten päiväsynkka
päivittää myös vanhempien tilausten tilan (`updatedFrom`).

Ennen 1.10.2026 jokainen rivi oli `pending` ja hylätyt laskettiin myyntiin
(FI 10/2025–9/2026: 77 tilausta, 7 753,79 €; SE 46). Jos `select status, count(*) from orders
group by 1` palauttaa pelkkää `pending`iä, korjausta ei ole ajettu:
`node scripts/backfill_order_status.js` vertaa ja `--write` kirjoittaa.

## Kaksi-ID-järjestelmä (KRIITTINEN)

- **store_id** = ePages-taulut: `orders`, `products`, `order_line_items`, `gsc_*`, `ga4_tokens`.
  Huom: `stores.id` on **uuid**, mutta `shops.store_id` on **text** joka sisältää
  saman uuid:n merkkijonona — liitos on `shops.store_id::uuid = stores.id`.
- **shop_id** (shops.id, UUID) = analytics-taulut: `weekly_analyses`, `support_tickets`, `paste_*`, `growth_engine_snapshots` jne.

Käytä `useCurrentShop()` hookia — se palauttaa molemmat. Konfiguraatio: `src/config/storeConfig.js`.

## Shop Conductor (MCP) — suora yhteys kauppoihin

Vilkas Group Oy:n Shop Conductor antaa Claudelle luku- ja kirjoitusyhteyden
ePages-kauppoihin. Se on Claude Coden istuntotyökalu, ei sovelluksen
integraatio: OAuth tukee vain selainkirjautumista (authorization_code + PKCE),
joten cronit ja `api/` käyttävät edelleen ePagesin REST-tokeneita.

**Kummallakin kaupalla on oma Shop Conductor -tili ja oma sähköposti.** Siksi
`.mcp.json`:ssa on kaksi palvelinta, ja kauppa näkyy työkalun nimessä:

| MCP-palvelin | Kauppa | Shop Conductor `shop_id` | Työkalut |
|---|---|---|---|
| `automaalit` | Automaalit.net | `38c68222-2253-453a-96bc-188f10a70161` | `mcp__automaalit__*` |
| `billackering` | Billackering.eu | `058d3c34-caad-4ed9-bf09-bbb24e522d38` | `mcp__billackering__*` |

Todennettu 1.10.2026: kummankin palvelimen `list_shops` palautti vain oman
kauppansa. Automaalien tili oli silloin Shop Conductorin perustasolla:
kirjoitustyökalut ja *Full customer data* ovat lukossa ("needs a higher access
level"), ja tasoa pyydettiin tuelta (support@shopconductor.eu). Jos
`update_product` palauttaa `not_enabled`, syy on tämä eikä yhteys.
`update_product` muuttaa myös hintaa ja saldoa, ei vain tekstejä.

Sävytysvaraston erillinen ePages-instanssi ei kuulu näihin yhteyksiin.
Automaalien tili on käytössä myös `~/dev/automaalit-support`-repossa
palvelimella `automaalit-tuki`. Sen on tarkoitus olla oma yhteytensä, jolla on
vain lukuoikeus; tila ja avoimet kohdat: `automaalit-support/docs/security.md`,
lukko 6.
Nationalflags.shop on eri tilillä ja eri repossa.

- **Kolmas ID.** Shop Conductorin `shop_id` ei ole sama kuin Kaupat-taulukon
  `store_id` tai `shop_id`. Älä käytä niitä ristiin.
- **Jos yhteys kirjaudutaan uudelleen**, tarkista `list_shops`: palvelimen
  pitää palauttaa vain oma kauppansa. Jos se palauttaa toisen, kirjautuminen
  tehtiin väärällä sähköpostilla.
- **Kirjoitukset kysyvät luvan.** Älä lisää kummankaan palvelimen
  kirjoitustyökaluja allow-listaan. Lupakysely näyttää palvelimen nimen, ja se
  on viimeinen kohta jossa väärä kauppa jää kiinni.
- **Live-data voittaa Supabasen.** Shop Conductor lukee ePagesia suoraan;
  Supabase on synkattu kopio, jossa on tunnettuja vikoja (ks. valuutta yllä).

### Rahaluvut tarkistetaan `get_sales`illa

Ennen kuin raportoit tilausmäärän tai myynnin, aja sama jakso `get_sales`illa.
Se on ePagesin oma laskenta: hylätyt pois, palautetut mukana, verollinen
`totalGrossRevenue` ja veroton `totalNetRevenue`. Kannan vastine on `count(*)`,
`sum(grand_total)` ja `sum(total_before_tax)` rajauksella `status <> 'cancelled'`.

- **Rajat kaupan paikallisaikana**, offset mukaan: Helsinki `+03:00` kesällä ja
  `+02:00` talvella, Tukholma tuntia vähemmän.
- **Enintään vuosi** kutsua kohden.
- **Ei kappalemääriä eikä rivejä**, vaikka työkalun kuvaus lupaa. Tuote- ja
  litramäärät tarkistetaan muualta.
- **Odotettu ero on pieni ja tunnettu.** Tilakorjauksen kuivaharjoitus
  1.10.2026 ennusti, että korjauksen jälkeen FI täsmää joka kuukausi
  tilausmäärältään ja summaltaan sentilleen. Poikkeus ovat tilaukset, joita on
  muokattu yli 7 päivää luonnin jälkeen (yhteensä −420 € 21 kuukaudessa), koska
  päiväsynkka kirjoittaa summat uudelleen vain 7 päivän ajan. Muu ero on vika,
  ei pyöristystä.
- **Eron selitys:** `list_orders_pseudonymous` suodattimella `rejected_on=true`
  listaa hylätyt, ja `scripts/backfill_order_status.js` vertaa kaikki kuukaudet.

### ePages-sudenkuopat

Opittu Nationalflags.shopissa elo–syyskuussa 2026
(`~/dev/NationalflagsAnalytics`). Ne ovat alustan ominaisuuksia, mutta näissä
kaupoissa niitä ei ole vielä todennettu.

- **`update_category` korvaa koko kieliversion.** Työkalun kuvaus lupaa
  päivittää vain annetut kentät, mutta pois jätetyt kentät putoavat kaupan
  oletuslokaalin arvoihin. Lue kategoria ensin ja kirjoita aina koko setti:
  `name`, `navigation_caption` (jos on), `page_title`, `description`. Oleta
  `update_product`in toimivan samoin, kunnes toisin todistetaan. Lue tulos
  takaisin jokaisella kielellä. Tarkista kummankin kaupan oletuslokaali ennen
  ensimmäistä kirjoitusta.
- **Kirjoitus ei tyhjennä kaupan välimuistia.** API-luku näyttää uuden arvon
  heti, mutta julkinen sivu näyttää vanhaa, kunnes välimuisti tyhjennetään
  ePagesin hallinnasta. Älä väitä muutosta näkyväksi ennen kuin olet
  tarkistanut sivun HTML:n.
- **Variaatiotuote on N+1 sivua.** Pääartikkelilla ja jokaisella variaatiolla
  on oma otsikko, kuvaus ja URL. Hae ensin `list_product_variations` ja kirjoita
  jokainen, jokaisella kielellä.
- **Piilotetut alakategoriat.** `get_category` ja `list_categories` palauttavat
  vain navigaatiossa näkyvät alakategoriat, eikä alias kelpaa hakuun (vaatii
  UUID:n). Sivun UUID ja todellinen polku löytyvät julkisen sivun lähdekoodista:
  `epConfig.objectGUID` ja `epConfig.objectPath`.
- **`visible:false` ei poista sivua.** Piilotettu kategoria vastaa yhä 200:lla.
  Poisto hakukoneista vaatii 301-ohjauksen tai noindexin ePagesin hallinnassa.
- **Sisältösivut eivät näy Shop Conductorille.** Ohje- ja blogisivut ovat eri
  objekteja kuin kategoriat, ja `get_category` palauttaa niille 404. Ne
  muokataan käsin hallinnassa. `update_legal_page` ei muuta sivun otsikkoa.

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
api/lib/epagesOrderStatus.js  — Tilauksen tila ePagesin aikaleimoista (molemmat synkat)
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
