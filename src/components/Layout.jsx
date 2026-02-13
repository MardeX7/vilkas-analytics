import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { PullToRefresh } from './PullToRefresh'
import { EmmaChatFullscreen } from './EmmaChatFullscreen'
import { MessageCircle, Sparkles } from 'lucide-react'

export function Layout() {
  const [isEmmaChatOpen, setIsEmmaChatOpen] = useState(false)
  const location = useLocation()

  // Show FAB on all pages (Insights has its own FAB but that's fine)
  const showEmmaFab = location.pathname !== '/insights'

  // Date range for Emma context (last 30 days)
  const dateRange = {
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  }

  return (
    <PullToRefresh>
      <div className="min-h-screen bg-slate-950">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block">
          <Sidebar />
        </div>

        {/* Mobile Navigation */}
        <MobileNav />

        {/* Main Content */}
        <main className="lg:ml-64 pt-14 lg:pt-0">
          <Outlet />
        </main>

        {/* Emma Chat Fullscreen Modal */}
        <EmmaChatFullscreen
          isOpen={isEmmaChatOpen}
          onClose={() => setIsEmmaChatOpen(false)}
          dateRange={dateRange}
        />

        {/* Emma FAB - visible on all pages except Insights */}
        {showEmmaFab && (
          <button
            onClick={() => setIsEmmaChatOpen(true)}
            className="fixed bottom-6 right-6 z-40 p-4 bg-gradient-to-r from-violet-500 to-violet-600
                     hover:from-violet-600 hover:to-violet-700 text-white rounded-full
                     shadow-lg shadow-violet-500/30 transition-all hover:scale-105
                     flex items-center gap-2"
            title="Kysy Emmalta"
          >
            <MessageCircle className="h-6 w-6" />
            <Sparkles className="h-4 w-4 absolute -top-1 -right-1 text-amber-300" />
          </button>
        )}
      </div>
    </PullToRefresh>
  )
}
