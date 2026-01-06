/**
 * ProtectedRoute - Auth guard wrapper
 *
 * Redirects to login if not authenticated
 * Shows "no access" if authenticated but no shop membership
 */

import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useTranslation } from '@/lib/i18n'
import { Loader2, ShieldX } from 'lucide-react'

export function ProtectedRoute({ children, requireAdmin = false }) {
  const { t } = useTranslation()
  const { isAuthenticated, loading, shops, currentShop, isAdmin } = useAuth()
  const location = useLocation()

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  // Not authenticated → redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Authenticated but no shop access
  if (shops.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
            <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldX className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {t('auth.noAccess')}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {t('auth.noShopAccess')}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              {t('auth.contactAdminForAccess')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Requires admin but user is not admin
  if (requireAdmin && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldX className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {t('auth.adminRequired')}
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              {t('auth.adminRequiredDescription')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // All checks passed
  return children
}

export default ProtectedRoute
