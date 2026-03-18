import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { supabase } from './supabaseClient'
import { IconArrowLeft, IconCheck, IconLoader, IconTrash } from './components/Icons'
import './Calendars.css'

function toLocalInputValue(date) {
  if (!date) return ''
  const pad = (n) => String(n).padStart(2, '0')
  const yyyy = date.getFullYear()
  const mm = pad(date.getMonth() + 1)
  const dd = pad(date.getDate())
  const hh = pad(date.getHours())
  const mi = pad(date.getMinutes())
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

const COLORS = [
  '#3b82f6', // blue-500
  '#22c55e', // green-500
  '#a855f7', // purple-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
  '#e879f9', // fuchsia-400
]

export default function Calendars() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [calLoading, setCalLoading] = useState(false)

  const [calendars, setCalendars] = useState([])
  const [eventsRaw, setEventsRaw] = useState([])
  const [visibleCalendarIds, setVisibleCalendarIds] = useState(() => new Set())

  const [showTrash, setShowTrash] = useState(false)
  const [trashedEvents, setTrashedEvents] = useState([])

  const [createCalName, setCreateCalName] = useState('')
  const [createCalColor, setCreateCalColor] = useState(COLORS[0])
  const [deletingCalId, setDeletingCalId] = useState(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalSaving, setModalSaving] = useState(false)
  const [modalEvent, setModalEvent] = useState(null) // { id? , title, description, start, end, is_all_day, calendar_id, color_override, trello_card_id }
  const [modalDuration, setModalDuration] = useState(60) // minutos (solo cuando no es all-day)
  const [syncChannel, setSyncChannel] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => setUser(u ?? null))
  }, [])

  useEffect(() => {
    // Canal de broadcast para sincronizar cambios de eventos → Trellos (sin depender de Realtime DB)
    const ch = supabase.channel('pedros-sync')
    ch.subscribe()
    setSyncChannel(ch)
    return () => {
      supabase.removeChannel(ch)
    }
  }, [])

  async function fetchCalendarsAndEvents(u) {
    if (!u) return
    setLoading(true)
    try {
      const { data: cals, error: calErr } = await supabase
        .from('calendars')
        .select('*')
        .eq('user_id', u.id)
        .order('created_at', { ascending: true })

      if (calErr) throw calErr
      setCalendars(cals || [])
      setVisibleCalendarIds(new Set((cals || []).map((c) => c.id)))

      const { data: evs, error: evErr } = await supabase
        .from('events')
        .select(
          'id,user_id,calendar_id,trello_card_id,title,description,start_time,end_time,color_override,is_all_day,is_trashed,created_at,' +
            'calendar:calendars(id,name,color),' +
            'trello:trellos_cards(id,is_completed,is_trashed,title,description)'
        )
        .eq('user_id', u.id)
        .order('start_time', { ascending: true })

      if (evErr) throw evErr
      setEventsRaw(evs || [])
    } catch (e) {
      console.error('fetchCalendarsAndEvents error:', e)
      setCalendars([])
      setEventsRaw([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user) return
    fetchCalendarsAndEvents(user)
  }, [user])

  useEffect(() => {
    if (!showTrash) return
    // Vista papelera: eventos eliminados (no incluye los filtrados por Trello; es papelera explícita)
    const trashed = (eventsRaw || []).filter((e) => e.is_trashed)
    setTrashedEvents(trashed)
  }, [showTrash, eventsRaw])

  const eventsForCalendar = useMemo(() => {
    const visible = visibleCalendarIds
    return (eventsRaw || [])
      .filter((e) => !e.is_trashed)
      .filter((e) => visible.has(e.calendar_id))
      .filter((e) => {
        // Sincronización mágica: si está vinculado a Trello y esa tarjeta está completada o en papelera, se oculta.
        if (!e.trello_card_id) return true
        const trello = e.trello
        if (!trello) return true
        return trello.is_completed !== true && trello.is_trashed !== true
      })
      .map((e) => {
        const calColor = e.calendar?.color || '#3b82f6'
        const color = e.color_override || calColor
        return {
          id: String(e.id),
          title: e.title || '(Sin título)',
          start: e.start_time,
          end: e.end_time,
          allDay: !!e.is_all_day,
          backgroundColor: color,
          borderColor: 'transparent',
          textColor: '#fff',
          extendedProps: {
            calendar_id: e.calendar_id,
            description: e.description || '',
            color_override: e.color_override || '',
            trello_card_id: e.trello_card_id,
          },
        }
      })
  }, [eventsRaw, visibleCalendarIds])

  function openCreateModalFromDate(date, endDate, allDay = false) {
    const start = date ? new Date(date) : new Date()
    const end = endDate
      ? new Date(endDate)
      : allDay
        ? new Date(start.getTime() + 24 * 60 * 60 * 1000)
        : new Date(start.getTime() + 60 * 60 * 1000)
    const defaultCalendarId = calendars[0]?.id || null
    setModalDuration(60)
    setModalEvent({
      id: null,
      title: '',
      description: '',
      start,
      end,
      is_all_day: allDay,
      calendar_id: defaultCalendarId,
      color_override: '',
      trello_card_id: null,
    })
    setModalOpen(true)
  }

  function openEditModal(fcEvent) {
    const ex = fcEvent.extendedProps || {}
    const start = fcEvent.start ? new Date(fcEvent.start) : new Date()
    const end = fcEvent.end ? new Date(fcEvent.end) : addMinutes(start, 60)
    const dur = Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000) || 60)
    setModalDuration(dur)
    setModalEvent({
      id: fcEvent.id,
      title: fcEvent.title || '',
      description: ex.description || '',
      start,
      end,
      is_all_day: !!fcEvent.allDay,
      calendar_id: ex.calendar_id || null,
      color_override: ex.color_override || '',
      trello_card_id: ex.trello_card_id || null,
    })
    setModalOpen(true)
  }

  async function createCalendar(e) {
    e.preventDefault()
    if (!user || !createCalName.trim()) return
    setCalLoading(true)
    try {
      const { data, error } = await supabase
        .from('calendars')
        .insert({
          user_id: user.id,
          name: createCalName.trim(),
          color: createCalColor,
        })
        .select('*')
        .single()
      if (error) throw error
      setCalendars((prev) => [...prev, data])
      setVisibleCalendarIds((prev) => new Set([...prev, data.id]))
      setCreateCalName('')
      setCreateCalColor(COLORS[0])
    } catch (err) {
      console.error('createCalendar error:', err)
    } finally {
      setCalLoading(false)
    }
  }

  async function deleteCalendar(calendarId) {
    if (!calendarId) return
    if (!window.confirm('¿Eliminar este calendario? Se eliminarán también sus eventos.')) return
    setDeletingCalId(calendarId)
    try {
      await supabase.from('calendars').delete().eq('id', calendarId)
      setCalendars((prev) => prev.filter((c) => c.id !== calendarId))
      setVisibleCalendarIds((prev) => {
        const next = new Set(prev)
        next.delete(calendarId)
        return next
      })
      setEventsRaw((prev) => prev.filter((e) => e.calendar_id !== calendarId))
      setModalEvent((m) => {
        if (!m) return m
        if (String(m.calendar_id) !== String(calendarId)) return m
        const fallback = calendars.find((c) => String(c.id) !== String(calendarId))?.id || null
        return { ...m, calendar_id: fallback }
      })
    } catch (e) {
      console.error('deleteCalendar error:', e)
    } finally {
      setDeletingCalId(null)
    }
  }

  async function persistEventTimes(eventId, start, end, allDay) {
    // Actualiza solo fechas/horas (drag/resize) y notifica a Trellos si está vinculado
    const { data, error } = await supabase
      .from('events')
      .update({
        start_time: start?.toISOString() ?? null,
        end_time: end?.toISOString() ?? null,
        is_all_day: !!allDay,
      })
      .eq('id', eventId)
      .select('id,trello_card_id,calendar_id,start_time,end_time,is_all_day,is_trashed')
      .single()
    if (error) throw error

    if (data?.trello_card_id && syncChannel) {
      await syncChannel.send({
        type: 'broadcast',
        event: 'trello_event_changed',
        payload: data,
      })
    }

    // Mantener cache local consistente
    setEventsRaw((prev) =>
      prev.map((e) => (String(e.id) === String(eventId) ? { ...e, ...data } : e))
    )
  }

  async function saveModalAndClose() {
    if (!modalEvent || !user) return
    if (!modalEvent.calendar_id) return
    let start = modalEvent.start instanceof Date ? modalEvent.start : new Date(modalEvent.start)
    let end = modalEvent.end instanceof Date ? modalEvent.end : new Date(modalEvent.end)

    // Google Calendar-like behavior:
    // - All-day: use dates only, store start at 00:00 and end at next-day 00:00 (exclusive)
    // - Timed: end is computed by duration if needed
    if (modalEvent.is_all_day) {
      const s = fromDateInputValue(toDateInputValue(start))
      const e = fromDateInputValue(toDateInputValue(end))
      if (!s || !e) return
      const endExclusive = addMinutes(e, 24 * 60)
      start = s
      end = endExclusive
    } else {
      if (Number.isNaN(start.getTime())) return
      const computedEnd = addMinutes(start, Number(modalDuration) || 60)
      end = computedEnd
    }

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return

    setModalSaving(true)
    try {
      if (!modalEvent.id) {
        const { data, error } = await supabase
          .from('events')
          .insert({
            user_id: user.id,
            calendar_id: modalEvent.calendar_id,
            trello_card_id: modalEvent.trello_card_id,
            title: modalEvent.title.trim() || 'Evento',
            description: modalEvent.description || '',
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            color_override: modalEvent.color_override || null,
            is_all_day: !!modalEvent.is_all_day,
            is_trashed: false,
          })
          .select(
            'id,user_id,calendar_id,trello_card_id,title,description,start_time,end_time,color_override,is_all_day,is_trashed,created_at,' +
              'calendar:calendars(id,name,color),' +
              'trello:trellos_cards(id,is_completed,is_trashed,title,description)'
          )
          .single()
        if (error) throw error
        setEventsRaw((prev) => [...prev, data])
        if (data?.trello_card_id && syncChannel) {
          await syncChannel.send({
            type: 'broadcast',
            event: 'trello_event_changed',
            payload: {
              id: data.id,
              trello_card_id: data.trello_card_id,
              calendar_id: data.calendar_id,
              start_time: data.start_time,
              end_time: data.end_time,
              is_all_day: data.is_all_day,
              is_trashed: data.is_trashed,
            },
          })
        }
      } else {
        const { data, error } = await supabase
          .from('events')
          .update({
            calendar_id: modalEvent.calendar_id,
            title: modalEvent.title.trim() || 'Evento',
            description: modalEvent.description || '',
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            color_override: modalEvent.color_override || null,
            is_all_day: !!modalEvent.is_all_day,
          })
          .eq('id', modalEvent.id)
          .select(
            'id,user_id,calendar_id,trello_card_id,title,description,start_time,end_time,color_override,is_all_day,is_trashed,created_at,' +
              'calendar:calendars(id,name,color),' +
              'trello:trellos_cards(id,is_completed,is_trashed,title,description)'
          )
          .single()
        if (error) throw error
        setEventsRaw((prev) => prev.map((e) => (String(e.id) === String(data.id) ? data : e)))
        if (data?.trello_card_id && syncChannel) {
          await syncChannel.send({
            type: 'broadcast',
            event: 'trello_event_changed',
            payload: {
              id: data.id,
              trello_card_id: data.trello_card_id,
              calendar_id: data.calendar_id,
              start_time: data.start_time,
              end_time: data.end_time,
              is_all_day: data.is_all_day,
              is_trashed: data.is_trashed,
            },
          })
        }

        // Bidireccional: si está vinculado a Trello, sincroniza título y descripción → trellos_cards.title/content
        if (modalEvent.trello_card_id) {
          await supabase
            .from('trellos_cards')
            .update({
              title: modalEvent.title.trim() || 'Tarea',
              description: modalEvent.description || '',
            })
            .eq('id', modalEvent.trello_card_id)
        }
      }
    } catch (err) {
      console.error('saveModalAndClose error:', err)
    } finally {
      setModalSaving(false)
      setModalOpen(false)
      setModalEvent(null)
    }
  }

  async function trashEvent(eventId) {
    if (!eventId) return
    await supabase.from('events').update({ is_trashed: true }).eq('id', eventId)
    setEventsRaw((prev) =>
      prev.map((e) => (String(e.id) === String(eventId) ? { ...e, is_trashed: true } : e))
    )
  }

  async function restoreEvent(eventId) {
    await supabase.from('events').update({ is_trashed: false }).eq('id', eventId)
    setEventsRaw((prev) =>
      prev.map((e) => (String(e.id) === String(eventId) ? { ...e, is_trashed: false } : e))
    )
  }

  async function destroyEvent(eventId) {
    if (!window.confirm('¿Eliminar evento permanentemente?')) return
    await supabase.from('events').delete().eq('id', eventId)
    setEventsRaw((prev) => prev.filter((e) => String(e.id) !== String(eventId)))
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 text-white font-sans flex items-center justify-center">
        <p className="animate-pulse text-slate-500">Cargando...</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white font-sans flex items-center justify-center">
        <IconLoader className="w-8 h-8 text-blue-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans transition-all duration-300">
      <header className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 px-4 py-3 sm:px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-slate-400 hover:text-white transition-colors duration-300 text-2xl"
            aria-label="Volver"
          >
            <IconArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-black bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
            Calendarios
          </h1>
        </div>
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
      </header>

      <main className="p-3 sm:p-6 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 sm:gap-6">
        {/* Sidebar */}
        <aside className="bg-slate-800 rounded-2xl border border-slate-700 shadow-lg p-4 transition-all duration-300 h-max order-2 lg:order-1">
          <h2 className="font-bold text-slate-200 mb-4">Mis calendarios</h2>

          <form onSubmit={createCalendar} className="space-y-3 mb-6">
            <input
              value={createCalName}
              onChange={(e) => setCreateCalName(e.target.value)}
              placeholder="Nuevo calendario..."
              className="w-full bg-slate-900 border border-slate-600 text-white placeholder-slate-500 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-300"
            />
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {COLORS.slice(0, 6).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCreateCalColor(c)}
                    className={`w-7 h-7 rounded-full border transition-all duration-300 ${
                      createCalColor === c ? 'border-white' : 'border-slate-700'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
              <button
                type="submit"
                disabled={calLoading}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg px-4 py-2 transition-all duration-300 disabled:opacity-50"
              >
                {calLoading ? '...' : 'Crear'}
              </button>
            </div>
          </form>

          <div className="space-y-2">
            {calendars.length === 0 ? (
              <p className="text-slate-500 text-sm animate-pulse">Cargando calendarios...</p>
            ) : (
              calendars.map((cal) => {
                const checked = visibleCalendarIds.has(cal.id)
                return (
                  <label
                    key={cal.id}
                    className="group flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-700/40 transition-all duration-300 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setVisibleCalendarIds((prev) => {
                          const next = new Set(prev)
                          if (next.has(cal.id)) next.delete(cal.id)
                          else next.add(cal.id)
                          return next
                        })
                      }}
                      className="accent-blue-500"
                    />
                    <span
                      className="w-3 h-3 rounded-full border border-slate-700"
                      style={{ backgroundColor: cal.color || '#3b82f6' }}
                    />
                    <span className="text-slate-200 font-semibold truncate">{cal.name}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        deleteCalendar(cal.id)
                      }}
                      disabled={deletingCalId === cal.id}
                      className="ml-auto opacity-0 group-hover:opacity-100 transition-all duration-300 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:text-red-300 font-bold rounded-lg px-2.5 py-1.5 text-xs"
                      title="Eliminar calendario"
                    >
                      {deletingCalId === cal.id ? '...' : '✕'}
                    </button>
                  </label>
                )
              })
            )}
          </div>

          <div className="mt-6">
            <button
              type="button"
              onClick={() => openCreateModalFromDate(new Date(), null, false)}
              className="w-full bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white font-bold rounded-lg px-4 py-2 transition-all duration-300"
            >
              + Nuevo evento
            </button>
          </div>
        </aside>

        {/* Main */}
        <section className="bg-slate-800 rounded-2xl border border-slate-700 shadow-lg p-3 sm:p-4 transition-all duration-300 min-h-[70vh]">
          {showTrash ? (
            <div className="p-4">
              <h2 className="font-bold text-slate-200 mb-4 flex items-center gap-2">
                <IconTrash className="w-5 h-5" />
                Papelera (Eventos)
              </h2>
              {trashedEvents.length === 0 ? (
                <p className="text-slate-500 animate-pulse">No hay eventos en la papelera.</p>
              ) : (
                <div className="space-y-3">
                  {trashedEvents.map((e) => (
                    <div
                      key={e.id}
                      className="bg-slate-900/40 border border-red-900/30 rounded-xl p-4 opacity-80 transition-all duration-300"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-200 truncate">{e.title}</p>
                          <p className="text-slate-500 text-sm truncate">
                            {e.start_time} → {e.end_time}
                          </p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => restoreEvent(e.id)}
                            className="bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white font-bold rounded-lg px-3 py-2 transition-all duration-300 text-sm"
                          >
                            Restaurar
                          </button>
                          <button
                            type="button"
                            onClick={() => destroyEvent(e.id)}
                            className="bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:text-red-300 font-bold rounded-lg px-3 py-2 transition-all duration-300 text-sm"
                          >
                            Destruir
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{
                left: 'prev,next',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek',
              }}
              selectable
              selectMirror
              nowIndicator
              height="auto"
              events={eventsForCalendar}
              dateClick={(info) => openCreateModalFromDate(info.date, null, true)}
              select={(info) => openCreateModalFromDate(info.start, info.end, info.allDay)}
              eventClick={(info) => {
                info.jsEvent.preventDefault()
                openEditModal(info.event)
              }}
              editable
              eventDrop={async (info) => {
                try {
                  await persistEventTimes(info.event.id, info.event.start, info.event.end, info.event.allDay)
                } catch (e) {
                  console.error(e)
                  info.revert()
                }
              }}
              eventResize={async (info) => {
                try {
                  await persistEventTimes(info.event.id, info.event.start, info.event.end, info.event.allDay)
                } catch (e) {
                  console.error(e)
                  info.revert()
                }
              }}
              eventDidMount={(arg) => {
                // Quick actions: right click to trash
                arg.el.addEventListener('contextmenu', (e) => {
                  e.preventDefault()
                  trashEvent(arg.event.id)
                })
              }}
            />
          )}
        </section>
      </main>

      {/* Modal */}
      {modalOpen && modalEvent && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all duration-300"
          onClick={() => saveModalAndClose()}
          role="dialog"
          aria-modal="true"
          aria-label="Editar evento"
        >
          <div
            className="bg-slate-800 rounded-t-3xl sm:rounded-2xl border border-slate-700 shadow-2xl w-full sm:max-w-2xl p-5 sm:p-6 transition-all duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-5">
              <h2 className="text-lg font-bold text-slate-200">
                {modalEvent.id ? 'Editar evento' : 'Nuevo evento'}
              </h2>
              <div className="flex items-center gap-2">
                {modalEvent.id && (
                  <button
                    type="button"
                    onClick={() => trashEvent(modalEvent.id)}
                    className="bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:text-red-300 font-bold rounded-lg px-3 py-2 transition-all duration-300 text-sm inline-flex items-center gap-2"
                  >
                    <IconTrash className="w-4 h-4" />
                    Papelera
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false)
                    setModalEvent(null)
                  }}
                  className="bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white font-bold rounded-lg px-3 py-2 transition-all duration-300 text-sm"
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-bold text-slate-300">Título</label>
                <input
                  value={modalEvent.title}
                  onChange={(e) => setModalEvent((m) => ({ ...m, title: e.target.value }))}
                  className="mt-1 w-full bg-slate-900 border border-slate-600 text-white placeholder-slate-500 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-300 text-lg font-bold"
                  placeholder="Título del evento..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {modalEvent.is_all_day ? (
                  <>
                    <div>
                      <label className="text-sm font-bold text-slate-300">Inicio (día)</label>
                      <input
                        type="date"
                        value={toDateInputValue(modalEvent.start)}
                        onChange={(e) => {
                          const start = fromDateInputValue(e.target.value)
                          if (!start) return
                          const currentEnd = fromDateInputValue(toDateInputValue(modalEvent.end))
                          const safeEnd = currentEnd && currentEnd.getTime() < start.getTime() ? start : (currentEnd || start)
                          setModalEvent((m) => ({ ...m, start, end: safeEnd }))
                        }}
                        className="mt-1 w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-300"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-bold text-slate-300">Fin (día)</label>
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
                        className="mt-1 w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-300"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="text-sm font-bold text-slate-300">Inicio</label>
                      <input
                        type="datetime-local"
                        value={toLocalInputValue(modalEvent.start)}
                        onChange={(e) => {
                          const start = fromLocalInputValue(e.target.value)
                          if (!start) return
                          setModalEvent((m) => ({ ...m, start }))
                        }}
                        className="mt-1 w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-300"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-bold text-slate-300">Duración</label>
                      <div className="mt-1 flex gap-2">
                        <select
                          value={modalDuration}
                          onChange={(e) => setModalDuration(Number(e.target.value))}
                          className="flex-1 bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-300"
                        >
                          <option value={15}>15 min</option>
                          <option value={30}>30 min</option>
                          <option value={45}>45 min</option>
                          <option value={60}>1 hora</option>
                          <option value={90}>1h 30m</option>
                          <option value={120}>2 horas</option>
                          <option value={180}>3 horas</option>
                        </select>
                        <div className="w-[11rem] bg-slate-900 border border-slate-600 text-slate-300 rounded-lg px-3 py-2 text-sm flex items-center justify-between">
                          <span className="text-slate-400">Fin</span>
                          <span className="font-bold">
                            {toLocalInputValue(addMinutes(modalEvent.start, Number(modalDuration) || 60)).slice(11)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center gap-3">
                <input
                  id="allDay"
                  type="checkbox"
                  checked={!!modalEvent.is_all_day}
                  onChange={(e) => setModalEvent((m) => ({ ...m, is_all_day: e.target.checked }))}
                  className="accent-blue-500"
                />
                <label htmlFor="allDay" className="text-sm font-bold text-slate-300">
                  Todo el día
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-bold text-slate-300">Calendario</label>
                  <select
                    value={modalEvent.calendar_id || ''}
                    onChange={(e) => setModalEvent((m) => ({ ...m, calendar_id: e.target.value }))}
                    className="mt-1 w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-300"
                  >
                    {calendars.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-bold text-slate-300">Color (opcional)</label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setModalEvent((m) => ({ ...m, color_override: '' }))}
                      className={`px-3 py-2 rounded-lg border text-sm font-bold transition-all duration-300 ${
                        !modalEvent.color_override
                          ? 'border-blue-500 text-blue-400'
                          : 'border-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      Heredar
                    </button>
                    {COLORS.slice(0, 6).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setModalEvent((m) => ({ ...m, color_override: c }))}
                        className={`w-8 h-8 rounded-full border transition-all duration-300 ${
                          modalEvent.color_override === c ? 'border-white' : 'border-slate-700'
                        }`}
                        style={{ backgroundColor: c }}
                        aria-label={`Color ${c}`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-bold text-slate-300">Descripción</label>
                <textarea
                  value={modalEvent.description}
                  onChange={(e) => setModalEvent((m) => ({ ...m, description: e.target.value }))}
                  rows={6}
                  placeholder="Detalles del evento..."
                  className="mt-1 w-full bg-slate-900 border border-slate-600 text-white placeholder-slate-500 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-300 resize-none"
                />
                {modalEvent.trello_card_id && (
                  <p className="text-xs text-slate-500 mt-2">
                    Vinculado a Trello: al guardar, se sincroniza el título y la descripción con la tarjeta.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-700">
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false)
                  setModalEvent(null)
                }}
                className="bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white font-bold rounded-lg px-4 py-2 transition-all duration-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveModalAndClose}
                disabled={modalSaving}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg px-4 py-2 transition-all duration-300 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {modalSaving ? <IconLoader className="w-4 h-4" /> : <IconCheck className="w-4 h-4" />}
                {modalSaving ? 'Guardando...' : 'Hecho'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

