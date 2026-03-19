import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import {
  IconArrowLeft,
  IconTrash,
  IconRestore,
  IconCheck,
  IconGrip,
  IconPlus,
  IconNotes,
  IconLoader,
} from './components/Icons'

function getNewNotePosition(notes) {
  if (!notes.length) return 0
  const minPosition = Math.min(...notes.map((n) => n.position))
  return minPosition - 1
}

function useNotes(userId, isTrashed) {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchNotes = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', userId)
      .eq('is_trashed', isTrashed)
      .order('position', { ascending: true })
    if (error) {
      console.error('Error fetching notes:', error)
      setNotes([])
    } else {
      setNotes(data || [])
    }
    setLoading(false)
  }, [userId, isTrashed])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  return [notes, loading, fetchNotes]
}

function handleTabInTextarea(e) {
  if (e.key === 'Tab') {
    e.preventDefault()
    const start = e.target.selectionStart
    const end = e.target.selectionEnd
    const value = e.target.value
    e.target.value = value.slice(0, start) + '\t' + value.slice(end)
    e.target.selectionStart = e.target.selectionEnd = start + 1
  }
}

const inputClasses =
  'w-full px-4 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-300'

export default function Notes() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [showTrash, setShowTrash] = useState(false)
  const [modalNote, setModalNote] = useState(null)
  const [quickAddExpanded, setQuickAddExpanded] = useState(false)
  const [quickTitle, setQuickTitle] = useState('')
  const [quickContent, setQuickContent] = useState('')
  const [savingQuick, setSavingQuick] = useState(false)
  const [draggingId, setDraggingId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)

  const [notes, loading, refetchNotes] = useNotes(user?.id, false)
  const [trashedNotes, trashedLoading, refetchTrashed] = useNotes(user?.id, true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => setUser(u ?? null))
  }, [])

  useEffect(() => {
    if (!modalNote) return
    const onEscape = (e) => {
      if (e.key === 'Escape') saveModalAndClose()
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [modalNote])

  const displayNotes = showTrash ? trashedNotes : notes
  const displayLoading = showTrash ? trashedLoading : loading

  async function createNote(title = '', content = '', position = 0) {
    if (!user) return
    const { data, error } = await supabase
      .from('notes')
      .insert({
        user_id: user.id,
        title: title || 'Sin título',
        content: content || '',
        position,
        is_trashed: false,
      })
      .select('id')
      .single()
    if (error) {
      console.error('Error creating note:', error)
      return null
    }
    return data?.id
  }

  async function addQuickNote() {
    if (!user) return
    setSavingQuick(true)
    const newPosition = getNewNotePosition(notes)
    await createNote(quickTitle, quickContent, newPosition)
    setQuickTitle('')
    setQuickContent('')
    setQuickAddExpanded(false)
    await refetchNotes()
    setSavingQuick(false)
  }

  async function updateNote(id, updates) {
    const { error } = await supabase.from('notes').update(updates).eq('id', id)
    if (error) console.error('Error updating note:', error)
  }

  async function saveModalAndClose() {
    if (!modalNote) return
    await updateNote(modalNote.id, {
      title: modalNote.title || 'Sin título',
      content: modalNote.content ?? '',
    })
    setModalNote(null)
    refetchNotes()
  }

  async function moveToTrash(id) {
    await updateNote(id, { is_trashed: true })
    setModalNote(null)
    refetchNotes()
  }

  async function restoreNote(id) {
    const newPos = getNewNotePosition(notes)
    await updateNote(id, { is_trashed: false, position: newPos })
    refetchTrashed()
    refetchNotes()
  }

  async function deletePermanently(id) {
    await supabase.from('notes').delete().eq('id', id)
    setModalNote((m) => (m?.id === id ? null : m))
    refetchTrashed()
  }

  async function reorderNotes(fromId, toId) {
    const list = [...notes]
    const fromIdx = list.findIndex((n) => n.id === fromId)
    const toIdx = list.findIndex((n) => n.id === toId)
    if (fromIdx === -1 || toIdx === -1) return
    const [removed] = list.splice(fromIdx, 1)
    list.splice(toIdx, 0, removed)
    for (let i = 0; i < list.length; i++) {
      await supabase.from('notes').update({ position: i }).eq('id', list[i].id)
    }
    await refetchNotes()
  }

  function handleDragStart(e, id) {
    setDraggingId(id)
    e.dataTransfer.setData('text/plain', id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e, id) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverId(id)
  }

  function handleDragLeave() {
    setDragOverId(null)
  }

  function handleDrop(e, toId) {
    e.preventDefault()
    setDragOverId(null)
    setDraggingId(null)
    const fromId = e.dataTransfer.getData('text/plain')
    if (fromId && fromId !== toId) reorderNotes(fromId, toId)
  }

  function handleDragEnd() {
    setDraggingId(null)
    setDragOverId(null)
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <IconLoader className="w-8 h-8 text-blue-500" />
      </div>
    )
  }

  const btnPrimary =
    'rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 transition-all duration-300 inline-flex items-center gap-2'
  const btnSecondary =
    'rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white font-bold px-4 py-2 transition-all duration-300'

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans pb-24 transition-all duration-300">
      <header className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 safe-top">
        <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-slate-400 hover:text-white transition-colors duration-200 flex-shrink-0"
            aria-label="Volver"
          >
            <IconArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-black bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent flex items-center gap-2">
            <IconNotes className="w-5 h-5 text-indigo-400" />
            Notas
          </h1>
          <button
            type="button"
            onClick={() => setShowTrash(!showTrash)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all duration-300 ${
              showTrash
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white border border-slate-600'
            }`}
          >
            <IconTrash className="w-4 h-4" />
            {showTrash ? 'Notas' : 'Papelera'}
          </button>
        </div>

        <div className="mt-4 max-w-2xl mx-auto">
          {!quickAddExpanded ? (
            <button
              type="button"
              onClick={() => setQuickAddExpanded(true)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 shadow-2xl text-left text-slate-400 hover:border-slate-500 hover:text-slate-300 transition-all duration-300"
            >
              <IconPlus className="w-5 h-5 text-blue-400" />
              Añadir nota rápidamente
            </button>
          ) : (
            <div className="rounded-xl bg-slate-800 border border-slate-600 shadow-2xl p-4 space-y-3 transition-all duration-300">
              <input
                type="text"
                placeholder="Título"
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                className={inputClasses}
              />
              <textarea
                placeholder="Contenido..."
                value={quickContent}
                onChange={(e) => setQuickContent(e.target.value)}
                onKeyDown={handleTabInTextarea}
                rows={3}
                className={`${inputClasses} resize-none`}
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setQuickAddExpanded(false)
                    setQuickTitle('')
                    setQuickContent('')
                  }}
                  className={btnSecondary}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={addQuickNote}
                  disabled={savingQuick}
                  className={btnPrimary}
                >
                  {savingQuick ? <IconLoader className="w-4 h-4 animate-spin" /> : <IconCheck className="w-4 h-4" />}
                  {savingQuick ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="px-4 py-6 sm:px-6 max-w-7xl mx-auto">
        {displayLoading ? (
          <p className="animate-pulse text-slate-500 text-center py-12">Cargando notas...</p>
        ) : displayNotes.length === 0 ? (
          <div className="rounded-2xl border border-slate-700 bg-slate-800 shadow-lg py-16 text-center">
            <IconNotes className="w-14 h-14 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500">
              {showTrash ? 'La papelera está vacía.' : 'Aún no tienes notas. Crea una arriba.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 items-start">
            {displayNotes.map((note) => (
              <div
                key={note.id}
                draggable={!showTrash}
                onDragStart={(e) => !showTrash && handleDragStart(e, note.id)}
                onDragOver={(e) => !showTrash && handleDragOver(e, note.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => !showTrash && handleDrop(e, note.id)}
                onDragEnd={handleDragEnd}
                onClick={() => !showTrash && setModalNote({ ...note })}
                className={`relative group bg-slate-800 p-4 sm:p-5 rounded-xl border border-slate-700 hover:border-slate-500 shadow-lg h-max cursor-pointer transition-all duration-300 ${showTrash ? 'opacity-80 border-red-900/30' : ''} ${draggingId === note.id ? 'opacity-50 border-dashed border-blue-400' : ''} ${dragOverId === note.id ? 'ring-2 ring-blue-500 border-blue-500' : ''}`}
              >
                {!showTrash && (
                  <span
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-all duration-300 pointer-events-none"
                    title="Arrastra para reordenar"
                  >
                    <IconGrip className="w-4 h-4 text-slate-500" />
                  </span>
                )}
                {!showTrash && (
                  <span className="block text-slate-500 text-xs mb-1 select-none w-5" title="Arrastra para reordenar">
                    <IconGrip className="w-4 h-4" />
                  </span>
                )}
                <h3 className="font-semibold text-white truncate pr-8">
                  {note.title || 'Sin título'}
                </h3>
                <p className="text-slate-400 text-sm mt-1 line-clamp-3 whitespace-pre-wrap">
                  {note.content || ''}
                </p>
                {showTrash && (
                  <div className="flex gap-2 mt-4">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        restoreNote(note.id)
                      }}
                      className="rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white text-xs font-bold px-3 py-2 inline-flex items-center gap-1.5 transition-all duration-300"
                    >
                      <IconRestore className="w-3.5 h-3.5" />
                      Restaurar
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (window.confirm('¿Eliminar permanentemente?')) deletePermanently(note.id)
                      }}
                      className="rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 text-xs font-bold px-3 py-2 inline-flex items-center gap-1.5 transition-all duration-300"
                    >
                      <IconTrash className="w-3.5 h-3.5" />
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {modalNote && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-all duration-300"
          onClick={() => saveModalAndClose()}
          role="dialog"
          aria-modal="true"
          aria-label="Editar nota"
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-slate-800 border border-slate-700 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 space-y-3">
              <input
                type="text"
                value={modalNote.title}
                onChange={(e) => setModalNote((m) => ({ ...m, title: e.target.value }))}
                placeholder="Título"
                className={inputClasses}
              />
              <textarea
                value={modalNote.content ?? ''}
                onChange={(e) => setModalNote((m) => ({ ...m, content: e.target.value }))}
                onKeyDown={handleTabInTextarea}
                placeholder="Contenido..."
                rows={8}
                className={`${inputClasses} resize-none`}
              />
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700 bg-slate-800/80">
              <button
                type="button"
                onClick={() => moveToTrash(modalNote.id)}
                className="text-sm text-slate-500 hover:text-red-400 transition-colors duration-300 inline-flex items-center gap-2"
              >
                <IconTrash className="w-4 h-4" />
                Mover a papelera
              </button>
              <button
                type="button"
                onClick={() => saveModalAndClose()}
                className={btnPrimary}
              >
                <IconCheck className="w-5 h-5" />
                Hecho
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
