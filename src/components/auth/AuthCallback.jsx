/**
 * AuthCallback - Handle magic link and OAuth callbacks
 */

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useTranslation } from '@/lib/i18n'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function AuthCallback() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('processing') // 'processing' | 'success' | 'error'
  const [error, setError] = useState(null)

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the token from URL hash (Supabase auth)
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        const type = hashParams.get('type') || searchParams.get('type')

        // Check for invitation token
        const invitationToken = searchParams.get('invitation')

        if (accessToken && refreshToken) {
          // Set the session
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          })

          if (sessionError) throw sessionError
        }

        // Handle invitation acceptance
        if (invitationToken) {
          const { error: inviteError } = await supabase.rpc('accept_invitation', {
            p_token: invitationToken
          })

          if (inviteError) {
            console.error('Invitation error:', inviteError)
            // Don't fail completely, just log the error
          }
        }

        // Handle password recovery
        if (type === 'recovery') {
          setStatus('success')
          // Redirect to password reset page
          setTimeout(() => {
            navigate('/settings?tab=password', { replace: true })
          }, 1500)
          return
        }

        // Normal login success
        setStatus('success')
        setTimeout(() => {
          navigate('/', { replace: true })
        }, 1500)

      } catch (err) {
        console.error('Auth callback error:', err)
        setError(err.message)
        setStatus('error')
      }
    }

    handleCallback()
  }, [navigate, searchParams])

  // Processing state
  if (status === 'processing') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {t('auth.verifying')}
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            {t('auth.pleaseWait')}
          </p>
        </div>
      </div>
    )
  }

  // Success state
  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {t('auth.loginSuccess')}
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            {t('auth.redirecting')}
          </p>
        </div>
      </div>
    )
  }

  // Error state
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {t('auth.loginError')}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {error || t('auth.somethingWentWrong')}
          </p>
          <Button onClick={() => navigate('/login', { replace: true })}>
            {t('auth.backToLogin')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default AuthCallback
