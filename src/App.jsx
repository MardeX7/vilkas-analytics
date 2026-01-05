import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Dashboard } from '@/pages/Dashboard'
import { SearchConsolePage } from '@/pages/SearchConsolePage'
import { InsightsPage } from '@/pages/InsightsPage'
import { IndicatorsPage } from '@/pages/IndicatorsPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/search-console" element={<SearchConsolePage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/indicators" element={<IndicatorsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
