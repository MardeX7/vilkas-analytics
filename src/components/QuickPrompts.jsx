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
    { id: 't1', text: 'Mikä vaikutti eniten kokonaisindeksiin viime viikolla?' },
    { id: 't2', text: 'Mitkä kolme mittaria selittävät tämän viikon muutoksen?' },
    { id: 't3', text: 'Onko tämä viikko linjassa sesongin kanssa vai poikkeama?' },
    { id: 't4', text: 'Missä osa-alueessa olemme heikoimmillamme?' },
    { id: 't5', text: 'Mikä kehittyi positiivisesti ilman toimenpiteitä?' }
  ],
  kasvu: [
    { id: 'k1', text: 'Mistä viime viikon myynnin muutos oikeasti johtui?' },
    { id: 'k2', text: 'Mitkä tuotteet tai kategoriat vetävät kasvua?' },
    { id: 'k3', text: 'Kasvaako myynti laadukkaasti vai hinnan kautta?' },
    { id: 'k4', text: 'Mikä rajoittaa myynnin kasvua juuri nyt?' },
    { id: 'k5', text: 'Miltä seuraavat 4 viikkoa näyttävät ilman muutoksia?' }
  ],
  tavoitteet: [
    { id: 'ta1', text: 'Olemmeko matkalla kohti vuositavoitetta?' },
    { id: 'ta2', text: 'Mikä uhkaa tavoitteen saavuttamista eniten?' },
    { id: 'ta3', text: 'Paljonko myynnin pitäisi kasvaa viikkotasolla?' },
    { id: 'ta4', text: 'Mitä pitäisi tapahtua, jotta ennuste paranisi?' },
    { id: 'ta5', text: 'Onko nykyinen tavoite realistinen?' }
  ],
  asiakkaat: [
    { id: 'a1', text: 'Miten palaavien asiakkaiden osuus kehittyi?' },
    { id: 'a2', text: 'Ostavatko asiakkaat enemmän vai useammin?' },
    { id: 'a3', text: 'Onko B2B- ja B2C-asiakkaissa eroja juuri nyt?' },
    { id: 'a4', text: 'Miksi asiakas ei palaa toista kertaa?' },
    { id: 'a5', text: 'Mitkä tuotteet toimivat sisäänheittotuotteina?' }
  ],
  varasto: [
    { id: 'v1', text: 'Mitkä A-tuotteet ovat suurin riski kuukauden aikana?' },
    { id: 'v2', text: 'Onko varastossa pääomaa tuotteissa jotka eivät tue kasvua?' },
    { id: 'v3', text: 'Missä tuotteissa kysyntä ja varasto ovat epätasapainossa?' },
    { id: 'v4', text: 'Mihin tuotteisiin täydennykset pitäisi priorisoida?' },
    { id: 'v5', text: 'Mitkä tuotteet heikentävät katetta eniten?' }
  ],
  seo: [
    { id: 's1', text: 'Onko SEO-näkyvyydessä muutoksia joilla on myyntivaikutus?' },
    { id: 's2', text: 'Mitkä sivut menettivät näkyvyyttä viime viikolla?' },
    { id: 's3', text: 'Kasvaako orgaaninen näkyvyys oikeissa kategorioissa?' },
    { id: 's4', text: 'Missä näkyvyyden kasvu ei vielä näy myynnissä?' },
    { id: 's5', text: 'Tukeeko SEO tulevaa sesonkia riittävästi?' }
  ],
  toimenpiteet: [
    { id: 'to1', text: 'Mitkä 3 asiaa minun kannattaa tehdä seuraavaksi?' },
    { id: 'to2', text: 'Mikä toimenpide tuottaisi suurimman vaikutuksen?' },
    { id: 'to3', text: 'Mitä kannattaisi lopettaa tai vähentää?' },
    { id: 'to4', text: 'Mikä näyttää kiireelliseltä mutta ei ole tärkeää?' },
    { id: 'to5', text: 'Jos aikaa on vain yhteen asiaan, mikä se on?' }
  ],
  selittavat: [
    { id: 'se1', text: 'Selitä yksinkertaisesti miksi kokonaisindeksi muuttui.' },
    { id: 'se2', text: 'Miten tämä mittari vaikuttaa kokonaisuuteen?' },
    { id: 'se3', text: 'Miksi tämä kehitys on ongelma – tai miksi ei?' },
    { id: 'se4', text: 'Miten tämä eroaa viime vuodesta samaan aikaan?' },
    { id: 'se5', text: 'Mitä tästä pitäisi oppia seuraavaa sesonkia varten?' }
  ],
  meta: [
    { id: 'm1', text: 'Missä olemme parempia kuin viime vuonna – ja miksi?' },
    { id: 'm2', text: 'Missä olemme haavoittuvia vaikka luvut näyttävät hyviltä?' },
    { id: 'm3', text: 'Mitä tämä data ei vielä kerro meille?' },
    { id: 'm4', text: 'Mikä signaali ennakoi seuraavaa isoa muutosta?' }
  ]
}

/**
 * Get smart recommended questions based on data
 */
function getRecommendedQuestions(growthEngineData) {
  const recommended = []

  // Always: Overview question
  recommended.push({
    id: 'rec_overview',
    category: 'tilannekuva',
    text: 'Mikä vaikutti eniten kokonaisindeksiin viime viikolla?'
  })

  if (!growthEngineData) {
    recommended.push({
      id: 'rec_goals',
      category: 'tavoitteet',
      text: 'Olemmeko matkalla kohti vuositavoitetta?'
    })
    recommended.push({
      id: 'rec_action',
      category: 'toimenpiteet',
      text: 'Mitkä 3 asiaa minun kannattaa tehdä seuraavaksi?'
    })
    return recommended
  }

  const { salesEfficiency, demandGrowth, productLeverage } = growthEngineData

  // Conversion issues
  if (salesEfficiency?.metrics?.conversionRate?.yoyChange < -5) {
    recommended.push({
      id: 'rec_conv',
      category: 'kasvu',
      text: 'Mikä rajoittaa myynnin kasvua juuri nyt?'
    })
  }

  // Stock issues
  if (productLeverage?.metrics?.seoStockHealth?.current < 85) {
    recommended.push({
      id: 'rec_stock',
      category: 'varasto',
      text: 'Mitkä A-tuotteet ovat suurin riski kuukauden aikana?'
    })
  }

  // SEO changes
  if (demandGrowth?.metrics?.organicClicks?.yoyChange < -10) {
    recommended.push({
      id: 'rec_seo',
      category: 'seo',
      text: 'Mitkä sivut menettivät näkyvyyttä viime viikolla?'
    })
  }

  // Always add action question
  recommended.push({
    id: 'rec_action',
    category: 'toimenpiteet',
    text: 'Jos aikaa on vain yhteen asiaan, mikä se on?'
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
