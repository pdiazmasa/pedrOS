import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { supabase } from './supabaseClient'

function toLocalInputValue(date) {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  const yyyy = d.getFullYear()
  const mm = pad(d.getMonth() + 1)
  const dd = pad(d.getDate())
  const hh = pad(d.getHours())
  const mi = pad(d.getMinutes())
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
}

function fromLocalInputValue(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function toDateInputValue(date) {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  const yyyy = d.getFullYear()
  const mm = pad(d.getMonth() + 1)
  const dd = pad(d.getDate())
  return `${yyyy}-${mm}-${dd}`
}

function fromDateInputValue(value) {
  if (!value) return null
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function addMinutes(date, minutes) {
  const d = date instanceof Date ? date : new Date(date)
  return new Date(d.getTime() + minutes * 60 * 1000)
}

function formatShort(dt) {
  try {
    const d = dt instanceof Date ? dt : new Date(dt)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString([], { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

const BOARD_ICONS = ['📁', '🚀', '🎓', '💼', '💡', '🎮', '🏠', '❤️']
const THEME_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#a855f7',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#f97316',
  '#e879f9',
]
const CARD_COLORS = THEME_COLORS

const panel =
  'bg-slate-800 rounded-2xl border border-slate-700 shadow-lg transition-all duration-300'
const input =
  'w-full bg-slate-900 border border-slate-600 text-white placeholder-slate-500 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-300'
const btnPrimary =
  'bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg px-4 py-2 transition-all duration-300'
const btnSecondary =
  'bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white font-bold rounded-lg px-4 py-2 transition-all duration-300'
const btnDanger =
  'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:text-red-300 font-bold rounded-lg px-4 py-2 transition-all duration-300'

export default function Trellos() {
  const navigate = useNavigate()

  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Navegación 2 niveles
  const [activeBoard, setActiveBoard] = useState(null) // {id,...} | null
  const [showTrash, setShowTrash] = useState(false)

  // Datos
  const [boards, setBoards] = useState([])
  const [columns, setColumns] = useState([])
  const [cards, setCards] = useState([])

  // Calendarios (para asignar eventos a tarjetas)
  const [calendars, setCalendars] = useState([])
  const [calLoading, setCalLoading] = useState(false)

  // Mapa cardId -> event (si existe)
  const [cardEvents, setCardEvents] = useState({}) // { [cardId]: { id, calendar_id, start_time, end_time, is_all_day } }

  // Crear board
  const [isCreatingBoard, setIsCreatingBoard] = useState(false)
  const [newBoardTitle, setNewBoardTitle] = useState('')
  const [newBoardIcon, setNewBoardIcon] = useState(BOARD_ICONS[0])
  const [newBoardColor, setNewBoardColor] = useState(THEME_COLORS[0])

  // Crear columna
  const [isCreatingColumn, setIsCreatingColumn] = useState(false)
  const [newColumnName, setNewColumnName] = useState('')
  const [deletingColumnId, setDeletingColumnId] = useState(null)

  // Crear tarjetas inline
  const [newCardInputs, setNewCardInputs] = useState({})

  // Modal edición tarjeta
  const [modalCard, setModalCard] = useState(null)
  const [modalEvent, setModalEvent] = useState(null) // { id|null, calendar_id, start:Date|null, end:Date|null, is_all_day:boolean }
  const [modalSaving, setModalSaving] = useState(false)
  const [modalEventDuration, setModalEventDuration] = useState(60)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => setUser(u ?? null))
  }, [])

  // Realtime: si un evento (events) vinculado a Trello cambia (drag/drop en Calendars),
  // actualizamos el badge de fecha en Trellos sin recargar.
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('trellos-events-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'events',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new || payload.old
          if (!row?.trello_card_id) return
          const cardId = String(row.trello_card_id)

          if (payload.eventType === 'DELETE' || row.is_trashed) {
            setCardEvents((prev) => {
              const next = { ...prev }
              delete next[cardId]
              return next
            })
            return
          }

          setCardEvents((prev) => ({
            ...prev,
            [cardId]: {
              id: row.id,
              trello_card_id: row.trello_card_id,
              calendar_id: row.calendar_id,
              start_time: row.start_time,
              end_time: row.end_time,
              is_all_day: row.is_all_day,
              is_trashed: row.is_trashed,
            },
          }))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  useEffect(() => {
    // Broadcast sync (funciona incluso si no activas Realtime en Supabase)
    if (!user) return
    const ch = supabase
      .channel('pedros-sync')
      .on('broadcast', { event: 'trello_event_changed' }, ({ payload }) => {
        if (!payload?.trello_card_id) return
        const cardId = String(payload.trello_card_id)
        if (payload.is_trashed) {
          setCardEvents((prev) => {
            const next = { ...prev }
            delete next[cardId]
            return next
          })
          return
        }
        setCardEvents((prev) => ({ ...prev, [cardId]: payload }))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    fetchBoards()
  }, [user])

  useEffect(() => {
    if (!user) return
    if (!activeBoard) return
    fetchBoardContent(activeBoard.id)
  }, [user, activeBoard])

  useEffect(() => {
    if (!user) return
    if (!activeBoard) return
    fetchCalendars()
  }, [user, activeBoard])

  useEffect(() => {
    if (!user) return
    if (!activeBoard) return
    if (!cards.length) {
      setCardEvents({})
      return
    }
    fetchCardEventsForBoard(activeBoard.id)
  }, [user, activeBoard, cards])

  useEffect(() => {
    if (!modalCard) return
    // Precarga calendarios si aún no están
    if (!calendars.length && !calLoading) fetchCalendars()
    // Precarga evento vinculado (si existe) en el modal
    const existing = cardEvents[String(modalCard.id)]
    if (existing) {
      setModalEvent({
        id: existing.id,
        calendar_id:
          existing.calendar_id ||
          activeBoard?.default_calendar_id ||
          calendars[0]?.id ||
          null,
        start: existing.start_time ? new Date(existing.start_time) : null,
        end: existing.end_time ? new Date(existing.end_time) : null,
        is_all_day: !!existing.is_all_day,
      })
    } else {
      setModalEvent(null)
    }
  }, [modalCard])

  async function fetchBoards() {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('trellos_boards')
      .select('*')
      .eq('user_id', user.id)
      .order('position', { ascending: true })
      .order('created_at', { ascending: false })
    if (error) console.error(error)
    setBoards(data || [])
    setLoading(false)
  }

  async function fetchBoardContent(boardId) {
    setLoading(true)
    try {
      const { data: cols, error: colErr } = await supabase
        .from('trellos_columns')
        .select('*')
        .eq('board_id', boardId)
        .order('position', { ascending: true })

      if (colErr) throw colErr
      setColumns(cols || [])

      if (!cols?.length) {
        setCards([])
        return
      }

      const { data: crds, error: cardErr } = await supabase
        .from('trellos_cards')
        .select('*')
        .eq('board_id', boardId)
        .order('position', { ascending: true })

      if (cardErr) throw cardErr
      setCards(crds || [])
    } catch (e) {
      console.error('fetchBoardContent:', e)
      setColumns([])
      setCards([])
    } finally {
      setLoading(false)
    }
  }

  async function fetchCalendars() {
    if (!user) return
    setCalLoading(true)
    try {
      const { data, error } = await supabase
        .from('calendars')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      setCalendars(data || [])
    } catch (e) {
      console.error('fetchCalendars:', e)
      setCalendars([])
    } finally {
      setCalLoading(false)
    }
  }

  async function fetchCardEventsForBoard(boardId) {
    if (!user) return
    const cardIds = (cards || []).map((c) => c.id).filter(Boolean)
    if (!cardIds.length) {
      setCardEvents({})
      return
    }
    const { data, error } = await supabase
      .from('events')
      .select('id,trello_card_id,calendar_id,start_time,end_time,is_all_day,is_trashed')
      .eq('user_id', user.id)
      .eq('is_trashed', false)
      .in('trello_card_id', cardIds)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('fetchCardEventsForBoard:', error)
      setCardEvents({})
      return
    }

    // si hay múltiples por card, nos quedamos con el más reciente (por order created_at desc)
    const map = {}
    for (const ev of data || []) {
      const key = String(ev.trello_card_id)
      if (!map[key]) map[key] = ev
    }
    setCardEvents(map)
  }

  const activeBoards = useMemo(() => boards.filter((b) => !b.is_trashed), [boards])
  const trashedBoards = useMemo(() => boards.filter((b) => b.is_trashed), [boards])

  const activeCards = useMemo(
    () => cards.filter((c) => !c.is_trashed),
    [cards]
  )
  const trashedCards = useMemo(
    () => cards.filter((c) => c.is_trashed),
    [cards]
  )

  const activeColumns = useMemo(() => columns.filter((c) => !c.is_trashed), [columns])
  const trashedColumns = useMemo(() => columns.filter((c) => c.is_trashed), [columns])

  async function handleCreateBoard(e) {
    e.preventDefault()
    if (!user) return
    const title = newBoardTitle.trim()
    if (!title) return

    const newPos = activeBoards.length
      ? Math.max(...activeBoards.map((b) => b.position ?? 0)) + 1
      : 0

    const { data, error } = await supabase
      .from('trellos_boards')
      .insert({
        user_id: user.id,
        title,
        icon: newBoardIcon,
        theme_color: newBoardColor,
        position: newPos,
        is_trashed: false,
      })
      .select('*')
      .single()

    if (error) {
      console.error(error)
      return
    }
    setBoards((prev) => [data, ...prev])
    setNewBoardTitle('')
    setIsCreatingBoard(false)
  }

  async function setBoardTrash(e, boardId, isTrashed) {
    e.stopPropagation()
    setBoards((prev) => prev.map((b) => (b.id === boardId ? { ...b, is_trashed: isTrashed } : b)))
    await supabase.from('trellos_boards').update({ is_trashed: isTrashed }).eq('id', boardId)
  }

  async function destroyBoard(e, boardId) {
    e.stopPropagation()
    if (!window.confirm('¿Destruir tablero permanentemente?')) return
    setBoards((prev) => prev.filter((b) => b.id !== boardId))
    await supabase.from('trellos_boards').delete().eq('id', boardId)
  }

  async function handleAddColumn(e) {
    e.preventDefault()
    if (!activeBoard) return
    const name = newColumnName.trim()
    if (!name) return

    const newPos = columns.length ? Math.max(...columns.map((c) => c.position ?? 0)) + 1 : 0
    const { data, error } = await supabase
      .from('trellos_columns')
      .insert({
        user_id: user.id,
        board_id: activeBoard.id,
        name,
        position: newPos,
        is_trashed: false,
      })
      .select('*')
      .single()
    if (error) {
      console.error(error)
      return
    }
    setColumns((prev) => [...prev, data])
    setNewColumnName('')
    setIsCreatingColumn(false)
  }

  async function setColumnTrash(e, columnId, isTrashed) {
    e?.stopPropagation()
    if (!activeBoard) return
    setColumns((prev) => prev.map((c) => (c.id === columnId ? { ...c, is_trashed: isTrashed } : c)))
    await supabase.from('trellos_columns').update({ is_trashed: isTrashed }).eq('id', columnId)

    // QoL: si tiras una columna a papelera, sus tarjetas también van a papelera
    if (isTrashed) {
      setCards((prev) =>
        prev.map((c) =>
          String(c.column_id) === String(columnId) ? { ...c, is_trashed: true } : c
        )
      )
      await supabase
        .from('trellos_cards')
        .update({ is_trashed: true })
        .eq('board_id', activeBoard.id)
        .eq('column_id', columnId)
    }
  }

  async function destroyColumn(e, columnId) {
    e?.stopPropagation()
    if (!window.confirm('¿Eliminar columna permanentemente? (Se eliminarán también sus tarjetas)')) return
    setDeletingColumnId(columnId)
    try {
      setColumns((prev) => prev.filter((c) => c.id !== columnId))
      setCards((prev) => prev.filter((c) => String(c.column_id) !== String(columnId)))
      await supabase.from('trellos_columns').delete().eq('id', columnId)
    } catch (err) {
      console.error('destroyColumn:', err)
    } finally {
      setDeletingColumnId(null)
    }
  }

  async function updateBoardDefaultCalendar(calendarIdOrNull) {
    if (!activeBoard) return
    const nextValue = calendarIdOrNull || null
    // Optimista
    setActiveBoard((b) => (b ? { ...b, default_calendar_id: nextValue } : b))
    setBoards((prev) =>
      prev.map((b) => (b.id === activeBoard.id ? { ...b, default_calendar_id: nextValue } : b))
    )
    const { error } = await supabase
      .from('trellos_boards')
      .update({ default_calendar_id: nextValue })
      .eq('id', activeBoard.id)
    if (error) console.error('updateBoardDefaultCalendar:', error)
  }

  async function handleCreateCard(columnId) {
    if (!activeBoard || !user) return
    const title = (newCardInputs[columnId] || '').trim()
    if (!title) return

    const cardsInCol = activeCards
      .filter((c) => c.column_id === columnId)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    const newPos = cardsInCol.length ? Math.max(...cardsInCol.map((c) => c.position ?? 0)) + 1 : 0

    const { data, error } = await supabase
      .from('trellos_cards')
      .insert({
        user_id: user.id,
        board_id: activeBoard.id,
        column_id: columnId,
        title,
        description: '',
        color: '#3b82f6',
        position: newPos,
        is_completed: false,
        is_trashed: false,
      })
      .select('*')
      .single()

    if (error) {
      console.error(error)
      return
    }
    setCards((prev) => [...prev, data])
    setNewCardInputs((prev) => ({ ...prev, [columnId]: '' }))
  }

  async function setCardTrash(e, cardId, isTrashed) {
    e?.stopPropagation()
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, is_trashed: isTrashed } : c)))
    await supabase.from('trellos_cards').update({ is_trashed: isTrashed }).eq('id', cardId)
  }

  async function destroyCard(e, cardId) {
    e?.stopPropagation()
    if (!window.confirm('¿Eliminar tarjeta permanentemente?')) return
    setCards((prev) => prev.filter((c) => c.id !== cardId))
    await supabase.from('trellos_cards').delete().eq('id', cardId)
  }

  async function toggleCompletion(e, cardId, current) {
    e.stopPropagation()
    const next = !current
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, is_completed: next } : c)))
    await supabase.from('trellos_cards').update({ is_completed: next }).eq('id', cardId)
    if (modalCard?.id === cardId) setModalCard((m) => ({ ...m, is_completed: next }))
  }

  async function closeAndSaveModal() {
    if (!modalCard) return
    setModalSaving(true)
    const payload = {
      title: (modalCard.title || '').trim() || 'Sin título',
      description: modalCard.description || '',
      color: modalCard.color || null,
      is_completed: !!modalCard.is_completed,
    }
    setCards((prev) => prev.map((c) => (c.id === modalCard.id ? { ...c, ...payload } : c)))
    await supabase.from('trellos_cards').update(payload).eq('id', modalCard.id)

    // Guardar/actualizar evento (Fecha) si aplica
    try {
      if (modalEvent?.start && modalEvent?.calendar_id) {
        let start = modalEvent.start instanceof Date ? modalEvent.start : new Date(modalEvent.start)
        let end = modalEvent.end instanceof Date ? modalEvent.end : new Date(modalEvent.end || start)

        if (modalEvent.is_all_day) {
          const s = fromDateInputValue(toDateInputValue(start))
          const e = fromDateInputValue(toDateInputValue(end))
          if (!s || !e) throw new Error('Invalid all-day dates')
          // end exclusivo (día siguiente a las 00:00)
          start = s
          end = addMinutes(e, 24 * 60)
        } else {
          if (Number.isNaN(start.getTime())) throw new Error('Invalid start time')
          end = addMinutes(start, Number(modalEventDuration) || 60)
        }

        const upsertPayload = {
          user_id: user.id,
          calendar_id: modalEvent.calendar_id,
          trello_card_id: modalCard.id,
          title: payload.title,
          description: payload.description,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          color_override: modalCard.color || null,
          is_all_day: !!modalEvent.is_all_day,
          is_trashed: false,
        }

        if (modalEvent.id) {
          const { data: updated, error } = await supabase
            .from('events')
            .update(upsertPayload)
            .eq('id', modalEvent.id)
            .select('id,trello_card_id,calendar_id,start_time,end_time,is_all_day,is_trashed')
            .single()
          if (error) throw error
          setCardEvents((prev) => ({ ...prev, [String(modalCard.id)]: updated }))
        } else {
          const { data: created, error } = await supabase
            .from('events')
            .insert(upsertPayload)
            .select('id,trello_card_id,calendar_id,start_time,end_time,is_all_day,is_trashed')
            .single()
          if (error) throw error
          setCardEvents((prev) => ({ ...prev, [String(modalCard.id)]: created }))
        }
      } else if (modalEvent?.id) {
        // Si el usuario “vacía” la fecha, mandamos a papelera el evento vinculado
        await supabase.from('events').update({ is_trashed: true }).eq('id', modalEvent.id)
        setCardEvents((prev) => {
          const next = { ...prev }
          delete next[String(modalCard.id)]
          return next
        })
      }
    } catch (e) {
      console.error('Saving card date/event failed:', e)
    }

    setModalCard(null)
    setModalEvent(null)
    setModalSaving(false)
  }

  // Drag & Drop (tarjetas entre columnas)
  async function onDragEnd(result) {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const cardId = draggableId
    const sourceColId = source.droppableId
    const destColId = destination.droppableId

    const moving = activeCards.find((c) => String(c.id) === String(cardId))
    if (!moving) return

    const nextActive = activeCards.filter((c) => String(c.id) !== String(cardId))

    const destList = nextActive
      .filter((c) => String(c.column_id) === String(destColId))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

    const inserted = { ...moving, column_id: destColId }
    destList.splice(destination.index, 0, inserted)

    const updates = []
    const final = []

    for (const col of columns) {
      const colId = String(col.id)
      const list =
        colId === String(destColId)
          ? destList
          : nextActive
              .filter((c) => String(c.column_id) === colId)
              .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

      list.forEach((c, idx) => {
        const changed =
          String(c.id) === String(cardId) ||
          idx !== (c.position ?? 0) ||
          String(c.column_id) !== colId
        const item = { ...c, position: idx, column_id: colId }
        final.push(item)
        if (changed) updates.push({ id: c.id, position: idx, column_id: colId })
      })
    }

    // Mantener trashed intactas
    setCards([...final, ...trashedCards])

    for (const u of updates) {
      await supabase
        .from('trellos_cards')
        .update({ position: u.position, column_id: u.column_id })
        .eq('id', u.id)
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 text-white font-sans flex items-center justify-center">
        <p className="animate-pulse text-slate-500">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans transition-all duration-300">
      <header className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 safe-top">
        <div className="flex items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (activeBoard) setActiveBoard(null)
              else navigate('/')
              setShowTrash(false)
            }}
            className="text-slate-400 hover:text-white transition-colors duration-200 flex-shrink-0"
            aria-label="Volver"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h1 className="text-xl font-black bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
            {activeBoard ? `${activeBoard.icon} ${activeBoard.title}` : 'Mis Trellos'}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {activeBoard && (
            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-2xl px-2 sm:px-3 py-1.5 sm:py-2 shadow-lg transition-all duration-300">
              <span className="text-slate-400 text-sm font-bold">Vinculado al calendario</span>
              <select
                value={activeBoard.default_calendar_id || ''}
                onChange={(e) => updateBoardDefaultCalendar(e.target.value || null)}
                className="bg-slate-900 border border-slate-600 text-white rounded-lg px-2 py-1 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-300 text-sm"
              >
                <option value="">(Ninguno)</option>
                {calendars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowTrash((v) => !v)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all duration-300 ${
              showTrash
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500'
            }`}
          >
            🗑️ Papelera
          </button>
        </div>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center p-20">
          <p className="animate-pulse text-slate-500">Cargando datos...</p>
        </div>
      ) : (
        <main className="p-4 sm:p-6">
          {/* NIVEL 1: Boards */}
          {!activeBoard && (
            <div className="max-w-7xl mx-auto">
              {showTrash ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {trashedBoards.length === 0 && (
                    <p className="text-slate-500 col-span-full animate-pulse">
                      No hay tableros en la papelera.
                    </p>
                  )}
                  {trashedBoards.map((b) => (
                    <div key={b.id} className={`${panel} p-6 opacity-80 border-red-900/30`}>
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="min-w-0">
                          <p className="text-3xl">{b.icon}</p>
                          <p className="font-bold text-slate-200 truncate">{b.title}</p>
                        </div>
                        <span
                          className="w-3 h-3 rounded-full border border-slate-700 mt-2"
                          style={{ backgroundColor: b.theme_color || '#3b82f6' }}
                          title="Color"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={(e) => setBoardTrash(e, b.id, false)}
                          className={btnSecondary}
                        >
                          Restaurar
                        </button>
                        <button
                          type="button"
                          onClick={(e) => destroyBoard(e, b.id)}
                          className={btnDanger}
                        >
                          Destruir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Crear tablero */}
                  {isCreatingBoard ? (
                    <form onSubmit={handleCreateBoard} className={`${panel} p-6`}>
                      <h2 className="font-bold text-slate-200 mb-4">Nuevo tablero</h2>

                      <div className="mb-4">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                          Icono
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {BOARD_ICONS.map((ic) => (
                            <button
                              key={ic}
                              type="button"
                              onClick={() => setNewBoardIcon(ic)}
                              className={`p-2 rounded-lg border transition-all duration-300 ${
                                newBoardIcon === ic
                                  ? 'border-blue-500 bg-slate-900'
                                  : 'border-slate-700 hover:border-slate-500 hover:bg-slate-900'
                              }`}
                              aria-label={`Icono ${ic}`}
                            >
                              <span className="text-2xl">{ic}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="mb-4">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                          Color
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {THEME_COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setNewBoardColor(c)}
                              className={`w-8 h-8 rounded-full border transition-all duration-300 ${
                                newBoardColor === c ? 'border-white' : 'border-slate-700'
                              }`}
                              style={{ backgroundColor: c }}
                              aria-label={`Color ${c}`}
                            />
                          ))}
                        </div>
                      </div>

                      <input
                        value={newBoardTitle}
                        onChange={(e) => setNewBoardTitle(e.target.value)}
                        placeholder="Nombre del tablero..."
                        className={input}
                        autoFocus
                      />
                      <div className="flex gap-2 mt-4">
                        <button type="submit" className={btnPrimary}>
                          Crear
                        </button>
                        <button type="button" className={btnSecondary} onClick={() => setIsCreatingBoard(false)}>
                          Cancelar
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsCreatingBoard(true)}
                      className={`${panel} p-6 border-dashed border-slate-600 text-left`}
                    >
                      <p className="text-slate-400 font-bold">+ Nuevo tablero</p>
                      <p className="text-slate-500 text-sm mt-1">
                        Crea un Trello con icono y color.
                      </p>
                    </button>
                  )}

                  {/* Boards activos */}
                  {activeBoards.map((b) => (
                    <div
                      key={b.id}
                      className={`group relative ${panel} p-6 text-left cursor-pointer hover:border-emerald-500 hover:shadow-[0_0_20px_rgba(16,185,129,0.2)]`}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setActiveBoard(b)
                        setShowTrash(false)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setActiveBoard(b)
                          setShowTrash(false)
                        }
                      }}
                    >
                      <button
                        type="button"
                        onClick={(e) => setBoardTrash(e, b.id, true)}
                        className="absolute opacity-0 group-hover:opacity-100 transition-all duration-300 top-3 right-3 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 rounded-lg px-2 py-1 text-xs font-bold"
                        title="Mover a papelera"
                      >
                        ✕
                      </button>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-4xl group-hover:scale-110 transition-transform duration-300 origin-left">
                            {b.icon}
                          </div>
                          <p className="font-bold text-slate-200 mt-2 truncate">{b.title}</p>
                        </div>
                        <span
                          className="w-3 h-3 rounded-full border border-slate-700 mt-1"
                          style={{ backgroundColor: b.theme_color || '#3b82f6' }}
                          title="Color"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* NIVEL 2: Board → columnas + cards */}
          {activeBoard && (
            <div className="flex overflow-x-auto gap-4 p-2 pb-4 transition-all duration-300">
              {showTrash ? (
                <div className="w-full">
                  <div className="flex flex-col gap-8">
                    <section>
                      <h2 className="font-bold text-slate-200 mb-4">Papelera (Columnas)</h2>
                      {trashedColumns.length === 0 ? (
                        <p className="text-slate-500 animate-pulse">No hay columnas en la papelera.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          {trashedColumns.map((col) => (
                            <div key={col.id} className={`${panel} p-4 opacity-80 border-red-900/30`}>
                              <p className="font-bold text-slate-200 truncate mb-3">{col.name}</p>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => setColumnTrash(e, col.id, false)}
                                  className={btnSecondary}
                                >
                                  Restaurar
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => destroyColumn(e, col.id)}
                                  disabled={deletingColumnId === col.id}
                                  className={btnDanger}
                                >
                                  {deletingColumnId === col.id ? '...' : 'Destruir'}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    <section>
                      <h2 className="font-bold text-slate-200 mb-4">Papelera (Tarjetas)</h2>
                  {trashedCards.length === 0 ? (
                    <p className="text-slate-500 animate-pulse text-center py-12">
                      La papelera de este tablero está vacía.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {trashedCards.map((c) => (
                        <div
                          key={c.id}
                          className={`${panel} p-4 opacity-80 border-red-900/30`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <p className="font-bold text-slate-200 truncate">{c.title}</p>
                            <span
                              className="w-3 h-3 rounded-full border border-slate-700"
                              style={{ backgroundColor: c.color || '#3b82f6' }}
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={(e) => setCardTrash(e, c.id, false)}
                              className={btnSecondary}
                            >
                              Restaurar
                            </button>
                            <button
                              type="button"
                              onClick={(e) => destroyCard(e, c.id)}
                              className={btnDanger}
                            >
                              Destruir
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                    </section>
                  </div>
                </div>
              ) : (
                <DragDropContext onDragEnd={onDragEnd}>
                  {activeColumns
                    .map((col) => (
                      <div
                        key={col.id}
                        className="bg-slate-800 p-3 sm:p-4 rounded-xl shadow-lg border border-slate-700 min-w-[260px] sm:min-w-[300px] flex-shrink-0 h-max transition-all duration-300"
                      >
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <h2 className="font-bold text-slate-200 truncate">{col.name}</h2>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 text-sm">
                              {activeCards.filter((c) => String(c.column_id) === String(col.id)).length}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => setColumnTrash(e, col.id, true)}
                              className="bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:text-red-300 font-bold rounded-lg px-2 py-1 transition-all duration-300 text-xs"
                              title="Eliminar columna"
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        <Droppable droppableId={String(col.id)}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              className={`space-y-2 min-h-[24px] rounded-lg p-1 transition-all duration-300 ${
                                snapshot.isDraggingOver ? 'bg-slate-900/40' : ''
                              }`}
                            >
                              {activeCards
                                .filter((c) => String(c.column_id) === String(col.id))
                                .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                                .map((card, idx) => (
                                  <Draggable
                                    key={String(card.id)}
                                    draggableId={String(card.id)}
                                    index={idx}
                                  >
                                    {(provided, snapshot) => (
                                      <div
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        {...provided.dragHandleProps}
                                        className={`relative group p-3 rounded-lg shadow cursor-grab active:cursor-grabbing transition-all duration-300 ${
                                          snapshot.isDragging ? 'opacity-50 border-dashed border-blue-400 border' : ''
                                        }`}
                                        style={{
                                          ...provided.draggableProps.style,
                                          backgroundColor: card.color || '#3b82f6',
                                        }}
                                        onClick={() => setModalCard(card)}
                                      >
                                        <div className="flex items-start gap-3">
                                          <input
                                            type="checkbox"
                                            checked={!!card.is_completed}
                                            onChange={(e) => toggleCompletion(e, card.id, card.is_completed)}
                                            onClick={(e) => e.stopPropagation()}
                                            className="mt-1 accent-emerald-500"
                                            aria-label="Completar"
                                          />
                                          <div className="min-w-0 flex-1">
                                            <p
                                              className={`font-bold text-white text-sm break-words ${
                                                card.is_completed ? 'line-through opacity-80' : ''
                                              }`}
                                            >
                                              {card.title}
                                            </p>
                                            {card.description ? (
                                              <p className="text-white/80 text-xs mt-1 line-clamp-2">
                                                {card.description}
                                              </p>
                                            ) : null}
                                            {cardEvents[String(card.id)]?.start_time ? (
                                              <p className="text-white/80 text-[11px] mt-2">
                                                📅 {formatShort(cardEvents[String(card.id)].start_time)}
                                              </p>
                                            ) : null}
                                          </div>
                                        </div>

                                        <button
                                          type="button"
                                          onClick={(e) => setCardTrash(e, card.id, true)}
                                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all duration-300 bg-black/30 hover:bg-black/50 text-white rounded px-2 py-1 text-xs font-bold"
                                          title="Papelera"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    )}
                                  </Draggable>
                                ))}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>

                        <div className="mt-3">
                          <input
                            value={newCardInputs[col.id] || ''}
                            onChange={(e) =>
                              setNewCardInputs((prev) => ({ ...prev, [col.id]: e.target.value }))
                            }
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateCard(col.id)}
                            placeholder="+ Añadir tarjeta..."
                            className="w-full bg-transparent border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-300"
                          />
                        </div>
                      </div>
                    ))}

                  <div className="min-w-[260px] sm:min-w-[300px] flex-shrink-0">
                    {isCreatingColumn ? (
                      <form onSubmit={handleAddColumn} className={`${panel} p-4`}>
                        <input
                          value={newColumnName}
                          onChange={(e) => setNewColumnName(e.target.value)}
                          placeholder="Nombre de columna..."
                          className={input}
                          autoFocus
                        />
                        <div className="flex gap-2 mt-3">
                          <button type="submit" className={btnPrimary}>
                            Añadir
                          </button>
                          <button type="button" className={btnSecondary} onClick={() => setIsCreatingColumn(false)}>
                            Cancelar
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsCreatingColumn(true)}
                        className={`${panel} w-full p-4 text-left`}
                      >
                        + Añadir lista
                      </button>
                    )}
                  </div>
                </DragDropContext>
              )}
            </div>
          )}
        </main>
      )}

      {/* Modal edición tarjeta */}
      {modalCard && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 transition-all duration-300 overflow-y-auto"
          onClick={closeAndSaveModal}
          role="dialog"
          aria-modal="true"
          aria-label="Editar tarjeta"
        >
          <div
            className="bg-slate-800 rounded-t-3xl sm:rounded-2xl border border-slate-700 shadow-2xl w-full sm:max-w-2xl p-5 sm:p-6 transition-all duration-300 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-5">
              <h2 className="text-lg font-bold text-slate-200">Editar tarjeta</h2>
              <button type="button" className={btnSecondary} onClick={() => setModalCard(null)}>
                Cerrar
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={!!modalCard.is_completed}
                  onChange={(e) => setModalCard((m) => ({ ...m, is_completed: e.target.checked }))}
                  className="accent-emerald-500"
                />
                <span className="text-slate-300 font-bold text-sm">Completada</span>
              </div>

              <div>
                <label className="text-sm font-bold text-slate-300">Título</label>
                <input
                  value={modalCard.title || ''}
                  onChange={(e) => setModalCard((m) => ({ ...m, title: e.target.value }))}
                  className={`${input} text-lg font-bold`}
                  placeholder="Título..."
                />
              </div>

              <div>
                <label className="text-sm font-bold text-slate-300">Descripción</label>
                <textarea
                  value={modalCard.description || ''}
                  onChange={(e) => setModalCard((m) => ({ ...m, description: e.target.value }))}
                  rows={8}
                  className={`${input} resize-none`}
                  placeholder="Descripción..."
                />
              </div>

              {/* Fecha + Calendario */}
              <div className="bg-slate-900/40 border border-slate-700 rounded-2xl p-4 transition-all duration-300">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-bold text-slate-200">📅 Fecha</p>
                    <p className="text-xs text-slate-500">
                      Vincula esta tarjeta a un evento en tu calendario.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!calendars.length) await fetchCalendars()
                      const existing = cardEvents[String(modalCard.id)]
                      const defaultCal =
                        activeBoard?.default_calendar_id ||
                        existing?.calendar_id ||
                        calendars[0]?.id ||
                        null
                      setModalEventDuration(60)
                      setModalEvent((prev) => ({
                        id: existing?.id || prev?.id || null,
                        calendar_id: defaultCal,
                        start: existing?.start_time ? new Date(existing.start_time) : prev?.start || new Date(),
                        end: existing?.end_time ? new Date(existing.end_time) : prev?.end || new Date(Date.now() + 60 * 60 * 1000),
                        is_all_day: existing?.is_all_day ?? prev?.is_all_day ?? false,
                      }))
                    }}
                    className={btnSecondary}
                  >
                    {modalEvent ? 'Actualizar' : 'Añadir fecha'}
                  </button>
                </div>

                {!modalEvent ? (
                  <p className="text-slate-500 text-sm">
                    Sin fecha asignada.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {modalEvent.is_all_day ? (
                        <>
                          <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                              Inicio (día)
                            </label>
                            <input
                              type="date"
                              value={toDateInputValue(modalEvent.start)}
                              onChange={(e) => {
                                const start = fromDateInputValue(e.target.value)
                                if (!start) return
                                const currentEnd = fromDateInputValue(toDateInputValue(modalEvent.end))
                                const safeEnd =
                                  currentEnd && currentEnd.getTime() < start.getTime()
                                    ? start
                                    : currentEnd || start
                                setModalEvent((m) => ({ ...m, start, end: safeEnd }))
                              }}
                              className={input}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                              Fin (día)
                            </label>
                            <input
                              type="date"
                              value={toDateInputValue(modalEvent.end)}
                              onChange={(e) => {
                                const end = fromDateInputValue(e.target.value)
                                if (!end) return
                                const start = fromDateInputValue(toDateInputValue(modalEvent.start))
                                const safeEnd = start && end.getTime() < start.getTime() ? start : end
                                setModalEvent((m) => ({ ...m, end: safeEnd }))
                              }}
                              className={input}
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                              Inicio
                            </label>
                            <input
                              type="datetime-local"
                              value={toLocalInputValue(modalEvent.start)}
                              onChange={(e) => {
                                const start = fromLocalInputValue(e.target.value)
                                if (!start) return
                                setModalEvent((m) => ({ ...m, start }))
                              }}
                              className={input}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                              Duración
                            </label>
                            <div className="flex gap-2">
                              <select
                                value={modalEventDuration}
                                onChange={(e) => setModalEventDuration(Number(e.target.value))}
                                className={input}
                              >
                                <option value={15}>15 min</option>
                                <option value={30}>30 min</option>
                                <option value={45}>45 min</option>
                                <option value={60}>1 hora</option>
                                <option value={90}>1h 30m</option>
                                <option value={120}>2 horas</option>
                                <option value={180}>3 horas</option>
                              </select>
                              <div className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-300 flex items-center justify-between min-w-[7rem]">
                                <span className="text-slate-500">Fin</span>
                                <span className="font-bold">
                                  {toLocalInputValue(addMinutes(modalEvent.start, Number(modalEventDuration) || 60)).slice(11)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                      <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          Calendario
                        </label>
                        <select
                          value={modalEvent.calendar_id || activeBoard?.default_calendar_id || ''}
                          onChange={(e) =>
                            setModalEvent((m) => ({ ...m, calendar_id: e.target.value || null }))
                          }
                          className={input}
                        >
                          <option value="" disabled>
                            {calLoading ? 'Cargando...' : 'Selecciona un calendario'}
                          </option>
                          {calendars.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <label className="flex items-center gap-2 text-sm font-bold text-slate-300">
                        <input
                          type="checkbox"
                          checked={!!modalEvent.is_all_day}
                          onChange={(e) => setModalEvent((m) => ({ ...m, is_all_day: e.target.checked }))}
                          className="accent-blue-500"
                        />
                        Todo el día
                      </label>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-slate-500">
                        Tip: si la tarjeta se completa o va a papelera, el evento se ocultará en Calendarios.
                      </p>
                      <button
                        type="button"
                        onClick={() => setModalEvent((m) => ({ ...m, start: null, end: null, calendar_id: null }))}
                        className="text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:text-red-300 rounded-lg px-3 py-2 transition-all duration-300"
                      >
                        Quitar fecha
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-bold text-slate-300">Color</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CARD_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setModalCard((m) => ({ ...m, color: c }))}
                      className={`w-8 h-8 rounded-full border transition-all duration-300 ${
                        (modalCard.color || '') === c ? 'border-white' : 'border-slate-700'
                      }`}
                      style={{ backgroundColor: c }}
                      aria-label={`Color ${c}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-slate-700">
              <button type="button" className={btnDanger} onClick={(e) => setCardTrash(e, modalCard.id, true)} disabled={modalSaving}>
                Mover a papelera
              </button>
              <button type="button" className={btnPrimary} onClick={closeAndSaveModal} disabled={modalSaving}>
                {modalSaving ? 'Guardando...' : 'Hecho'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}