import { TrendingUp, Lightbulb, Target, ArrowUpRight, ArrowDownRight } from 'lucide-react'

export function InsightsPage() {
  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-8 py-4">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-cyan-400" />
            Analyysit & Insikter
          </h1>
          <p className="text-slate-400 text-sm mt-1">AI-drivna insikter och rekommendationer</p>
        </div>
      </header>

      <main className="px-8 py-8">
        {/* Coming soon placeholder */}
        <div className="bg-slate-800/30 rounded-lg p-12 text-center border border-slate-700/50">
          <div className="w-16 h-16 bg-cyan-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Lightbulb className="w-8 h-8 text-cyan-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Kommer snart</h2>
          <p className="text-slate-400 max-w-md mx-auto mb-8">
            AI-drivna analyser som kombinerar försäljningsdata med Search Console
            för att ge dig handlingsbara insikter.
          </p>

          {/* Preview cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
            <div className="bg-slate-800/50 rounded-lg p-4 text-left border border-slate-700/30">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-medium text-white">Konvertering</span>
              </div>
              <p className="text-xs text-slate-500">Vilka sökord leder till köp?</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4 text-left border border-slate-700/30">
              <div className="flex items-center gap-2 mb-2">
                <ArrowUpRight className="w-4 h-4 text-green-400" />
                <span className="text-sm font-medium text-white">Möjligheter</span>
              </div>
              <p className="text-xs text-slate-500">Sökord med hög potential</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4 text-left border border-slate-700/30">
              <div className="flex items-center gap-2 mb-2">
                <ArrowDownRight className="w-4 h-4 text-orange-400" />
                <span className="text-sm font-medium text-white">Trender</span>
              </div>
              <p className="text-xs text-slate-500">Säsongsbetonade mönster</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
