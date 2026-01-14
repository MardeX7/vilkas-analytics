/**
 * ContextNotesCard - Display and manage context notes
 *
 * Näyttää muistiinpanot jotka selittävät datapoikkeamia (kampanjat, juhlapyhät, jne.)
 */

import { useState } from 'react'
import { MessageSquare, Plus, X, Tag, Calendar, AlertTriangle, DollarSign, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useContextNotes, NOTE_TYPES } from '@/hooks/useContextNotes'
import { Button } from '@/components/ui/button'

/**
 * Note type icon mapping
 */
const NoteIcon = {
  campaign: Tag,
  holiday: Calendar,
  stockout: AlertTriangle,
  pricing: DollarSign,
  other: MessageSquare
}

/**
 * Single note item
 */
function NoteItem({ note, onDelete, isDeleting }) {
  const config = NOTE_TYPES[note.note_type] || NOTE_TYPES.other
  const Icon = NoteIcon[note.note_type] || MessageSquare

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('fi-FI', { day: 'numeric', month: 'short' })
  }

  return (
    <div className="flex items-start gap-3 p-3 bg-background-subtle rounded-lg group">
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', config.color)}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-foreground">{note.title}</p>
            <p className="text-xs text-foreground-muted">
              {formatDate(note.start_date)}
              {note.start_date !== note.end_date && ` - ${formatDate(note.end_date)}`}
            </p>
          </div>
          <button
            onClick={() => onDelete(note.id)}
            disabled={isDeleting}
            className="p-1 text-foreground-muted hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
            title="Poista"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        {note.description && (
          <p className="text-xs text-foreground-muted mt-1 line-clamp-2">{note.description}</p>
        )}
        <span className="inline-block mt-1.5 text-[10px] px-1.5 py-0.5 bg-background rounded text-foreground-muted">
          {config.label}
        </span>
      </div>
    </div>
  )
}

/**
 * Add note form
 */
function AddNoteForm({ onSubmit, onCancel, isSubmitting, defaultDates }) {
  const [noteType, setNoteType] = useState('campaign')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState(defaultDates?.startDate || new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(defaultDates?.endDate || new Date().toISOString().split('T')[0])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!title.trim()) return

    onSubmit({
      noteType,
      title: title.trim(),
      description: description.trim() || null,
      startDate,
      endDate
    })
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 bg-background-subtle rounded-lg space-y-3">
      <div>
        <label className="text-xs text-foreground-muted mb-1 block">Tyyppi</label>
        <select
          value={noteType}
          onChange={(e) => setNoteType(e.target.value)}
          className="w-full px-2 py-1.5 text-sm bg-background border border-card-border rounded"
        >
          {Object.entries(NOTE_TYPES).map(([key, config]) => (
            <option key={key} value={key}>{config.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-foreground-muted mb-1 block">Otsikko</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="esim. Black Friday -kampanja"
          className="w-full px-2 py-1.5 text-sm bg-background border border-card-border rounded"
          maxLength={100}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-foreground-muted mb-1 block">Alkaa</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-2 py-1.5 text-sm bg-background border border-card-border rounded"
          />
        </div>
        <div>
          <label className="text-xs text-foreground-muted mb-1 block">Päättyy</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={startDate}
            className="w-full px-2 py-1.5 text-sm bg-background border border-card-border rounded"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-foreground-muted mb-1 block">Kuvaus (valinnainen)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Lisätietoja..."
          rows={2}
          className="w-full px-2 py-1.5 text-sm bg-background border border-card-border rounded resize-none"
          maxLength={500}
        />
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          type="submit"
          size="sm"
          disabled={isSubmitting || !title.trim()}
          className="flex-1"
        >
          {isSubmitting ? 'Tallennetaan...' : 'Lisää muistiinpano'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
        >
          Peruuta
        </Button>
      </div>
    </form>
  )
}

/**
 * ContextNotesCard
 */
export function ContextNotesCard({ startDate, endDate, label, className }) {
  const [isAdding, setIsAdding] = useState(false)
  const {
    notes,
    isLoading,
    error,
    createNote,
    deleteNote,
    isCreating,
    isDeleting
  } = useContextNotes({ startDate, endDate })

  const handleCreateNote = async (noteData) => {
    try {
      await createNote(noteData)
      setIsAdding(false)
    } catch (err) {
      console.error('Failed to create note:', err)
    }
  }

  if (isLoading) {
    return (
      <div className={cn('rounded-lg border border-card-border bg-background-elevated p-5', className)}>
        <div className="animate-pulse">
          <div className="h-5 w-32 bg-background-subtle rounded mb-4" />
          <div className="space-y-3">
            <div className="h-16 bg-background-subtle rounded" />
            <div className="h-16 bg-background-subtle rounded" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('rounded-lg border border-destructive/30 bg-background-elevated p-5', className)}>
        <p className="text-sm text-destructive">Muistiinpanoja ei voitu ladata</p>
      </div>
    )
  }

  return (
    <div className={cn('rounded-lg border border-card-border bg-background-elevated p-5', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Muistiinpanot</h3>
        </div>
        <div className="flex items-center gap-2">
          {label && (
            <span className="text-xs text-foreground-muted px-2 py-1 bg-background-subtle rounded">
              {label}
            </span>
          )}
          {!isAdding && (
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Lisää
            </button>
          )}
        </div>
      </div>

      {/* Notes list */}
      <div className="space-y-2">
        {notes.length === 0 && !isAdding && (
          <div className="text-center py-4">
            <MessageSquare className="w-8 h-8 text-foreground-muted mx-auto mb-2" />
            <p className="text-sm text-foreground-muted">Ei muistiinpanoja tälle jaksolle</p>
            <button
              onClick={() => setIsAdding(true)}
              className="text-sm text-primary hover:underline mt-1"
            >
              Lisää muistiinpano
            </button>
          </div>
        )}

        {notes.map((note) => (
          <NoteItem
            key={note.id}
            note={note}
            onDelete={deleteNote}
            isDeleting={isDeleting}
          />
        ))}

        {isAdding && (
          <AddNoteForm
            onSubmit={handleCreateNote}
            onCancel={() => setIsAdding(false)}
            isSubmitting={isCreating}
            defaultDates={{ startDate, endDate }}
          />
        )}
      </div>
    </div>
  )
}

/**
 * Compact notes indicator for charts
 * Shows small badges when notes exist for the date range
 */
export function ContextNotesIndicator({ startDate, endDate, className }) {
  const { notes } = useContextNotes({ startDate, endDate })

  if (!notes || notes.length === 0) return null

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {notes.slice(0, 3).map((note) => {
        const config = NOTE_TYPES[note.note_type] || NOTE_TYPES.other
        return (
          <span
            key={note.id}
            className={cn('w-2 h-2 rounded-full', config.color)}
            title={note.title}
          />
        )
      })}
      {notes.length > 3 && (
        <span className="text-[10px] text-foreground-muted">+{notes.length - 3}</span>
      )}
    </div>
  )
}
