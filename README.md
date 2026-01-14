# Vilkas Analytics

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  🟩 PROJEKTI: VilkasAnalytics                                                ║
║  📁 KANSIO: /Desktop/VilkasAnalytics                                         ║
║  🗄️ SUPABASE: tlothekaphtiwvusgwzh.supabase.co                               ║
║  🌐 VERCEL: vilkas-analytics.vercel.app                                      ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  ⚠️ TÄMÄ ON ERI PROJEKTI KUIN:                                               ║
║     🟦 VilkasInsight (/Desktop/VilkasInsight-Vercel)                         ║
║        → abbwfjishojcbifbruia.supabase.co                                    ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

Verkkokauppiaan sisäinen analytiikkasovellus, joka yhdistää datan useista lähteistä yhteen näkymään.

## Ominaisuudet

- **Kojelauta** - Myyntidatan yleiskatsaus (ePages)
- **Search Console** - Google-hakujen seuranta (positiot, klikkaukset, impressiot)
- **Google Analytics** - Liikennelähteet, bounce rate, landing pages
- **Indikaattorit** - 7 liiketoiminnan avainmittaria
- **Analyysit** - AI-pohjaiset oivallukset ja suositukset

## Tech Stack

| Kerros | Teknologia |
|--------|------------|
| Frontend | React 18, Vite, Tailwind CSS, shadcn/ui |
| Backend | Supabase (PostgreSQL + Edge Functions) |
| Auth | Supabase Auth (Google OAuth) |
| APIs | ePages, Google Search Console, Google Analytics 4 |
| Hosting | Vercel |

## Datan hierarkia

```
ePages     = MASTER      Myynti, tilaukset         100% luotettava
GSC        = SEO         Haut, positiot            100% luotettava
GA4        = BEHAVIORAL  Traffic, bounce rate      ~70% kattavuus (ad blockers)
```

**Tärkeää:** GA4:stä EI käytetä transaktiotietoja - ePages on ainoa totuus myyntidatalle.

## Kehitysympäristö

### Vaatimukset

- Node.js 18+
- npm tai pnpm

### Asennus

```bash
# Kloonaa repo
git clone https://github.com/MardeX7/vilkas-analytics.git
cd vilkas-analytics

# Asenna riippuvuudet
npm install

# Kopioi ympäristömuuttujat
cp .env.example .env.local
# Täytä oikeat arvot .env.local -tiedostoon

# Käynnistä dev-serveri
npm run dev
```

Sovellus käynnistyy osoitteeseen http://localhost:5173

### Ympäristömuuttujat

```bash
# .env.local
VITE_SUPABASE_URL=https://tlothekaphtiwvusgwzh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Vain backend-skripteille
```

### Skriptit

```bash
npm run dev      # Kehitysserveri
npm run build    # Tuotanto-build
npm run preview  # Esikatsele buildia
npm run lint     # ESLint
```

## Kansiorakenne

```
vilkas-analytics/
├── src/
│   ├── components/     # React-komponentit
│   │   ├── ui/         # shadcn/ui peruskomponentit
│   │   └── auth/       # Kirjautumiskomponentit
│   ├── contexts/       # React Context (Auth, ym.)
│   ├── hooks/          # Custom hooks (useGA4, useGSC, ym.)
│   ├── lib/            # Utilities, Supabase client
│   │   └── indicators/ # Indikaattori-engine
│   └── pages/          # Sivukomponentit
├── api/                # Vercel Serverless Functions
│   └── ga4/            # GA4 OAuth & sync
├── scripts/            # Apuskriptit (sync, calculate)
├── supabase/
│   ├── migrations/     # Tietokantamigraatiot
│   └── functions/      # Edge Functions
└── public/             # Staattiset tiedostot
```

## Tietokanta (Supabase)

### Päätaulut

| Taulu | Kuvaus |
|-------|--------|
| `shops` | Kaupat (multi-tenant) |
| `orders` | Tilaukset (ePages) |
| `products` | Tuotteet |
| `gsc_search_analytics` | Search Console data |
| `ga4_analytics` | Google Analytics data |
| `ga4_tokens` | GA4 OAuth tokenit |
| `indicators` | Lasketut indikaattorit |

### Views

- `v_ga4_daily_summary` - Päivittäinen GA4-yhteenveto
- `v_ga4_traffic_sources` - Liikennelähteet
- `v_ga4_landing_pages` - Landing page -tilastot

## Indikaattorit (MVP)

| ID | Nimi | Lähde |
|----|------|-------|
| `sales_trend` | Myyntitrendi | ePages |
| `aov` | Keskiostos (AOV) | ePages |
| `gross_margin` | Myyntikate | ePages |
| `position_change` | SEO-positiot | GSC |
| `brand_vs_nonbrand` | Non-brand % | GSC |
| `organic_conversion_rate` | Orgaaninen CR | ePages + GSC |
| `stock_availability_risk` | Varastoriski | ePages + GSC |

## Deployment

### Vercel

**HUOM: Git push EI aina triggeröi Vercel deployta automaattisesti!**

```bash
# ✅ KÄYTÄ AINA TÄTÄ deployaukseen:
cd /Users/markkukorkiakoski/Desktop/VilkasAnalytics
npx vercel --prod --yes

# ❌ ÄLÄ luota pelkkään git pushiin - webhook ei aina toimi!
```

**Deploy-prosessi:**
1. Tee muutokset ja commitoi
2. `git push origin main`
3. **AJA AINA:** `npx vercel --prod --yes`
4. Tarkista: https://vercel.com/mardex7s-projects/vilkas-analytics

### Ympäristömuuttujat Vercelissä

Aseta seuraavat Vercel Dashboard > Settings > Environment Variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `GOOGLE_CLIENT_ID` (GA4 OAuth)
- `GOOGLE_CLIENT_SECRET` (GA4 OAuth)

## Liittyvät projektit

| Projekti | Kuvaus | Supabase |
|----------|--------|----------|
| **VilkasAnalytics** (tämä) | Kauppiaan oma analytiikka | `tlothekaphtiwvusgwzh` |
| VilkasInsight | Benchmark-palvelu | `abbwfjishojcbifbruia` |

**Älä sekoita näitä tietokantoja keskenään!**

## Lisenssi

Proprietary - Vilkas Group Oy
