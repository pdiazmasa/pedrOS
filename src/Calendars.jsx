import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { supabase } from './supabaseClient'

const STORAGE_KEY = 'pedros_calendar_prefs'
const DEFAULT_VIEW = 'dayGridMonth'
const MOBILE_BREAKPOINT = 1024
const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_DURATION_MINUTES = 60
const DEFAULT_CALENDAR_NAMES = ['Personal', 'Universidad', 'TARS', 'Cumpleaños']

const CALENDAR_COLORS = [
  { name: 'Tomate', hex: '#d50000' },
  { name: 'Flamingo', hex: '#e67c73' },
  { name: 'Tangerine', hex: '#f4511e' },
  { name: 'Banana', hex: '#f6bf26' },
  { name: 'Salvia', hex: '#33b679' },
  { name: 'Albahaca', hex: '#0b8043' },
  { name: 'Pavo real', hex: '#039be5' },
  { name: 'Arándano', hex: '#3f51b5' },
  { name: 'Lavanda', hex: '#7986cb' },
  { name: 'Uva', hex: '#8e24aa' },
  { name: 'Grafito', hex: '#616161' },
  { name: 'Azul', hex: '#4285f4' },
]

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'No se repite' },
  { value: 'weekly', label: 'Cada semana' },
  { value: 'monthly', label: 'Cada mes' },
  { value: 'yearly', label: 'Cada año' },
]

const VIEW_LABELS = {
  dayGridMonth: 'Mes',
  timeGridWeek: 'Semana',
  timeGridDay: 'Día',
}

