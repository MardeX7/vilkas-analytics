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
    labelFi: 'Tilannekuva',
    labelSv: 'Lägesbild'
  },
  kasvu: {
    id: 'kasvu',
    icon: TrendingUp,
    color: 'emerald',
    labelFi: 'Kasvu & myynti',
    labelSv: 'Tillväxt & försäljning'
  },
  tavoitteet: {
    id: 'tavoitteet',
    icon: Target,
    color: 'blue',
    labelFi: 'Tavoitteet',
    labelSv: 'Mål'
  },
  asiakkaat: {
    id: 'asiakkaat',
    icon: Users,
    color: 'pink',
    labelFi: 'Asiakkaat',
    labelSv: 'Kunder'
  },
  varasto: {
    id: 'varasto',
    icon: Package,
    color: 'amber',
    labelFi: 'Tuotteet',
    labelSv: 'Produkter'
  },
  seo: {
    id: 'seo',
    icon: Search,
    color: 'cyan',
    labelFi: 'Näkyvyys',
    labelSv: 'Synlighet'
  },
  toimenpiteet: {
    id: 'toimenpiteet',
    icon: Lightbulb,
    color: 'orange',
    labelFi: 'Toimenpiteet',
    labelSv: 'Åtgärder'
  },
  selittavat: {
    id: 'selittavat',
    icon: HelpCircle,
    color: 'slate',
    labelFi: 'Selitä',
    labelSv: 'Förklara'
  },
  meta: {
    id: 'meta',
    icon: Sparkles,
    color: 'purple',
    labelFi: 'Syvällinen',
    labelSv: 'Djupgående'
  }
}

/**
 * All questions organized by category
 * Finnish primary, Swedish in comments
 */
const QUESTIONS = {
  tilannekuva: [
    { id: 't1', text: 'Anna tilannekatsaus: myynti, asiakkaat, varasto, näkyvyys.' },
    { id: 't2', text: 'Miten tämä viikko vertautuu viime vuoden vastaavaan viikkoon?' },
    { id: 't3', text: 'Mikä selittää Growth Engine -indeksin muutoksen?' },
    { id: 't4', text: 'Onko jokin mittari hälyttävällä tasolla juuri nyt?' },
    { id: 't5', text: 'Onko tämä viikko linjassa sesongin kanssa vai poikkeama?' }
  ],
  kasvu: [
    { id: 'k1', text: 'Paljonko päivämyynnin pitäisi olla, jotta tilikauden tavoite toteutuu?' },
    { id: 'k2', text: 'Miten keskitilaus (AOV) on kehittynyt ja miksi?' },
    { id: 'k3', text: 'Kasvaako liikevaihto orgaanisesti vai kampanjoiden kautta?' },
    { id: 'k4', text: 'Missä on suurin kasvupotentiaali juuri nyt?' },
    { id: 'k5', text: 'Mitkä tuotteet tai kategoriat vetävät kasvua?' }
  ],
  tavoitteet: [
    { id: 'ta1', text: 'Miten tilikausi etenee tavoitteeseen nähden?' },
    { id: 'ta2', text: 'Kuinka monta kauppapäivää tavoitteeseen on jäljellä ja mikä on vaadittu päivävauhti?' },
    { id: 'ta3', text: 'Vertaa edistymistämme viime tilikauden samaan ajankohtaan.' },
    { id: 'ta4', text: 'Onko ennuste realistinen vai tarvitaanko toimenpiteitä?' },
    { id: 'ta5', text: 'Mikä uhkaa tavoitteen saavuttamista eniten?' }
  ],
  asiakkaat: [
    { id: 'a1', text: 'Miten B2B- ja B2C-asiakkaat eroavat ostokäyttäytymiseltään?' },
    { id: 'a2', text: 'Mikä on palaavien asiakkaiden elinkaarioarvo vs. uudet?' },
    { id: 'a3', text: 'Mitkä tuotteet tuovat meille uusia asiakkaita?' },
    { id: 'a4', text: 'Miten asiakashankinta on muuttunut viime kuukausina?' },
    { id: 'a5', text: 'Ostavatko asiakkaat enemmän vai useammin?' }
  ],
  varasto: [
    { id: 'v1', text: 'Mitkä hero-tuotteet vetävät myyntiä ja onko niitä varastossa?' },
    { id: 'v2', text: 'Analysoi tuoteroolien jakauma: herot, ankkurit, täyttäjät, häntä.' },
    { id: 'v3', text: 'Mitkä tuotteet pitäisi tilata lisää ennen kuin varasto loppuu?' },
    { id: 'v4', text: 'Onko sisäänheittotuotteissa (entry) muutoksia?' },
    { id: 'v5', text: 'Mihin tuotteisiin täydennykset pitäisi priorisoida?' }
  ],
  seo: [
    { id: 's1', text: 'Mitkä hakutermit tuovat eniten myyntiä?' },
    { id: 's2', text: 'Onko SEO-positiossa muutoksia jotka vaikuttavat liikevaihtoon?' },
    { id: 's3', text: 'Kasvaako orgaaninen liikenne strategisesti tärkeissä kategorioissa?' },
    { id: 's4', text: 'Mikä on orgaanisen haun konversioprosentti vs. muu liikenne?' },
    { id: 's5', text: 'Tukeeko SEO-näkyvyys tilikauden myyntitavoitetta?' }
  ],
  toimenpiteet: [
    { id: 'to1', text: 'Mikä yksittäinen toimenpide vaikuttaisi eniten tilikauden tavoitteeseen?' },
    { id: 'to2', text: 'Priorisoi tämän viikon 3 tärkeintä tehtävää datan perusteella.' },
    { id: 'to3', text: 'Mitä pitäisi lopettaa tekemästä – mikä ei tuota tulosta?' },
    { id: 'to4', text: 'Mitä pitäisi valmistella seuraavaa sesonkia varten?' },
    { id: 'to5', text: 'Mikä näyttää kiireelliseltä mutta ei ole tärkeää?' }
  ],
  selittavat: [
    { id: 'se1', text: 'Selitä miten Growth Engine -indeksi lasketaan ja mitä se kertoo.' },
    { id: 'se2', text: 'Miksi konversio muuttui ja miten se vaikuttaa liikevaihtoon?' },
    { id: 'se3', text: 'Mitä tuoteroolit (hero, anchor, filler) tarkoittavat käytännössä?' },
    { id: 'se4', text: 'Miten tilikausivertailu huomioi sesonkivaihtelut?' },
    { id: 'se5', text: 'Mitä tästä datasta pitäisi oppia seuraavaa sesonkia varten?' }
  ],
  meta: [
    { id: 'm1', text: 'Missä olemme strategisesti vahvempia kuin viime tilikaudella?' },
    { id: 'm2', text: 'Mikä on suurin piiloriski jonka data paljastaa?' },
    { id: 'm3', text: 'Mitä data ei vielä kerro – mitä tietoa puuttuu?' },
    { id: 'm4', text: 'Ennusta 3 kuukautta eteenpäin: mihin olemme menossa?' }
  ]
}

