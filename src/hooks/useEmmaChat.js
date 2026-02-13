/**
 * useEmmaChat Hook
 *
 * Hallinnoi Emma-keskustelua:
 * - Sessioiden luonti ja hallinta
 * - Viestien lähetys ja vastaanotto
 * - Chat-historian tallennus
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { SHOP_ID, STORE_ID } from '@/config/storeConfig'

/**
 * Main hook
 * @param {object} options - Hook options
 * @param {object} options.dateRange - Date range for context
 * @param {string} options.language - Language code (fi/sv)
 */
export function useEmmaChat({ dateRange = null, language = 'fi' } = {}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [isTyping, setIsTyping] = useState(false)
  const [messages, setMessages] = useState([])
  const [sessionId, setSessionId] = useState(null)

  const sessionIdRef = useRef(null)

  /**
   * Create new chat session
   */
  const createSession = useCallback(async () => {
    try {
      // chat_sessions.store_id references shops(id), so use SHOP_ID
      const { data, error: createError } = await supabase
        .rpc('create_chat_session', {
          p_store_id: SHOP_ID,
          p_language: language
        })

      if (createError) {
        throw createError
      }

      setSessionId(data)
      sessionIdRef.current = data
      return data
    } catch (err) {
      console.error('Failed to create chat session:', err)
      setError(err.message)
      return null
    }
  }, [language])

  /**
   * Load existing session messages
   */
  const loadMessages = useCallback(async (sid) => {
    if (!sid) return

    try {
      const { data, error: loadError } = await supabase
        .rpc('get_chat_history', {
          p_session_id: sid
        })

      if (loadError) {
        throw loadError
      }

      if (data) {
        setMessages(data)
      }
    } catch (err) {
      console.error('Failed to load messages:', err)
      // Don't set error for load failures, just start fresh
    }
  }, [])

  /**
   * Send message to Emma
   */
  const sendMessage = useCallback(async (content) => {
    if (!content.trim()) return

    setError(null)

    // Ensure we have a session
    let currentSessionId = sessionIdRef.current
    if (!currentSessionId) {
      currentSessionId = await createSession()
      if (!currentSessionId) return
    }

    // Add user message to UI immediately
    const userMessage = {
      role: 'user',
      content: content.trim(),
      created_at: new Date().toISOString()
    }
    setMessages(prev => [...prev, userMessage])

    // Save user message to DB
    try {
      await supabase.rpc('add_chat_message', {
        p_session_id: currentSessionId,
        p_role: 'user',
        p_content: content.trim()
      })
    } catch (err) {
      console.error('Failed to save user message:', err)
    }

    // Show typing indicator
    setIsTyping(true)

    try {
      // Call API endpoint
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          store_id: SHOP_ID,  // Use SHOP_ID for shops reference
          session_id: currentSessionId,
          message: content.trim(),
          date_range: dateRange,
          language: language  // Pass UI language to API
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to get response')
      }

      const result = await response.json()

      // Add Emma's response to UI
      const emmaMessage = {
        role: 'assistant',
        content: result.response,
        created_at: new Date().toISOString()
      }
      setMessages(prev => [...prev, emmaMessage])

    } catch (err) {
      console.error('Failed to send message:', err)
      setError(err.message)

      // Remove the user message if API call failed
      setMessages(prev => prev.filter(m => m !== userMessage))
    } finally {
      setIsTyping(false)
    }
  }, [dateRange, createSession])

  /**
   * Clear chat and start new session
   */
  const clearChat = useCallback(async () => {
    setMessages([])
    setSessionId(null)
    sessionIdRef.current = null
    setError(null)
    localStorage.removeItem(`emma_session_${SHOP_ID}`)
  }, [])

  /**
   * Load a specific saved session
   */
  const loadSession = useCallback(async (newSessionId) => {
    if (!newSessionId) return

    setSessionId(newSessionId)
    sessionIdRef.current = newSessionId
    localStorage.setItem(`emma_session_${SHOP_ID}`, newSessionId)
    await loadMessages(newSessionId)
  }, [loadMessages])

  /**
   * Initialize session on mount
   */
  useEffect(() => {
    // Try to get recent session from localStorage
    const storedSessionId = localStorage.getItem(`emma_session_${SHOP_ID}`)

    if (storedSessionId) {
      setSessionId(storedSessionId)
      sessionIdRef.current = storedSessionId
      loadMessages(storedSessionId)
    }
  }, [loadMessages])

  /**
   * Store session ID when it changes
   */
  useEffect(() => {
    if (sessionId) {
      localStorage.setItem(`emma_session_${SHOP_ID}`, sessionId)
    }
  }, [sessionId])

  return {
    messages,
    loading,
    error,
    isTyping,
    sendMessage,
    clearChat,
    loadSession,
    sessionId
  }
}

export default useEmmaChat
