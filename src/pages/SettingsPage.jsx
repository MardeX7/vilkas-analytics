/**
 * SettingsPage - User management & settings
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useTranslation } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import {
  Users,
  UserPlus,
  Mail,
  Shield,
  Eye,
  Trash2,
  Loader2,
  CheckCircle,
  AlertCircle,
  Settings,
  Store,
  ChevronDown
} from 'lucide-react'

export function SettingsPage() {
  const { t } = useTranslation()
  const { currentShop, isAdmin, shops, switchShop, user, logout } = useAuth()
  const queryClient = useQueryClient()

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('viewer')
  const [inviteSuccess, setInviteSuccess] = useState(false)
  const [showShopSelector, setShowShopSelector] = useState(false)

  // Fetch shop members
  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ['shop-members', currentShop?.shop_id],
    queryFn: async () => {
      if (!currentShop?.shop_id) return []
      const { data, error } = await supabase.rpc('get_shop_members', {
        p_shop_id: currentShop.shop_id
      })
      if (error) throw error
      return data || []
    },
    enabled: !!currentShop?.shop_id
  })

  // Fetch pending invitations
  const { data: invitations, isLoading: invitationsLoading } = useQuery({
    queryKey: ['shop-invitations', currentShop?.shop_id],
    queryFn: async () => {
      if (!currentShop?.shop_id || !isAdmin) return []
      const { data, error } = await supabase.rpc('get_shop_invitations', {
        p_shop_id: currentShop.shop_id
      })
      if (error) throw error
      return data || []
    },
    enabled: !!currentShop?.shop_id && isAdmin
  })

  // Invite user mutation
  const inviteMutation = useMutation({
    mutationFn: async ({ email, role }) => {
      // First, invite via Supabase RPC
      const { data: invitationId, error: rpcError } = await supabase.rpc('invite_user', {
        p_shop_id: currentShop.shop_id,
        p_email: email,
        p_role: role
      })

      if (rpcError) throw rpcError

      // Then send magic link via Supabase Auth
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?invitation=${invitationId}`,
          data: {
            invited_to_shop: currentShop.shop_name
          }
        }
      })

      if (authError) throw authError

      return invitationId
    },
    onSuccess: () => {
      setInviteEmail('')
      setInviteSuccess(true)
      queryClient.invalidateQueries(['shop-invitations'])
      setTimeout(() => setInviteSuccess(false), 3000)
    }
  })

  // Remove member mutation
  const removeMutation = useMutation({
    mutationFn: async (userId) => {
      const { error } = await supabase.rpc('remove_shop_member', {
        p_shop_id: currentShop.shop_id,
        p_user_id: userId
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['shop-members'])
    }
  })

  const handleInvite = async (e) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    inviteMutation.mutate({ email: inviteEmail.trim(), role: inviteRole })
  }

  const handleRemoveMember = (userId, email) => {
    if (window.confirm(t('settings.confirmRemove', { email }))) {
      removeMutation.mutate(userId)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Settings className="w-6 h-6" />
          {t('settings.title')}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          {t('settings.description')}
        </p>
      </div>

      {/* Shop Selector (if multiple shops) */}
      {shops.length > 1 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Store className="w-5 h-5" />
            {t('settings.currentShop')}
          </h2>
          <div className="relative">
            <button
              onClick={() => setShowShopSelector(!showShopSelector)}
              className="w-full flex items-center justify-between p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-left"
            >
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  {currentShop?.shop_name}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {currentShop?.role === 'admin' ? t('settings.admin') : t('settings.viewer')}
                </p>
              </div>
              <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${showShopSelector ? 'rotate-180' : ''}`} />
            </button>

            {showShopSelector && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-10">
                {shops.map((shop) => (
                  <button
                    key={shop.shop_id}
                    onClick={() => {
                      switchShop(shop.shop_id)
                      setShowShopSelector(false)
                    }}
                    className={`w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-600 first:rounded-t-lg last:rounded-b-lg ${
                      shop.shop_id === currentShop?.shop_id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    <p className="font-medium text-gray-900 dark:text-white">
                      {shop.shop_name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {shop.role === 'admin' ? t('settings.admin') : t('settings.viewer')}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Invite User (Admin only) */}
      {isAdmin && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            {t('settings.inviteUser')}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {t('settings.inviteDescription')}
          </p>

          <form onSubmit={handleInvite} className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <label htmlFor="invite-email" className="sr-only">
                  {t('auth.email')}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    required
                  />
                </div>
              </div>

              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="viewer">{t('settings.viewer')}</option>
                <option value="admin">{t('settings.admin')}</option>
              </select>

              <Button type="submit" disabled={inviteMutation.isPending}>
                {inviteMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  t('settings.sendInvite')
                )}
              </Button>
            </div>

            {/* Success message */}
            {inviteSuccess && (
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle className="w-4 h-4" />
                {t('settings.inviteSent')}
              </div>
            )}

            {/* Error message */}
            {inviteMutation.error && (
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4" />
                {inviteMutation.error.message}
              </div>
            )}
          </form>
        </div>
      )}

      {/* Pending Invitations (Admin only) */}
      {isAdmin && invitations?.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t('settings.pendingInvitations')} ({invitations.length})
          </h2>
          <div className="space-y-3">
            {invitations.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {invite.email}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {invite.role === 'admin' ? t('settings.admin') : t('settings.viewer')} - {t('settings.pending')}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team Members */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Users className="w-5 h-5" />
          {t('settings.users')} ({members?.length || 0})
        </h2>

        {membersLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="space-y-3">
            {members?.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 dark:text-blue-400 font-medium">
                      {member.email?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {member.full_name || member.email}
                    </p>
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <Mail className="w-3 h-3" />
                      {member.email}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Role badge */}
                  <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                    member.role === 'admin'
                      ? 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300'
                      : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                  }`}>
                    {member.role === 'admin' ? (
                      <Shield className="w-3 h-3" />
                    ) : (
                      <Eye className="w-3 h-3" />
                    )}
                    {member.role === 'admin' ? t('settings.admin') : t('settings.viewer')}
                  </span>

                  {/* Remove button (admin only, can't remove self) */}
                  {isAdmin && member.user_id !== user?.id && (
                    <button
                      onClick={() => handleRemoveMember(member.user_id, member.email)}
                      className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                      title={t('settings.removeUser')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Account Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {t('settings.account')}
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">
                {user?.email}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('settings.yourAccount')}
              </p>
            </div>
            <Button variant="outline" onClick={logout}>
              {t('auth.logout')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
