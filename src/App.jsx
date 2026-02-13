import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Dashboard } from '@/pages/Dashboard'
import { SearchConsolePage } from '@/pages/SearchConsolePage'
import { GA4Page } from '@/pages/GA4Page'
import { InventoryPage } from '@/pages/InventoryPage'
import { InsightsPage } from '@/pages/InsightsPage'
import { IndicatorsPage } from '@/pages/IndicatorsPage'
import { IndicatorDetailPage } from '@/pages/IndicatorDetailPage'
import { CustomersPage } from '@/pages/CustomersPage'
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

        {/* Protected routes - järjestetty käyttölogiikan mukaan */}
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          {/* JOHTAMINEN: Entry point = Tilannekuva (KPI Dashboard) */}
          <Route path="/" element={<IndicatorsPage />} />
          <Route path="/insights" element={<InsightsPage />} />

          {/* DATA & TODISTEET */}
          <Route path="/sales" element={<Dashboard />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/search-console" element={<SearchConsolePage />} />
          <Route path="/analytics" element={<GA4Page />} />
          <Route path="/inventory" element={<InventoryPage />} />

          {/* Tuki-sivut */}
          <Route path="/indicators/:indicatorId" element={<IndicatorDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