function cx(...classes) {
  return classes.filter(Boolean).join(' ')
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function formatDateInput(date) {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatTimeInput(date) {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function parseDateInput(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function parseTimeInput(value) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null
  const [hours, minutes] = value.split(':').map(Number)
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return { hours, minutes }
}

function combineDateAndTime(dateValue, timeValue) {
  const d = parseDateInput(dateValue)
  const t = parseTimeInput(timeValue)
  if (!d || !t) return null
  d.setHours(t.hours, t.minutes, 0, 0)
  return d
}

function addMinutes(date, minutes) {
  const d = new Date(date)
  d.setMinutes(d.getMinutes() + minutes)
  return d
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date) {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

function startOfMonth(date) {
  const d = new Date(date)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfMonth(date) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + 1, 0)
  d.setHours(23, 59, 59, 999)
  return d
}

function isSameDay(a, b) {
  if (!a || !b) return false
  return formatDateInput(a) === formatDateInput(b)
}

function clampInclusiveEnd(start, end) {
  if (!start || !end) return end || start
  return end < start ? start : end
}

function hexToRgba(hex, alpha) {
  const clean = String(hex || '').replace('#', '')
  const normalized = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const int = Number.parseInt(normalized, 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function formatMonthTitle(date) {
  return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(date)
}

function formatLongDay(date) {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date)
}

function formatHourRange(start, end, allDay) {
  if (allDay) return 'Todo el día'
  const fmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${fmt.format(start)} – ${fmt.format(end)}`
}

function loadPrefs() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return {
      view: parsed?.view || DEFAULT_VIEW,
      selectedCalendarIds: Array.isArray(parsed?.selectedCalendarIds) ? parsed.selectedCalendarIds : null,
      currentDate: parsed?.currentDate || formatDateInput(new Date()),
    }
  } catch {
    return null
  }
}

function savePrefs(prefs) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // noop
  }
}

function inferCalendarName(title = '', description = '') {
  const text = `${title} ${description}`.toLowerCase()
  if (text.includes('cumple') || text.includes('birthday')) return 'Cumpleaños'
  if (text.includes('clase') || text.includes('examen') || text.includes('universidad') || text.includes('upv')) return 'Universidad'
  if (text.includes('tars') || text.includes('robot') || text.includes('reunión tars') || text.includes('reunion tars')) return 'TARS'
  return 'Personal'
}

function normalizeDbEventForCalendar(row, calendarsById) {
  const calendar = calendarsById[row.calendar_id] || row.calendar || null
  const start = row.start_time ? new Date(row.start_time) : null
  const end = row.end_time ? new Date(row.end_time) : null
  const calendarColor = calendar?.color || '#4285f4'
  const color = row.color_override || calendarColor

  if (!start) return null

  let displayStart = new Date(start)
  let displayEnd = end ? new Date(end) : new Date(start)

  if (row.is_all_day) {
    const normalizedStart = startOfDay(displayStart)
    let inclusiveEnd = displayEnd ? startOfDay(displayEnd) : normalizedStart
    if (inclusiveEnd > normalizedStart) {
      inclusiveEnd = addDays(inclusiveEnd, -1)
    }
    inclusiveEnd = clampInclusiveEnd(normalizedStart, inclusiveEnd)
    displayStart = normalizedStart
    displayEnd = addDays(inclusiveEnd, 1)
  } else if (!displayEnd || displayEnd < displayStart) {
    displayEnd = addMinutes(displayStart, DEFAULT_DURATION_MINUTES)
  }

  return {
    id: String(row.id),
    groupId: String(row.id),
    title: row.title || '(Sin título)',
    start: displayStart,
    end: displayEnd,
    allDay: !!row.is_all_day,
    backgroundColor: color,
    borderColor: color,
    textColor: '#ffffff',
    classNames: ['pedros-event-chip'],
    extendedProps: {
      baseId: String(row.id),
      calendar_id: row.calendar_id,
      calendar_name: calendar?.name || '',
      description: row.description || '',
      color_override: row.color_override || '',
      trello_card_id: row.trello_card_id || null,
      recurrence: row.recurrence || 'none',
      recurrence_end: row.recurrence_end || null,
      is_virtual_recurring: false,
      raw: row,
    },
  }
}

function expandRecurringEvent(baseEvent, rangeStart, rangeEnd) {
  const recurrence = baseEvent.extendedProps.recurrence || 'none'
  if (recurrence === 'none') return [baseEvent]

  const start = new Date(baseEvent.start)
  const end = new Date(baseEvent.end)
  const durationMs = Math.max(end.getTime() - start.getTime(), baseEvent.allDay ? DAY_MS : 60 * 1000)
  const recurrenceEnd = baseEvent.extendedProps.recurrence_end ? endOfDay(new Date(baseEvent.extendedProps.recurrence_end)) : null
  const maxDate = recurrenceEnd && recurrenceEnd < rangeEnd ? recurrenceEnd : rangeEnd
  const out = []

  const pushInstance = (instanceStart) => {
    const instanceEnd = new Date(instanceStart.getTime() + durationMs)
    if (instanceEnd < rangeStart || instanceStart > rangeEnd) return
    const key = baseEvent.allDay ? formatDateInput(instanceStart) : instanceStart.toISOString()
    out.push({
      ...baseEvent,
      id: `${baseEvent.id}_${key}`,
      start: new Date(instanceStart),
      end: instanceEnd,
      extendedProps: {
        ...baseEvent.extendedProps,
        is_virtual_recurring: true,
        recurring_instance_start: instanceStart.toISOString(),
      },
    })
  }

  if (recurrence === 'weekly') {
    const cursor = new Date(start)
    while (cursor <= maxDate) {
      if (cursor >= rangeStart) pushInstance(cursor)
      cursor.setDate(cursor.getDate() + 7)
    }
    return out
  }

  if (recurrence === 'monthly') {
    const cursor = new Date(start)
    while (cursor <= maxDate) {
      if (cursor >= rangeStart) pushInstance(cursor)
      const day = start.getDate()
      cursor.setMonth(cursor.getMonth() + 1, 1)
      const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
      cursor.setDate(Math.min(day, lastDay))
      cursor.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds())
    }
    return out
  }

  if (recurrence === 'yearly') {
    const cursor = new Date(start)
    while (cursor <= maxDate) {
      if (cursor >= rangeStart) pushInstance(cursor)
      const day = start.getDate()
      const month = start.getMonth()
      cursor.setFullYear(cursor.getFullYear() + 1, month, 1)
      const lastDay = new Date(cursor.getFullYear(), month + 1, 0).getDate()
      cursor.setDate(Math.min(day, lastDay))
      cursor.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds())
    }
    return out
  }

  return [baseEvent]
}

function buildMiniCalendarGrid(date) {
  const first = startOfMonth(date)
  const startWeekDay = (first.getDay() + 6) % 7
  const gridStart = addDays(first, -startWeekDay)
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
}

function ModalField({ icon, children, className = '' }) {
  return (
    <div className={cx('grid grid-cols-[20px_1fr] gap-3 items-start', className)}>
      <div className="text-slate-500 mt-2">{icon}</div>
      <div>{children}</div>
    </div>
  )
}

function IconCalendar() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 2v4M16 2v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
    </svg>
  )
}

function IconClock() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v5l3 3" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}

function IconText() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7V5h16v2M12 5v14M8 19h8" />
    </svg>
  )
}

function IconPalette() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 22a10 10 0 1 1 10-10 3 3 0 0 1-3 3h-1a2 2 0 0 0-2 2 2 2 0 0 1-2 2Z" />
      <circle cx="7.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function IconRepeat() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 2l4 4-4 4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 11V9a3 3 0 0 1 3-3h15" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 22l-4-4 4-4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 13v2a3 3 0 0 1-3 3H3" />
    </svg>
  )
}

function IconDelete() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
    </svg>
  )
}

function IconChevronLeft() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" />
    </svg>
  )
}

function IconChevronRight() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
    </svg>
  )
}

function EventModal({
  open,
  eventData,
  calendars,
  onClose,
  onSave,
  onDelete,
}) {
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [dateError, setDateError] = useState('')
  const [endTimeTouched, setEndTimeTouched] = useState(false)

  useEffect(() => {
    if (!open || !eventData) return

    const calendar = calendars.find((item) => String(item.id) === String(eventData.calendar_id)) || calendars[0] || null
    const start = eventData.start ? new Date(eventData.start) : new Date()
    const end = eventData.end ? new Date(eventData.end) : addMinutes(start, DEFAULT_DURATION_MINUTES)
    const isBirthday = (calendar?.name || '').trim().toLowerCase() === 'cumpleaños'

    setForm({
      id: eventData.id || null,
      kind: eventData.kind || 'event',
      title: eventData.title || '',
      description: eventData.description || '',
      is_all_day: !!eventData.is_all_day,
      calendar_id: calendar?.id || null,
      color_override: eventData.color_override || '',
      recurrence: isBirthday ? 'yearly' : eventData.recurrence || 'none',
      recurrence_end: eventData.recurrence_end || '',
      startDate: formatDateInput(start),
      endDate: formatDateInput(endDataFromEvent(eventData, start, end)),
      startTime: formatTimeInput(start),
      endTime: formatTimeInput(end),
      durationMinutes: Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000) || DEFAULT_DURATION_MINUTES),
      trello_card_id: eventData.trello_card_id || null,
    })
    setSaving(false)
    setDateError('')
    setEndTimeTouched(false)
  }, [open, eventData, calendars])

  function endDataFromEvent(data, start, end) {
    if (data?.is_all_day) {
      const inclusiveEnd = end > start ? addDays(end, -1) : end
      return clampInclusiveEnd(startOfDay(start), startOfDay(inclusiveEnd))
    }
    return end
  }

  if (!open || !form) return null

  const selectedCalendar = calendars.find((item) => String(item.id) === String(form.calendar_id)) || null
  const isBirthdayCalendar = (selectedCalendar?.name || '').trim().toLowerCase() === 'cumpleaños'
  const effectiveRecurrence = isBirthdayCalendar ? 'yearly' : form.recurrence

  function updateForm(patch) {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  function handleStartDateChange(value) {
    updateForm({ startDate: value })
  }

  function handleEndDateChange(value) {
    updateForm({ endDate: value })
  }

  function handleDateBlur() {
    const startDate = parseDateInput(form.startDate)
    const endDate = parseDateInput(form.endDate)
    if (!startDate || !endDate) return
    if (endDate < startDate) {
      updateForm({ endDate: form.startDate })
      setDateError('La fecha de fin no puede ser anterior a la de inicio.')
      return
    }
    setDateError('')
  }

  function handleStartTimeChange(value) {
    updateForm({ startTime: value })
    if (!endTimeTouched) {
      const start = combineDateAndTime(form.startDate, value)
      if (start) {
        const nextEnd = addMinutes(start, form.durationMinutes || DEFAULT_DURATION_MINUTES)
        updateForm({ endTime: formatTimeInput(nextEnd) })
      }
    } else {
      const start = combineDateAndTime(form.startDate, value)
      const end = combineDateAndTime(form.endDate, form.endTime)
      if (start && end) {
        updateForm({ durationMinutes: Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000) || 1) })
      }
    }
  }

  function handleEndTimeChange(value) {
    setEndTimeTouched(true)
    updateForm({ endTime: value })
    const start = combineDateAndTime(form.startDate, form.startTime)
    const end = combineDateAndTime(form.endDate, value)
    if (start && end) {
      updateForm({ durationMinutes: Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000) || 1) })
    }
  }

  async function handleSave() {
    const startDate = parseDateInput(form.startDate)
    const endDate = parseDateInput(form.endDate)
    if (!form.calendar_id || !startDate || !endDate) return
    if (endDate < startDate) {
      setDateError('La fecha de fin no puede ser anterior a la de inicio.')
      return
    }

    let start
    let end

    if (form.is_all_day) {
      start = startOfDay(startDate)
      end = startOfDay(clampInclusiveEnd(startDate, endDate))
    } else {
      start = combineDateAndTime(form.startDate, form.startTime)
      end = combineDateAndTime(form.endDate, form.endTime)
      if (!start || !end) return
      if (end < start) {
        setDateError('La hora de fin no puede ser anterior a la de inicio.')
        return
      }
    }

    setSaving(true)
    try {
      await onSave({
        ...form,
        recurrence: effectiveRecurrence,
        start,
        end,
      })
      setSaving(false)
    } catch {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm p-0 sm:p-4 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-3xl max-h-[100dvh] sm:max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-800 sticky top-0 bg-slate-900/95 backdrop-blur">
          <div className="flex items-center gap-2">
            {form.id && (
              <button
                type="button"
                onClick={() => onDelete(form.id)}
                className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/10"
              >
                <IconDelete />
                Eliminar
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800">Cancelar</button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="rounded-full bg-blue-600 hover:bg-blue-500 px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>

        <div className="px-5 sm:px-6 py-5 space-y-5">
          <ModalField icon={<IconText />}>
            <input
              type="text"
              value={form.title}
              onChange={(e) => updateForm({ title: e.target.value })}
              placeholder="Añadir título"
              className="w-full bg-transparent border-0 border-b border-slate-800 pb-3 text-2xl sm:text-3xl font-medium text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              autoFocus
            />
          </ModalField>

          <ModalField icon={<IconCalendar />}>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {[
                  { value: 'event', label: 'Evento' },
                  { value: 'reminder', label: 'Recordatorio' },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => updateForm({ kind: item.value })}
                    className={cx(
                      'rounded-full px-3 py-1.5 text-sm font-semibold border transition-colors',
                      form.kind === item.value
                        ? 'border-blue-500 bg-blue-500/15 text-blue-300'
                        : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600'
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-3 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={form.is_all_day}
                  onChange={(e) => updateForm({ is_all_day: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-500"
                />
                Todo el día
              </label>

              <div className={cx('grid gap-3', form.is_all_day ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4')}>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  onBlur={handleDateBlur}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
                {!form.is_all_day && (
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => handleStartTimeChange(e.target.value)}
                    className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                )}
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                  onBlur={handleDateBlur}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
                {!form.is_all_day && (
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => handleEndTimeChange(e.target.value)}
                    className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                )}
              </div>

              {dateError && <p className="text-sm text-red-400">{dateError}</p>}
            </div>
          </ModalField>

          <ModalField icon={<IconText />}>
            <textarea
              value={form.description}
              onChange={(e) => updateForm({ description: e.target.value })}
              rows={4}
              placeholder="Añadir descripción"
              className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 resize-none"
            />
          </ModalField>

          <ModalField icon={<IconPalette />}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Calendario</label>
                <div className="relative">
                  <select
                    value={form.calendar_id || ''}
                    onChange={(e) => {
                      const nextId = e.target.value || null
                      const nextCal = calendars.find((item) => String(item.id) === String(nextId)) || null
                      updateForm({
                        calendar_id: nextId,
                        recurrence: (nextCal?.name || '').trim().toLowerCase() === 'cumpleaños' ? 'yearly' : form.recurrence,
                      })
                    }}
                    className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                  >
                    {calendars.map((calendar) => (
                      <option key={calendar.id} value={calendar.id}>{calendar.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Color del evento</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => updateForm({ color_override: '' })}
                    className={cx(
                      'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                      !form.color_override ? 'border-blue-500 bg-blue-500/10 text-blue-300' : 'border-slate-700 bg-slate-800 text-slate-300'
                    )}
                  >
                    Color del calendario
                  </button>
                  {CALENDAR_COLORS.map((color) => (
                    <button
                      key={color.hex}
                      type="button"
                      onClick={() => updateForm({ color_override: color.hex })}
                      title={color.name}
                      className={cx(
                        'h-8 w-8 rounded-full border-2 transition-transform hover:scale-110',
                        form.color_override === color.hex ? 'border-white scale-110' : 'border-slate-700'
                      )}
                      style={{ backgroundColor: color.hex }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </ModalField>

          <ModalField icon={<IconRepeat />}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Recurrencia</label>
                <select
                  value={effectiveRecurrence}
                  disabled={isBirthdayCalendar}
                  onChange={(e) => updateForm({ recurrence: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-white focus:outline-none focus:border-blue-500 disabled:opacity-60"
                >
                  {RECURRENCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Fin de repetición</label>
                <input
                  type="date"
                  value={form.recurrence_end || ''}
                  onChange={(e) => updateForm({ recurrence_end: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            {isBirthdayCalendar && <p className="mt-2 text-sm text-slate-400">Los eventos del calendario Cumpleaños se guardan siempre como anuales y de todo el día.</p>}
          </ModalField>
        </div>
      </div>
    </div>
  )
}

export default function Calendars() {
  const navigate = useNavigate()
  const calendarRef = useRef(null)
  const touchStartXRef = useRef(null)
  const didInitVisibleRef = useRef(false)
  const prefsRef = useRef(loadPrefs())

  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [calendars, setCalendars] = useState([])
  const [eventsRaw, setEventsRaw] = useState([])
  const [showTrash, setShowTrash] = useState(false)
  const [currentView, setCurrentView] = useState(prefsRef.current?.view || DEFAULT_VIEW)
  const [currentDate, setCurrentDate] = useState(() => parseDateInput(prefsRef.current?.currentDate || formatDateInput(new Date())) || new Date())
  const [visibleCalendarIds, setVisibleCalendarIds] = useState(new Set())
  const [sidebarMiniDate, setSidebarMiniDate] = useState(() => parseDateInput(prefsRef.current?.currentDate || formatDateInput(new Date())) || new Date())
  const [selectedMobileDate, setSelectedMobileDate] = useState(() => parseDateInput(prefsRef.current?.currentDate || formatDateInput(new Date())) || new Date())
  const [visibleRange, setVisibleRange] = useState(() => ({
    start: addMonths(startOfMonth(new Date()), -1),
    end: addMonths(endOfMonth(new Date()), 1),
  }))
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT)
  const [miniOpenMobile, setMiniOpenMobile] = useState(false)
  const [createCalendarName, setCreateCalendarName] = useState('')
  const [createCalendarColor, setCreateCalendarColor] = useState(CALENDAR_COLORS[11].hex)
  const [calendarSaving, setCalendarSaving] = useState(false)
  const [deletingCalendarId, setDeletingCalendarId] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalEvent, setModalEvent] = useState(null)
  const [syncChannel, setSyncChannel] = useState(null)

  function addMonths(date, months) {
    const d = new Date(date)
    d.setMonth(d.getMonth() + months)
    return d
  }

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: authUser } }) => setUser(authUser ?? null))
  }, [])

  useEffect(() => {
    const channel = supabase.channel('pedros-sync')
    channel.subscribe()
    setSyncChannel(channel)
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const fetchAll = useCallback(async (authUser) => {
    if (!authUser) return
    setLoading(true)
    try {
      const { data: calendarsData, error: calendarsError } = await supabase
        .from('calendars')
        .select('*')
        .eq('user_id', authUser.id)
        .order('created_at', { ascending: true })

      if (calendarsError) throw calendarsError

      const calendarsSafe = calendarsData || []
      setCalendars(calendarsSafe)

      const prefIds = prefsRef.current?.selectedCalendarIds
      const idsToUse = prefIds?.length
        ? calendarsSafe.filter((item) => prefIds.includes(item.id)).map((item) => item.id)
        : calendarsSafe.map((item) => item.id)

      setVisibleCalendarIds(new Set(idsToUse))
      didInitVisibleRef.current = true

      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select(
          'id,user_id,calendar_id,trello_card_id,title,description,start_time,end_time,color_override,is_all_day,is_trashed,recurrence,recurrence_end,created_at,' +
            'calendar:calendars(id,name,color),' +
            'trello:trellos_cards(id,is_completed,is_trashed,title,description)'
        )
        .eq('user_id', authUser.id)
        .order('start_time', { ascending: true })

      if (eventsError) throw eventsError
      setEventsRaw(eventsData || [])
    } catch (error) {
      console.error('Calendars fetchAll:', error)
      setCalendars([])
      setEventsRaw([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    fetchAll(user)
  }, [user, fetchAll])

  useEffect(() => {
    const calendarPayload = calendars.map((calendar) => ({
      id: calendar.id,
      name: calendar.name,
      color: calendar.color,
      is_default: calendar.is_default,
    }))
    window.__PEDROS_CALENDARS__ = calendarPayload
    window.__PEDROS_CALENDAR_HELPERS__ = {
      inferCalendarName,
      defaultCalendarNames: DEFAULT_CALENDAR_NAMES,
    }
    window.dispatchEvent(new CustomEvent('pedros:calendars-updated', { detail: calendarPayload }))
  }, [calendars])

  useEffect(() => {
    if (!didInitVisibleRef.current) return
    const prefs = {
      view: currentView,
      selectedCalendarIds: [...visibleCalendarIds],
      currentDate: formatDateInput(currentDate),
    }
    savePrefs(prefs)
  }, [currentView, visibleCalendarIds, currentDate])

  const calendarsById = useMemo(
    () => Object.fromEntries(calendars.map((item) => [item.id, item])),
    [calendars]
  )

  const visibleBaseEvents = useMemo(() => {
    return (eventsRaw || [])
      .filter((row) => !row.is_trashed)
      .filter((row) => visibleCalendarIds.has(row.calendar_id))
      .filter((row) => {
        if (!row.trello_card_id) return true
        const trello = row.trello
        if (!trello) return true
        return trello.is_completed !== true && trello.is_trashed !== true
      })
      .map((row) => normalizeDbEventForCalendar(row, calendarsById))
      .filter(Boolean)
  }, [eventsRaw, visibleCalendarIds, calendarsById])

  const expandedEvents = useMemo(() => {
    return visibleBaseEvents.flatMap((event) => expandRecurringEvent(event, visibleRange.start, visibleRange.end))
  }, [visibleBaseEvents, visibleRange])

  const trashedEvents = useMemo(() => {
    return (eventsRaw || []).filter((row) => row.is_trashed)
  }, [eventsRaw])

  const mobileDayEvents = useMemo(() => {
    const dayStart = startOfDay(selectedMobileDate)
    const dayEnd = endOfDay(selectedMobileDate)
    return expandedEvents
      .filter((event) => {
        const start = new Date(event.start)
        const end = new Date(event.end)
        return start <= dayEnd && end > dayStart
      })
      .sort((a, b) => new Date(a.start) - new Date(b.start))
  }, [expandedEvents, selectedMobileDate])

  function openNewEvent({ start, end, allDay, kind = 'event' }) {
    const defaultCalendar = calendars[0] || null
    const safeStart = new Date(start || new Date())
    const safeEnd = new Date(end || (allDay ? safeStart : addMinutes(safeStart, DEFAULT_DURATION_MINUTES)))
    const calendarName = (defaultCalendar?.name || '').trim().toLowerCase()
    const isBirthday = calendarName === 'cumpleaños'

    setModalEvent({
      id: null,
      kind,
      title: '',
      description: '',
      start: safeStart,
      end: allDay ? startOfDay(safeEnd) : safeEnd,
      is_all_day: isBirthday ? true : !!allDay,
      calendar_id: defaultCalendar?.id || null,
      color_override: '',
      trello_card_id: null,
      recurrence: isBirthday ? 'yearly' : 'none',
      recurrence_end: '',
    })
    setModalOpen(true)
  }

  function openEditEvent(event) {
    const props = event.extendedProps || {}
    const baseId = props.baseId || event.id
    const raw = (eventsRaw || []).find((row) => String(row.id) === String(baseId))
    if (!raw) return

    const normalized = normalizeDbEventForCalendar(raw, calendarsById)
    if (!normalized) return

    setModalEvent({
      id: raw.id,
      kind: 'event',
      title: raw.title || '',
      description: raw.description || '',
      start: new Date(normalized.start),
      end: raw.is_all_day ? addDays(new Date(normalized.end), -1) : new Date(normalized.end),
      is_all_day: !!raw.is_all_day,
      calendar_id: raw.calendar_id,
      color_override: raw.color_override || '',
      trello_card_id: raw.trello_card_id || null,
      recurrence: raw.recurrence || 'none',
      recurrence_end: raw.recurrence_end || '',
    })
    setModalOpen(true)
  }

  async function broadcastTrelloChange(data) {
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
  }

  async function handleSaveEvent(form) {
    if (!user) return

    const selectedCalendar = calendarsById[form.calendar_id] || null
    const isBirthday = (selectedCalendar?.name || '').trim().toLowerCase() === 'cumpleaños'

    let start = new Date(form.start)
    let end = new Date(form.end)
    const recurrence = isBirthday ? 'yearly' : form.recurrence || 'none'
    const isAllDay = isBirthday ? true : !!form.is_all_day

    if (isAllDay) {
      start = startOfDay(start)
      end = startOfDay(clampInclusiveEnd(start, end))
    } else if (end < start) {
      end = addMinutes(start, DEFAULT_DURATION_MINUTES)
    }

    const payload = {
      user_id: user.id,
      calendar_id: form.calendar_id,
      trello_card_id: form.trello_card_id || null,
      title: (form.title || '').trim() || 'Evento',
      description: form.description || '',
      start_time: start.toISOString(),
      end_time: (isAllDay ? end : end).toISOString(),
      color_override: form.color_override || null,
      is_all_day: isAllDay,
      is_trashed: false,
      recurrence,
      recurrence_end: form.recurrence_end || null,
    }

    if (!form.id) {
      const { data, error } = await supabase
        .from('events')
        .insert(payload)
        .select(
          'id,user_id,calendar_id,trello_card_id,title,description,start_time,end_time,color_override,is_all_day,is_trashed,recurrence,recurrence_end,created_at,' +
            'calendar:calendars(id,name,color),' +
            'trello:trellos_cards(id,is_completed,is_trashed,title,description)'
        )
        .single()

      if (error) {
        console.error('Calendars create event:', error)
        throw error
      }

      setEventsRaw((prev) => [...prev, data])
      await broadcastTrelloChange(data)
    } else {
      const { data, error } = await supabase
        .from('events')
        .update(payload)
        .eq('id', form.id)
        .select(
          'id,user_id,calendar_id,trello_card_id,title,description,start_time,end_time,color_override,is_all_day,is_trashed,recurrence,recurrence_end,created_at,' +
            'calendar:calendars(id,name,color),' +
            'trello:trellos_cards(id,is_completed,is_trashed,title,description)'
        )
        .single()

      if (error) {
        console.error('Calendars update event:', error)
        throw error
      }

      setEventsRaw((prev) => prev.map((row) => (String(row.id) === String(data.id) ? data : row)))
      await broadcastTrelloChange(data)

      if (data.trello_card_id) {
        await supabase
          .from('trellos_cards')
          .update({
            title: data.title,
            description: data.description || '',
          })
          .eq('id', data.trello_card_id)
      }
    }

    setModalOpen(false)
    setModalEvent(null)
  }

  async function persistEventTimes(event) {
    if (!event || event.extendedProps?.is_virtual_recurring) return
    const raw = (eventsRaw || []).find((row) => String(row.id) === String(event.extendedProps?.baseId || event.id))
    if (!raw) return

    let start = event.start ? new Date(event.start) : raw.start_time ? new Date(raw.start_time) : new Date()
    let end = event.end ? new Date(event.end) : raw.end_time ? new Date(raw.end_time) : addMinutes(start, DEFAULT_DURATION_MINUTES)

    if (event.allDay) {
      const inclusiveEnd = end ? addDays(startOfDay(end), -1) : startOfDay(start)
      start = startOfDay(start)
      end = clampInclusiveEnd(start, inclusiveEnd)
    }

    const { data, error } = await supabase
      .from('events')
      .update({
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        is_all_day: !!event.allDay,
      })
      .eq('id', raw.id)
      .select('id,trello_card_id,calendar_id,start_time,end_time,is_all_day,is_trashed')
      .single()

    if (error) throw error

    setEventsRaw((prev) => prev.map((row) => (String(row.id) === String(data.id) ? { ...row, ...data } : row)))
    await broadcastTrelloChange(data)
  }

  async function trashEvent(eventId) {
    if (!eventId) return
    const { data, error } = await supabase
      .from('events')
      .update({ is_trashed: true })
      .eq('id', eventId)
      .select('id,trello_card_id,calendar_id,start_time,end_time,is_all_day,is_trashed')
      .single()

    if (error) {
      console.error('Calendars trash event:', error)
      return
    }

    setEventsRaw((prev) => prev.map((row) => (String(row.id) === String(eventId) ? { ...row, is_trashed: true } : row)))
    setModalOpen(false)
    setModalEvent(null)
    await broadcastTrelloChange(data)
  }

  async function restoreEvent(eventId) {
    const { data, error } = await supabase
      .from('events')
      .update({ is_trashed: false })
      .eq('id', eventId)
      .select('id,trello_card_id,calendar_id,start_time,end_time,is_all_day,is_trashed')
      .single()

    if (error) {
      console.error('Calendars restore event:', error)
      return
    }

    setEventsRaw((prev) => prev.map((row) => (String(row.id) === String(eventId) ? { ...row, is_trashed: false } : row)))
    await broadcastTrelloChange(data)
  }

  async function destroyEvent(eventId) {
    if (!window.confirm('¿Eliminar evento permanentemente?')) return
    const row = eventsRaw.find((item) => String(item.id) === String(eventId))
    const { error } = await supabase.from('events').delete().eq('id', eventId)
    if (error) {
      console.error('Calendars destroy event:', error)
      return
    }
    setEventsRaw((prev) => prev.filter((item) => String(item.id) !== String(eventId)))
    if (row?.trello_card_id && syncChannel) {
      await syncChannel.send({
        type: 'broadcast',
        event: 'trello_event_changed',
        payload: {
          id: row.id,
          trello_card_id: row.trello_card_id,
          calendar_id: row.calendar_id,
          start_time: row.start_time,
          end_time: row.end_time,
          is_all_day: row.is_all_day,
          is_trashed: true,
        },
      })
    }
  }

  async function createCalendar(e) {
    e.preventDefault()
    if (!user || !createCalendarName.trim()) return
    setCalendarSaving(true)
    try {
      const { data, error } = await supabase
        .from('calendars')
        .insert({
          user_id: user.id,
          name: createCalendarName.trim(),
          color: createCalendarColor,
        })
        .select('*')
        .single()

      if (error) throw error

      setCalendars((prev) => [...prev, data])
      setVisibleCalendarIds((prev) => new Set([...prev, data.id]))
      setCreateCalendarName('')
      setCreateCalendarColor(CALENDAR_COLORS[11].hex)
    } catch (error) {
      console.error('Calendars create calendar:', error)
    } finally {
      setCalendarSaving(false)
    }
  }

  async function deleteCalendar(calendarId) {
    if (!calendarId) return
    if (!window.confirm('¿Eliminar este calendario? Se eliminarán también sus eventos.')) return
    setDeletingCalendarId(calendarId)
    try {
      const { error } = await supabase.from('calendars').delete().eq('id', calendarId)
      if (error) throw error
      setCalendars((prev) => prev.filter((item) => item.id !== calendarId))
      setEventsRaw((prev) => prev.filter((item) => item.calendar_id !== calendarId))
      setVisibleCalendarIds((prev) => {
        const next = new Set(prev)
        next.delete(calendarId)
        return next
      })
    } catch (error) {
      console.error('Calendars delete calendar:', error)
    } finally {
      setDeletingCalendarId(null)
    }
  }

  function goToday() {
    const api = calendarRef.current?.getApi()
    api?.today()
    setCurrentDate(api?.getDate?.() || new Date())
    setSidebarMiniDate(api?.getDate?.() || new Date())
    setSelectedMobileDate(api?.getDate?.() || new Date())
  }

  function navigateCalendar(direction) {
    const api = calendarRef.current?.getApi()
    if (!api) return
    if (direction === 'prev') api.prev()
    if (direction === 'next') api.next()
    const nextDate = api.getDate()
    setCurrentDate(nextDate)
    setSidebarMiniDate(nextDate)
    setSelectedMobileDate(nextDate)
  }

  function changeView(view) {
    const api = calendarRef.current?.getApi()
    if (!api) return
    api.changeView(view)
    setCurrentView(view)
  }

  function jumpToDate(date) {
    const api = calendarRef.current?.getApi()
    if (!api) return
    api.gotoDate(date)
    setCurrentDate(date)
    setSidebarMiniDate(date)
    setSelectedMobileDate(date)
  }

  function handleTouchStart(e) {
    touchStartXRef.current = e.changedTouches?.[0]?.clientX || null
  }

  function handleTouchEnd(e) {
    if (touchStartXRef.current == null) return
    const endX = e.changedTouches?.[0]?.clientX || 0
    const delta = endX - touchStartXRef.current
    touchStartXRef.current = null
    if (Math.abs(delta) < 60) return
    if (delta < 0) navigateCalendar('next')
    if (delta > 0) navigateCalendar('prev')
  }

  const miniGrid = useMemo(() => buildMiniCalendarGrid(sidebarMiniDate), [sidebarMiniDate])

  if (!user || loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="flex items-center gap-3 text-slate-300">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-blue-500" />
          Cargando calendario...
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans">
      <style>{`
        .pedros-calendar .fc { --fc-border-color: #334155; --fc-page-bg-color: transparent; --fc-neutral-bg-color: transparent; --fc-list-event-hover-bg-color: #1e293b; --fc-today-bg-color: rgba(66, 133, 244, 0.18); --fc-now-indicator-color: #ef4444; color: #e2e8f0; }
        .pedros-calendar .fc-toolbar { display: none; }
        .pedros-calendar .fc-scrollgrid, .pedros-calendar .fc-theme-standard td, .pedros-calendar .fc-theme-standard th { border-color: #334155; }
        .pedros-calendar .fc-col-header-cell { background: #0f172a; color: #cbd5e1; font-weight: 600; text-transform: capitalize; }
        .pedros-calendar .fc-daygrid-day { background: #0f172a; }
        .pedros-calendar .fc-day-other { background: #111827; }
        .pedros-calendar .fc-daygrid-day-number { color: #cbd5e1; font-size: 0.875rem; padding: 8px; }
        .pedros-calendar .fc-day-today .fc-daygrid-day-number, .pedros-calendar .fc-timegrid-col.fc-day-today .fc-col-header-cell-cushion { background: #4285f4; color: #fff; border-radius: 9999px; min-width: 28px; min-height: 28px; display: inline-flex; align-items: center; justify-content: center; }
        .pedros-calendar .fc-timegrid-slot-label-cushion, .pedros-calendar .fc-timegrid-axis-cushion { color: #94a3b8; font-size: 0.75rem; }
        .pedros-calendar .fc-timegrid-now-indicator-line { border-color: #ef4444; }
        .pedros-calendar .fc-timegrid-now-indicator-arrow { border-color: #ef4444; color: #ef4444; }
        .pedros-calendar .fc-event { border: 0; border-radius: 10px; padding: 1px 2px; box-shadow: none; }
        .pedros-calendar .pedros-event-chip { overflow: hidden; }
        .pedros-calendar .fc-daygrid-event-harness { margin-top: 1px; }
        .pedros-calendar .fc-event-main { padding: 2px 6px; font-size: 0.75rem; font-weight: 600; }
        .pedros-calendar .fc-timegrid-event .fc-event-main { padding: 6px 8px; }
        .pedros-calendar .fc-daygrid-more-link { color: #93c5fd; }
        .pedros-calendar .fc-highlight { background: rgba(66, 133, 244, 0.18); }
        .pedros-calendar .fc-timegrid-col, .pedros-calendar .fc-timegrid-slot { background: #0f172a; }
        .pedros-calendar .fc-list { border-color: #334155; }
      `}</style>

      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/95 backdrop-blur safe-top">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="rounded-full px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              ← pedrOS
            </button>
            <div className="hidden sm:flex items-center gap-2">
              <button type="button" onClick={() => navigateCalendar('prev')} className="rounded-full p-2 text-slate-300 hover:bg-slate-800 hover:text-white"><IconChevronLeft /></button>
              <button type="button" onClick={() => navigateCalendar('next')} className="rounded-full p-2 text-slate-300 hover:bg-slate-800 hover:text-white"><IconChevronRight /></button>
              <button type="button" onClick={goToday} className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-slate-600">Hoy</button>
            </div>
            <h1 className="truncate text-xl sm:text-2xl font-semibold capitalize text-white">{formatMonthTitle(currentDate)}</h1>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-full border border-slate-700 bg-slate-800 p-1">
              {Object.entries(VIEW_LABELS).map(([view, label]) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => changeView(view)}
                  className={cx(
                    'rounded-full px-3 py-1.5 text-sm font-semibold transition-colors',
                    currentView === view ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowTrash((prev) => !prev)}
              className={cx(
                'rounded-full px-4 py-2 text-sm font-semibold border',
                showTrash ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'border-slate-700 bg-slate-800 text-slate-300'
              )}
            >
              Papelera
            </button>
          </div>
        </div>

        <div className="sm:hidden flex items-center gap-2 px-4 pb-3">
          <button type="button" onClick={() => navigateCalendar('prev')} className="rounded-full p-2 text-slate-300 hover:bg-slate-800 hover:text-white"><IconChevronLeft /></button>
          <button type="button" onClick={goToday} className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200">Hoy</button>
          <button type="button" onClick={() => navigateCalendar('next')} className="rounded-full p-2 text-slate-300 hover:bg-slate-800 hover:text-white"><IconChevronRight /></button>
        </div>
      </header>

      <main className={cx('grid gap-4 px-3 py-4 sm:px-6 sm:py-6', isMobile ? 'grid-cols-1' : 'grid-cols-[250px_minmax(0,1fr)]')}>
        {!showTrash && (
          <aside className="rounded-3xl border border-slate-800 bg-slate-900">
            <div className="p-4 border-b border-slate-800">
              <button
                type="button"
                onClick={() => openNewEvent({ start: new Date(), end: addMinutes(new Date(), DEFAULT_DURATION_MINUTES), allDay: false })}
                className="inline-flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-800 px-5 py-3 text-sm font-semibold text-white shadow-lg hover:border-slate-600"
              >
                <span className="text-lg leading-none">＋</span>
                Crear
              </button>
            </div>

            <div className="p-4 border-b border-slate-800">
              <div className="flex items-center justify-between mb-3 lg:hidden">
                <h2 className="text-sm font-semibold text-slate-200">Mini calendario</h2>
                <button type="button" onClick={() => setMiniOpenMobile((prev) => !prev)} className="text-sm text-blue-300">
                  {miniOpenMobile ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>

              <div className={cx(isMobile && !miniOpenMobile && 'hidden')}>
                <div className="mb-3 flex items-center justify-between text-sm text-slate-300">
                  <button type="button" onClick={() => setSidebarMiniDate(addMonths(sidebarMiniDate, -1))} className="rounded-full p-1 hover:bg-slate-800"><IconChevronLeft /></button>
                  <span className="font-medium capitalize">{formatMonthTitle(sidebarMiniDate)}</span>
                  <button type="button" onClick={() => setSidebarMiniDate(addMonths(sidebarMiniDate, 1))} className="rounded-full p-1 hover:bg-slate-800"><IconChevronRight /></button>
                </div>

                <div className="grid grid-cols-7 gap-y-1 text-center text-[11px] text-slate-500 mb-1">
                  {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((label) => <div key={label}>{label}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
                  {miniGrid.map((day) => {
                    const isCurrentMonth = day.getMonth() === sidebarMiniDate.getMonth()
                    const isToday = isSameDay(day, new Date())
                    const isSelected = isSameDay(day, selectedMobileDate)
                    return (
                      <button
                        key={day.toISOString()}
                        type="button"
                        onClick={() => {
                          setSelectedMobileDate(day)
                          jumpToDate(day)
                        }}
                        className={cx(
                          'mx-auto flex h-8 w-8 items-center justify-center rounded-full transition-colors',
                          isToday && 'bg-blue-600 text-white',
                          isSelected && !isToday && 'bg-slate-700 text-white',
                          !isSelected && !isToday && isCurrentMonth ? 'text-slate-200 hover:bg-slate-800' : '',
                          !isCurrentMonth && 'text-slate-600 hover:bg-slate-800'
                        )}
                      >
                        {day.getDate()}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="p-4 border-b border-slate-800">
              <h2 className="mb-3 text-sm font-semibold text-slate-200">Mis calendarios</h2>
              <div className="space-y-1.5">
                {calendars.map((calendar) => {
                  const checked = visibleCalendarIds.has(calendar.id)
                  return (
                    <label key={calendar.id} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setVisibleCalendarIds((prev) => {
                            const next = new Set(prev)
                            if (next.has(calendar.id)) next.delete(calendar.id)
                            else next.add(calendar.id)
                            return next
                          })
                        }}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-500"
                      />
                      <span className="h-3 w-3 rounded-full border border-slate-700" style={{ backgroundColor: calendar.color || '#4285f4' }} />
                      <span className="flex-1 truncate text-sm text-slate-200">{calendar.name}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          deleteCalendar(calendar.id)
                        }}
                        disabled={deletingCalendarId === calendar.id}
                        className="opacity-0 transition-opacity text-xs text-red-300 hover:text-red-200 group-hover:opacity-100"
                      >
                        {deletingCalendarId === calendar.id ? '...' : '✕'}
                      </button>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="p-4">
              <form onSubmit={createCalendar} className="space-y-3">
                <input
                  type="text"
                  value={createCalendarName}
                  onChange={(e) => setCreateCalendarName(e.target.value)}
                  placeholder="Nuevo calendario"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
                <div className="flex flex-wrap gap-2">
                  {CALENDAR_COLORS.map((color) => (
                    <button
                      key={color.hex}
                      type="button"
                      title={color.name}
                      onClick={() => setCreateCalendarColor(color.hex)}
                      className={cx(
                        'h-6 w-6 rounded-full border-2',
                        createCalendarColor === color.hex ? 'border-white' : 'border-slate-700'
                      )}
                      style={{ backgroundColor: color.hex }}
                    />
                  ))}
                </div>
                <button
                  type="submit"
                  disabled={calendarSaving || !createCalendarName.trim()}
                  className="w-full rounded-xl bg-slate-800 border border-slate-700 px-4 py-2 text-sm font-semibold text-white hover:border-slate-600 disabled:opacity-50"
                >
                  {calendarSaving ? 'Creando...' : 'Crear calendario'}
                </button>
              </form>
            </div>

            {isMobile && !showTrash && (
              <div className="border-t border-slate-800 p-4">
                <h3 className="mb-2 text-sm font-semibold text-slate-200 capitalize">{formatLongDay(selectedMobileDate)}</h3>
                <div className="space-y-2">
                  {mobileDayEvents.length === 0 ? (
                    <p className="text-sm text-slate-500">No hay eventos este día.</p>
                  ) : (
                    mobileDayEvents.map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => openEditEvent(event)}
                        className="w-full rounded-2xl border border-slate-800 bg-slate-800/70 px-3 py-3 text-left"
                      >
                        <div className="flex items-start gap-3">
                          <span className="mt-1 h-3 w-3 rounded-full" style={{ backgroundColor: event.backgroundColor }} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-white">{event.title}</p>
                            <p className="text-sm text-slate-400">{formatHourRange(new Date(event.start), new Date(event.end), event.allDay)}</p>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </aside>
        )}

        <section className="rounded-3xl border border-slate-800 bg-slate-900 min-h-[70vh] overflow-hidden">
          {showTrash ? (
            <div className="p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Papelera</h2>
                <p className="text-sm text-slate-500">{trashedEvents.length} eventos</p>
              </div>
              <div className="space-y-3">
                {trashedEvents.length === 0 ? (
                  <p className="rounded-2xl border border-slate-800 bg-slate-800/50 px-4 py-6 text-sm text-slate-500">No hay eventos en la papelera.</p>
                ) : (
                  trashedEvents.map((row) => {
                    const calendar = calendarsById[row.calendar_id]
                    const start = row.start_time ? new Date(row.start_time) : new Date()
                    const end = row.end_time ? new Date(row.end_time) : start
                    const color = row.color_override || calendar?.color || '#4285f4'
                    return (
                      <div key={row.id} className="rounded-2xl border border-slate-800 bg-slate-800/60 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex items-start gap-3">
                            <span className="mt-1 h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-white">{row.title || '(Sin título)'}</p>
                              <p className="text-sm text-slate-400">{row.is_all_day ? formatDateInput(start) : `${formatDateInput(start)} ${formatTimeInput(start)} → ${formatDateInput(end)} ${formatTimeInput(end)}`}</p>
                              <p className="mt-1 text-xs text-slate-500">{calendar?.name || 'Sin calendario'}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => restoreEvent(row.id)} className="rounded-full bg-slate-700 px-3 py-1.5 text-sm font-semibold text-slate-200 hover:bg-slate-600">Restaurar</button>
                            <button type="button" onClick={() => destroyEvent(row.id)} className="rounded-full bg-red-500/10 px-3 py-1.5 text-sm font-semibold text-red-300 hover:bg-red-500/20">Eliminar</button>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="pedros-calendar h-full" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
              <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView={currentView}
                initialDate={currentDate}
                locale="es"
                firstDay={1}
                selectable
                selectMirror
                editable
                eventStartEditable
                eventDurationEditable
                dayMaxEvents
                allDayMaintainDuration
                weekends
                height="auto"
                nowIndicator
                eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
                slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
                slotMinTime="00:00:00"
                slotMaxTime="24:00:00"
                headerToolbar={false}
                events={expandedEvents}
                datesSet={(info) => {
                  setCurrentView(info.view.type)
                  setCurrentDate(info.view.currentStart || info.start)
                  setSidebarMiniDate(info.view.currentStart || info.start)
                  setVisibleRange({
                    start: addMonths(startOfMonth(info.start), -1),
                    end: addMonths(endOfMonth(addDays(info.end, -1)), 1),
                  })
                }}
                dateClick={(info) => {
                  const clicked = new Date(info.date)
                  setSelectedMobileDate(clicked)
                  if (currentView === 'timeGridWeek' || currentView === 'timeGridDay') {
                    openNewEvent({ start: clicked, end: addMinutes(clicked, DEFAULT_DURATION_MINUTES), allDay: false })
                  } else {
                    openNewEvent({ start: clicked, end: clicked, allDay: true })
                  }
                }}
                select={(info) => {
                  const start = new Date(info.start)
                  if (info.allDay) {
                    const inclusiveEnd = addDays(new Date(info.end), -1)
                    openNewEvent({ start, end: inclusiveEnd, allDay: true })
                  } else {
                    const end = info.end ? new Date(info.end) : addMinutes(start, DEFAULT_DURATION_MINUTES)
                    openNewEvent({ start, end, allDay: false })
                  }
                }}
                eventClick={(info) => {
                  info.jsEvent.preventDefault()
                  setSelectedMobileDate(info.event.start || new Date())
                  openEditEvent(info.event)
                }}
                eventDrop={async (info) => {
                  if (info.event.extendedProps?.is_virtual_recurring) {
                    info.revert()
                    return
                  }
                  try {
                    await persistEventTimes(info.event)
                  } catch (error) {
                    console.error('Calendars eventDrop:', error)
                    info.revert()
                  }
                }}
                eventResize={async (info) => {
                  if (info.event.extendedProps?.is_virtual_recurring) {
                    info.revert()
                    return
                  }
                  try {
                    await persistEventTimes(info.event)
                  } catch (error) {
                    console.error('Calendars eventResize:', error)
                    info.revert()
                  }
                }}
                eventAllow={(dropInfo, draggedEvent) => !draggedEvent.extendedProps?.is_virtual_recurring}
                eventContent={(arg) => {
                  return (
                    <div className="min-w-0">
                      <div className="truncate">{arg.timeText ? `${arg.timeText} ` : ''}{arg.event.title}</div>
                    </div>
                  )
                }}
              />
            </div>
          )}
        </section>
      </main>

      <EventModal
        open={modalOpen}
        eventData={modalEvent}
        calendars={calendars}
        onClose={() => {
          setModalOpen(false)
          setModalEvent(null)
        }}
        onSave={handleSaveEvent}
        onDelete={trashEvent}
      />
    </div>
  )
}
