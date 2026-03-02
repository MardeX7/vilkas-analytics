/**
 * QuickPrompts - Kategorisoidut johtajakysymykset Emmalle
 *
 * 9 kategoriaa älykkäitä kysymyksiä:
 * 1. Tilannekuva & ymmärrys
 * 2. Kasvu & myynti
 * 3. Ennusteet & tavoitteet
 * 4. Asiakkaat
 * 5. Tuotteet & varasto
 * 6. SEO & näkyvyys
 * 7. Toimenpiteet
 * 8. Selittävät
 * 9. Meta-kysymykset
 *
 * Versio: 3.0 - Kategorisoidut johtajakysymykset
 */

import { useState, useMemo } from 'react'
import {
  TrendingUp,
  Target,
  HelpCircle,
  Package,
  Users,
  Search,
  Lightbulb,
  Eye,
  ChevronRight,
  Sparkles
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

/**
 * Question categories with icons and colors
 */
const CATEGORIES = {
  tilannekuva: {
    id: 'tilannekuva',
    icon: Eye,
    color: 'violet',
    labelFi: 'Kasvuanalyysi',
    labelSv: 'Tillväxtanalys'
  },
  kasvu: {
    id: 'kasvu',
    icon: TrendingUp,
    color: 'emerald',
    labelFi: 'Liikevaihto',
    labelSv: 'Omsättning'
  },
  tavoitteet: {
    id: 'tavoitteet',
    icon: Target,
    color: 'blue',
    labelFi: 'Tavoite & ennuste',
    labelSv: 'Mål & prognos'
  },
  asiakkaat: {
    id: 'asiakkaat',
    icon: Users,
    color: 'pink',
    labelFi: 'Asiakkaat & B2B',
    labelSv: 'Kunder & B2B'
  },
  varasto: {
    id: 'varasto',
    icon: Package,
    color: 'amber',
    labelFi: 'Tuotteet & paketit',
    labelSv: 'Produkter & paket'
  },
  seo: {
    id: 'seo',
    icon: Search,
    color: 'cyan',
    labelFi: 'Näkyvyys & markkina',
    labelSv: 'Synlighet & marknad'
  },
  toimenpiteet: {
    id: 'toimenpiteet',
    icon: Lightbulb,
    color: 'orange',
    labelFi: 'Päätökset',
    labelSv: 'Beslut'
  },
  selittavat: {
    id: 'selittavat',
    icon: HelpCircle,
    color: 'slate',
    labelFi: 'Haasta',
    labelSv: 'Utmana'
  },
  meta: {
    id: 'meta',
    icon: Sparkles,
    color: 'purple',
    labelFi: 'Strategia',
    labelSv: 'Strategi'
  }
}

/**
 * All questions organized by category
 * Finnish primary, Swedish in comments
 */
const QUESTIONS = {
  tilannekuva: [
    { id: 't1', text: 'Millä todennäköisyydellä saavutamme 20% kasvutavoitteen? Mikä on suurin riski?' },
    { id: 't2', text: 'Onko kasvumme volyymiä vai konversiota? Erota nämä.' },
    { id: 't3', text: 'Menetämmekö markkinaosuutta? Vertaa orgaanista trendiä YoY.' },
    { id: 't4', text: 'Mikä rakenteellinen heikkous hidastaa kasvua eniten?' },
    { id: 't5', text: 'Onko jokin mittari hälyttävällä tasolla juuri nyt?' }
  ],
  kasvu: [
    { id: 'k1', text: 'Kasvaako liikevaihto orgaanisesti vai olemmeko kampanjariippuvaisia?' },
    { id: 'k2', text: 'Jos emme tee mitään, mihin nykyinen trajectory vie meidät tilikauden lopussa?' },
    { id: 'k3', text: 'Onko top 10 SKU:n osuus >50%? Arvioi keskittymäriski.' },
    { id: 'k4', text: 'Paljonko päivämyynnin pitäisi olla tavoitteen saavuttamiseksi? Onko realistista?' },
    { id: 'k5', text: 'Miten AOV kehittyy ja mikä sitä ajaa – volyymi vai hinta?' }
  ],
  tavoitteet: [
    { id: 'ta1', text: 'Vertaa edistymistä viime tilikauteen – olemmeko edellä vai jäljessä ja miksi?' },
    { id: 'ta2', text: 'Kuinka monta kauppapäivää jäljellä ja mikä on vaadittu päivävauhti? Haasta realismi.' },
    { id: 'ta3', text: 'Mikä uhkaa tavoitteen saavuttamista eniten? Anna aikataulu korjaukselle.' },
    { id: 'ta4', text: 'Onko 20% tavoite realistinen vai pitäisikö strategiaa muuttaa?' },
    { id: 'ta5', text: 'Onko ennuste realistinen vai tarvitaanko välittömiä toimenpiteitä?' }
  ],
  asiakkaat: [
    { id: 'a1', text: 'Onko B2B-pipeline todellinen vai toiveajattelua? Vaadi todisteet ja aikataulu.' },
    { id: 'a2', text: 'Palaavien asiakkaiden arvo vs. uudet – pitäisikö keskittyä retentioon?' },
    { id: 'a3', text: 'Mitkä entry-tuotteet tuovat uusia asiakkaita ja miten LTV kehittyy?' },
    { id: 'a4', text: 'Onko asiakashankinnassa trendi joka uhkaa kasvua?' },
    { id: 'a5', text: 'Miten B2B- ja B2C-asiakkaat eroavat kannattavuudessa?' }
  ],
  varasto: [
    { id: 'v1', text: 'Onko pakettien osuus liikevaihdosta >20%? Jos ei, strategia alisuoriutuu.' },
    { id: 'v2', text: 'Mitkä hero-tuotteet ovat loppumassa ja mikä on myyntivaikutus?' },
    { id: 'v3', text: 'Heikentävätkö jotkut tuotteet katetta – pitäisikö ne poistaa?' },
    { id: 'v4', text: 'Onko varastoon sitoutunut pääomaa tuotteissa jotka eivät tue kasvua?' },
    { id: 'v5', text: 'Analysoi tuoteroolien jakauma ja tunnista riskit.' }
  ],
  seo: [
    { id: 's1', text: 'Menetämmekö orgaanista näkyvyyttä? Jos trendi laskeva → tarvitaanko SEO-sprintti?' },
    { id: 's2', text: 'Tukeeko orgaaninen liikenne kasvutavoitetta vai olemmeko paid-riippuvaisia?' },
    { id: 's3', text: 'Mitkä hakutermit tuovat myyntiä ja onko positiossa uhkia?' },
    { id: 's4', text: 'Missä kategorioissa näkyvyys ei muutu myynniksi – miksi?' },
    { id: 's5', text: 'Pitäisikö SEO-investointi kohdistaa eri kategorioihin?' }
  ],
  toimenpiteet: [
    { id: 'to1', text: 'Anna 3 strategista toimenpidettä seuraavalle 30 päivälle – priorisoi vaikutuksen mukaan.' },
    { id: 'to2', text: 'Mitä meidän pitäisi lopettaa tekemästä? Mikä ei tuota tulosta?' },
    { id: 'to3', text: 'Jos budjetti +10 000€, mihin allokoisit ja miksi?' },
    { id: 'to4', text: 'Mitä pitäisi valmistella seuraavaa sesonkia varten jo nyt?' },
    { id: 'to5', text: 'Mikä näyttää kiireelliseltä mutta ei ole strategisesti tärkeää?' }
  ],
  selittavat: [
    { id: 'se1', text: 'Missä olemme haavoittuvia vaikka luvut näyttävät hyviltä?' },
    { id: 'se2', text: 'Mikä on suurin piiloriski jonka data paljastaa?' },
    { id: 'se3', text: 'Ennusta 3 kuukautta eteenpäin: mihin olemme menossa jos emme muuta mitään?' },
    { id: 'se4', text: 'Mitä kriittistä tietoa meiltä puuttuu päätöksentekoon?' },
    { id: 'se5', text: 'Miksi konversio muuttui ja miten se vaikuttaa kasvutavoitteeseen?' }
  ],
  meta: [
    { id: 'm1', text: 'Missä olemme strategisesti vahvempia kuin viime tilikaudella – ja miksi?' },
    { id: 'm2', text: 'Onko kasvumallimme kestävä vai rakennettu hauraan perustan päälle?' },
    { id: 'm3', text: 'Mikä signaali ennakoi seuraavaa isoa muutosta – hyvää tai huonoa?' },
    { id: 'm4', text: 'Jos joutuisit valitsemaan: panostaisitko Suomeen vai Ruotsiin seuraavat 90 päivää?' }
  ]
}

/**
 * Get smart recommended questions based on data
 */
function getRecommendedQuestions(growthEngineData) {
  const recommended = []

  // Always lead with growth probability
  recommended.push({
    id: 'rec_growth_prob',
    category: 'tilannekuva',
    text: 'Millä todennäköisyydellä saavutamme 20% kasvutavoitteen? Mikä on suurin riski?'
  })

  if (!growthEngineData) {
    recommended.push({
      id: 'rec_blocker',
      category: 'kasvu',
      text: 'Jos emme tee mitään, mihin nykyinen trajectory vie meidät tilikauden lopussa?'
    })
    recommended.push({
      id: 'rec_action',
      category: 'toimenpiteet',
      text: 'Anna 3 strategista toimenpidettä seuraavalle 30 päivälle – priorisoi vaikutuksen mukaan.'
    })
    return recommended
  }

  const { salesEfficiency, demandGrowth, productLeverage } = growthEngineData

  // Conversion issues → challenge growth quality
  if (salesEfficiency?.metrics?.conversionRate?.yoyChange < -5) {
    recommended.push({
      id: 'rec_conv',
      category: 'kasvu',
      text: 'Kasvaako liikevaihto orgaanisesti vai olemmeko kampanjariippuvaisia?'
    })
  }

  // Stock issues → challenge product strategy
  if (productLeverage?.metrics?.seoStockHealth?.current < 85) {
    recommended.push({
      id: 'rec_stock',
      category: 'varasto',
      text: 'Mitkä hero-tuotteet ovat loppumassa ja mikä on myyntivaikutus?'
    })
  }

  // SEO decline → challenge market share
  if (demandGrowth?.metrics?.organicClicks?.yoyChange < -10) {
    recommended.push({
      id: 'rec_seo',
      category: 'seo',
      text: 'Menetämmekö orgaanista näkyvyyttä? Jos trendi laskeva → tarvitaanko SEO-sprintti?'
    })
  }

  // Always end with strategic action
  recommended.push({
    id: 'rec_action',
    category: 'toimenpiteet',
    text: 'Mitä meidän pitäisi lopettaa tekemästä? Mikä ei tuota tulosta?'
  })

  return recommended.slice(0, 4)
}

/**
 * Get color classes for category
 */
function getCategoryColorClasses(color) {
  const colors = {
    violet: 'bg-violet-500/10 text-violet-600 border-violet-500/20 hover:bg-violet-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20',
    blue: 'bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/20',
    pink: 'bg-pink-500/10 text-pink-600 border-pink-500/20 hover:bg-pink-500/20',
    amber: 'bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20',
    cyan: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20 hover:bg-cyan-500/20',
    orange: 'bg-orange-500/10 text-orange-600 border-orange-500/20 hover:bg-orange-500/20',
    slate: 'bg-slate-500/10 text-slate-600 border-slate-500/20 hover:bg-slate-500/20',
    purple: 'bg-purple-500/10 text-purple-600 border-purple-500/20 hover:bg-purple-500/20'
  }
  return colors[color] || colors.slate
}

/**
 * QuickPrompts - Compact version for chat header
 * Shows recommended questions based on data
 */
export function QuickPrompts({ onSelect, disabled, growthEngineData }) {
  const recommended = useMemo(() =>
    getRecommendedQuestions(growthEngineData),
    [growthEngineData]
  )

  return (
    <div className="px-4 py-3 border-b border-card-border/30">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2 font-medium">
        Nopeat kysymykset
      </p>
      <div className="flex flex-wrap gap-1.5">
        {recommended.map((q) => {
          const cat = CATEGORIES[q.category]
          const Icon = cat?.icon || HelpCircle

          return (
            <button
              key={q.id}
              onClick={() => onSelect(q.text)}
              disabled={disabled}
              className={`
                inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium
                rounded-lg border transition-all
                disabled:opacity-50 disabled:cursor-not-allowed
                ${getCategoryColorClasses(cat?.color)}
              `}
            >
              <Icon className="h-3 w-3 flex-shrink-0" />
              <span className="truncate max-w-[180px]">{q.text}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * QuickPromptsExpanded - Full category browser
 * Used in the main Analyysit page for exploring all questions
 */
export function QuickPromptsExpanded({ onSelect, disabled, growthEngineData }) {
  const [activeCategory, setActiveCategory] = useState(null)
  const { language } = useTranslation()

  const recommended = useMemo(() =>
    getRecommendedQuestions(growthEngineData),
    [growthEngineData]
  )

  const isFi = language === 'fi'

  return (
    <div className="space-y-4">
      {/* Recommended Questions */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-violet-500" />
          <h4 className="text-sm font-semibold text-foreground">
            {isFi ? 'Suositellut kysymykset' : 'Rekommenderade frågor'}
          </h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {recommended.map((q) => {
            const cat = CATEGORIES[q.category]
            const Icon = cat?.icon || HelpCircle

            return (
              <button
                key={q.id}
                onClick={() => onSelect(q.text)}
                disabled={disabled}
                className={`
                  flex items-center gap-3 px-4 py-3 text-left text-sm
                  rounded-xl border transition-all
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${getCategoryColorClasses(cat?.color)}
                `}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="line-clamp-2">{q.text}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Category Tabs */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-3">
          {isFi ? 'Kaikki kategoriat' : 'Alla kategorier'}
        </h4>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {Object.values(CATEGORIES).map((cat) => {
            const Icon = cat.icon
            const isActive = activeCategory === cat.id

            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(isActive ? null : cat.id)}
                className={`
                  inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                  rounded-lg border transition-all
                  ${isActive
                    ? getCategoryColorClasses(cat.color)
                    : 'bg-background-subtle border-card-border text-foreground-muted hover:bg-background-subtle/80'
                  }
                `}
              >
                <Icon className="h-3 w-3" />
                {isFi ? cat.labelFi : cat.labelSv}
              </button>
            )
          })}
        </div>

        {/* Questions in selected category */}
        {activeCategory && QUESTIONS[activeCategory] && (
          <div className="space-y-1.5 animate-in fade-in duration-200">
            {QUESTIONS[activeCategory].map((q) => (
              <button
                key={q.id}
                onClick={() => onSelect(q.text)}
                disabled={disabled}
                className="
                  w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-sm
                  bg-background-subtle/50 hover:bg-background-subtle
                  border border-card-border/50 rounded-lg transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                <span>{q.text}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default QuickPrompts