/**
 * Get smart recommended questions based on data
 */
function getRecommendedQuestions(growthEngineData) {
  const recommended = []

  // Always: Fiscal year progress
  recommended.push({
    id: 'rec_fy',
    category: 'tavoitteet',
    text: 'Miten tilikausi etenee tavoitteeseen nähden?'
  })

  if (!growthEngineData) {
    recommended.push({
      id: 'rec_overview',
      category: 'tilannekuva',
      text: 'Anna tilannekatsaus: myynti, asiakkaat, varasto, näkyvyys.'
    })
    recommended.push({
      id: 'rec_action',
      category: 'toimenpiteet',
      text: 'Priorisoi tämän viikon 3 tärkeintä tehtävää datan perusteella.'
    })
    return recommended
  }

  const { salesEfficiency, demandGrowth, productLeverage } = growthEngineData

  // Conversion issues → ask about growth blockers
  if (salesEfficiency?.metrics?.conversionRate?.yoyChange < -5) {
    recommended.push({
      id: 'rec_conv',
      category: 'kasvu',
      text: 'Missä on suurin kasvupotentiaali juuri nyt?'
    })
  }

  // Stock issues → ask about hero product availability
  if (productLeverage?.metrics?.seoStockHealth?.current < 85) {
    recommended.push({
      id: 'rec_stock',
      category: 'varasto',
      text: 'Mitkä hero-tuotteet vetävät myyntiä ja onko niitä varastossa?'
    })
  }

  // SEO changes → ask about search terms driving revenue
  if (demandGrowth?.metrics?.organicClicks?.yoyChange < -10) {
    recommended.push({
      id: 'rec_seo',
      category: 'seo',
      text: 'Onko SEO-positiossa muutoksia jotka vaikuttavat liikevaihtoon?'
    })
  }

  // Always add prioritized action question
  recommended.push({
    id: 'rec_action',
    category: 'toimenpiteet',
    text: 'Mikä yksittäinen toimenpide vaikuttaisi eniten tilikauden tavoitteeseen?'
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
