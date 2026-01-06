import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Dashboard } from '@/pages/Dashboard'
import { SearchConsolePage } from '@/pages/SearchConsolePage'
import { InsightsPage } from '@/pages/InsightsPage'
import { IndicatorsPage } from '@/pages/IndicatorsPage'
import { IndicatorDetailPage } from '@/pages/IndicatorDetailPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { LoginPage } from '@/components/auth/LoginPage'
import { AuthCallback } from '@/components/auth/AuthCallback'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Protected routes */}
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/search-console" element={<SearchConsolePage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/indicators" element={<IndicatorsPage />} />
          <Route path="/indicators/:indicatorId" element={<IndicatorDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
