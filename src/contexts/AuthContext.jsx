/**
 * AuthContext - Authentication state management
 *
 * Provides:
 * - Current user session
 * - Current shop context
 * - Login/logout functions
 * - Shop switching for multi-shop users
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [shops, setShops] = useState([])
  const [currentShop, setCurrentShop] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Fetch user's shops
  const fetchUserShops = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_user_shops')

      if (error) throw error

      setShops(data || [])

      // Auto-select first shop if none selected
      if (data && data.length > 0 && !currentShop) {
        // Check localStorage for previously selected shop
        const savedShopId = localStorage.getItem('vilkas-analytics-current-shop')
        const savedShop = data.find(s => s.shop_id === savedShopId)
        setCurrentShop(savedShop || data[0])
      }

      return data
    } catch (err) {
      console.error('Error fetching user shops:', err)
      setError(err.message)
      return []
    }
  }, [currentShop])

  // Initialize auth state
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)

      if (session?.user) {
        fetchUserShops()
      }

      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)

        if (event === 'SIGNED_IN' && session?.user) {
          await fetchUserShops()
        }

        if (event === 'SIGNED_OUT') {
          setShops([])
          setCurrentShop(null)
          localStorage.removeItem('vilkas-analytics-current-shop')
        }

        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [fetchUserShops])

  // Save current shop to localStorage
  useEffect(() => {
    if (currentShop?.shop_id) {
      localStorage.setItem('vilkas-analytics-current-shop', currentShop.shop_id)
    }
  }, [currentShop])

  // Login with email and password
  const login = async (email, password) => {
    try {
      setError(null)
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) throw error

      return { data, error: null }
    } catch (err) {
      setError(err.message)
      return { data: null, error: err }
    }
  }

  // Login with magic link
  const loginWithMagicLink = async (email) => {
    try {
      setError(null)
      const { data, error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      })

      if (error) throw error

      return { data, error: null }
    } catch (err) {
      setError(err.message)
      return { data: null, error: err }
    }
  }

  // Logout
  const logout = async () => {
    try {
      setError(null)
      const { error } = await supabase.auth.signOut()
      if (error) throw error

      setUser(null)
      setSession(null)
      setShops([])
      setCurrentShop(null)

      return { error: null }
    } catch (err) {
      setError(err.message)
      return { error: err }
    }
  }

  // Switch current shop
  const switchShop = (shopId) => {
    const shop = shops.find(s => s.shop_id === shopId)
    if (shop) {
      setCurrentShop(shop)
    }
  }

  // Check if user is admin of current shop
  const isAdmin = currentShop?.role === 'admin'

  // Reset password
  const resetPassword = async (email) => {
    try {
      setError(null)
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?type=recovery`
      })

      if (error) throw error

      return { data, error: null }
    } catch (err) {
      setError(err.message)
      return { data: null, error: err }
    }
  }

  // Update password
  const updatePassword = async (newPassword) => {
    try {
      setError(null)
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (error) throw error

      return { data, error: null }
    } catch (err) {
      setError(err.message)
      return { data: null, error: err }
    }
  }

  const value = {
    user,
    session,
    shops,
    currentShop,
    loading,
    error,
    isAuthenticated: !!user,
    isAdmin,
    login,
    loginWithMagicLink,
    logout,
    switchShop,
    resetPassword,
    updatePassword,
    refreshShops: fetchUserShops
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

/**
 * useAuth - Hook to access auth context
 */
export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}

export default AuthProvider
