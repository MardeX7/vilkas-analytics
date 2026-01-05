import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

export function Layout() {
  return (
    <div className="min-h-screen bg-slate-950">
      <Sidebar />
      <main className="ml-64">
        <Outlet />
      </main>
    </div>
  )
}
