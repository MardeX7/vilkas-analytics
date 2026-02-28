/**
 * useContextNotes Hook
 *
 * Hakee ja hallinnoi kontekstimuistiinpanoja (kampanjat, juhlapyhät, jne.)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentShop } from '@/config/storeConfig'

/**
 * Hae muistiinpanot aikavälille
 */
async function fetchContextNotes(storeId, startDate, endDate) {
  const { data, error } = await supabase.rpc('get_context_notes', {
    p_store_id: storeId,
    p_start_date: startDate,
    p_end_date: endDate
  })

  if (error) {
    throw new Error(`Failed to fetch context notes: ${error.message}`)
  }

  return data || []
}

/**
 * Luo uusi muistiinpano
 */
async function createNote(storeId, noteData) {
  const { data, error } = await supabase.rpc('create_context_note', {
    p_store_id: storeId,
    p_note_type: noteData.noteType,
    p_start_date: noteData.startDate,
    p_end_date: noteData.endDate,
    p_title: noteData.title,
    p_description: noteData.description || null,
    p_related_metric: noteData.relatedMetric || null
  })

  if (error) {
    throw new Error(`Failed to create note: ${error.message}`)
  }

  return data
}

/**
 * Poista muistiinpano
 */
async function deleteNote(noteId) {
  const { error } = await supabase
    .from('context_notes')
    .delete()
    .eq('id', noteId)

  if (error) {
    throw new Error(`Failed to delete note: ${error.message}`)
  }
}

/**
 * Hook kontekstimuistiinpanojen hakuun
 *
 * @param {object} options
 * @param {string} options.startDate - Start date (YYYY-MM-DD)
 * @param {string} options.endDate - End date (YYYY-MM-DD)
 * @returns {object} - { notes, isLoading, error, createNote, deleteNote }
 */
export function useContextNotes({ startDate, endDate } = {}) {
  const { storeId, ready } = useCurrentShop()
  const queryClient = useQueryClient()

  // Default to last 30 days if not provided
  const end = endDate || new Date().toISOString().split('T')[0]
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const query = useQuery({
    queryKey: ['contextNotes', storeId, start, end],
    queryFn: () => fetchContextNotes(storeId, start, end),
    staleTime: 5 * 60 * 1000, // 5 min
    cacheTime: 30 * 60 * 1000, // 30 min
    enabled: ready && !!storeId
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (noteData) => createNote(storeId, noteData),
    onSuccess: () => {
      queryClient.invalidateQueries(['contextNotes', storeId])
    }
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (noteId) => deleteNote(noteId),
    onSuccess: () => {
      queryClient.invalidateQueries(['contextNotes', storeId])
    }
  })

  // Group notes by type for easy access
  const notesByType = query.data?.reduce((acc, note) => {
    if (!acc[note.note_type]) {
      acc[note.note_type] = []
    }
    acc[note.note_type].push(note)
    return acc
  }, {}) || {}

  return {
    notes: query.data || [],
    notesByType,
    isLoading: !ready || query.isLoading,
    error: query.error,
    refetch: query.refetch,
    createNote: createMutation.mutateAsync,
    deleteNote: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending
  }
}

/**
 * Note type labels and colors
 */
export const NOTE_TYPES = {
  campaign: { label: 'Kampanja', color: 'bg-blue-500', icon: 'Tag' },
  holiday: { label: 'Juhlapyhä', color: 'bg-purple-500', icon: 'Calendar' },
  stockout: { label: 'Varastopuute', color: 'bg-red-500', icon: 'AlertTriangle' },
  pricing: { label: 'Hinnoittelu', color: 'bg-green-500', icon: 'DollarSign' },
  other: { label: 'Muu', color: 'bg-gray-500', icon: 'MessageSquare' }
}
