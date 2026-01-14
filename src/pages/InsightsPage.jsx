/**
 * InsightsPage - AI-powered insights (Coming Soon)
 *
 * This page will contain AI-generated business insights and recommendations.
 * Currently shows a "Coming Soon" placeholder.
 */

import { Sparkles, TrendingUp, Lightbulb, Target, Brain } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

export function InsightsPage() {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background-elevated/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-primary flex-shrink-0" />
            <h1 className="text-lg sm:text-xl lg:text-2xl font-semibold text-foreground">
              {t('nav.insights')}
            </h1>
          </div>
          <p className="text-foreground-muted text-xs sm:text-sm mt-1">
            {t('insights.subtitle')}
          </p>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 py-12 sm:py-16 max-w-4xl mx-auto">
        {/* Coming Soon Hero */}
        <div className="text-center mb-12">
          <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Brain className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
            AI-analytiikka tulossa pian
          </h2>
          <p className="text-foreground-muted text-lg max-w-2xl mx-auto">
            Kehitämme älykästä analytiikkaa, joka antaa sinulle automaattisia oivalluksia ja toimenpidesuosituksia liiketoimintasi kasvattamiseksi.
          </p>
        </div>

        {/* Feature Preview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <div className="bg-background-elevated rounded-xl border border-border p-6">
            <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-green-400" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Automaattiset oivallukset
            </h3>
            <p className="text-foreground-muted text-sm">
              AI tunnistaa tärkeimmät trendit ja poikkeamat myyntidatastasi ja kertoo sinulle mitä tapahtuu.
            </p>
          </div>

          <div className="bg-background-elevated rounded-xl border border-border p-6">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
              <Target className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Toimenpidesuositukset
            </h3>
            <p className="text-foreground-muted text-sm">
              Saat konkreettisia ehdotuksia siitä, mitä kannattaa tehdä myynnin kasvattamiseksi.
            </p>
          </div>

          <div className="bg-background-elevated rounded-xl border border-border p-6">
            <div className="w-12 h-12 bg-orange-500/10 rounded-lg flex items-center justify-center mb-4">
              <Lightbulb className="w-6 h-6 text-orange-400" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Tuote- ja kategoria-analyysi
            </h3>
            <p className="text-foreground-muted text-sm">
              AI analysoi mitkä tuotteet ja kategoriat toimivat parhaiten ja missä on kasvupotentiaalia.
            </p>
          </div>

          <div className="bg-background-elevated rounded-xl border border-border p-6">
            <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center mb-4">
              <TrendingUp className="w-6 h-6 text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Ennusteet ja trendit
            </h3>
            <p className="text-foreground-muted text-sm">
              Näe myyntiennusteet ja tunnista kausivaihtelut ennakoivasti.
            </p>
          </div>
        </div>

        {/* Current Data Location Notice */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 text-center">
          <p className="text-foreground-muted mb-2">
            Etsitkö tuotekategoria-, toimitus- tai selausanalytiikkaa?
          </p>
          <p className="text-foreground text-sm">
            <span className="font-medium">Tuotekategoriat</span> ja <span className="font-medium">Toimitus & Maksu</span> löytyvät nyt <span className="text-primary font-semibold">Myynti</span>-sivulta.
            <br />
            <span className="font-medium">Selailukäyttäytyminen</span> löytyy <span className="text-primary font-semibold">Kävijät</span>-sivulta.
          </p>
        </div>
      </main>
    </div>
  )
}
