import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[]

type CalendarRow = {
  id: string
  user_id: string
  name: string
  color: string | null
  is_default?: boolean | null
}

type EventRow = {
  id: string
  user_id: string
  calendar_id: string
  trello_card_id: string | null
  contact_id?: string | null
  title: string | null
  description: string | null
  start_time: string
  end_time: string
  color_override?: string | null
  is_all_day: boolean
  is_trashed: boolean
  recurrence: 'none' | 'weekly' | 'monthly' | 'yearly' | null
  recurrence_end: string | null
}

type BoardRow = {
  id: string
  user_id: string
  title: string
  icon: string | null
  theme_color: string | null
  default_calendar_id?: string | null
  is_trashed: boolean
}

type ColumnRow = {
  id: string
  board_id: string
  user_id: string
  name: string
  position: number | null
  is_trashed: boolean
}

type CardRow = {
  id: string
  board_id: string
  column_id: string
  user_id: string
  title: string
  description: string | null
  color: string | null
  position: number | null
  is_completed: boolean
  is_trashed: boolean
}

type ContactRow = {
  id: string
  user_id: string
  first_name: string
  last_name: string | null
  phone: string | null
  email: string | null
  notes: string | null
  birthday: string | null
  birthday_event_id: string | null
  tags: string[] | null
  is_deleted: boolean
}

type MediaRow = {
  id: string
  user_id: string
  title: string
  search_title: string
  original_title: string | null
  media_type: 'movie' | 'series'
  status: 'watchlist' | 'seen'
  is_favorite: boolean
  rating_stars: number
  overview: string | null
  poster_url: string | null
  release_year: number | null
  external_source: string | null
  tmdb_id: number | null
  is_deleted: boolean
}

type PedritoAction =
  | {
      type: 'calendar.create_event'
      payload: {
        title: string
        description?: string
        calendar_name?: string
        calendar_id?: string
        start_time: string
        end_time: string
        is_all_day?: boolean
        recurrence?: 'none' | 'weekly' | 'monthly' | 'yearly'
        recurrence_end?: string | null
        color_override?: string | null
        trello_card_id?: string | null
        contact_name?: string | null
        contact_id?: string | null
      }
    }
  | {
      type: 'trello.create_card'
      payload: {
        board_name?: string
        board_id?: string
        column_name?: string
        column_id?: string
        title: string
        description?: string
        color?: string | null
      }
    }
  | {
      type: 'calendar.plan_board'
      payload: {
        board_name?: string
        board_id?: string
        calendar_name?: string
        calendar_id?: string
        days_ahead?: number
        slot_minutes?: number
        max_cards?: number
        workday_start_hour?: number
        workday_end_hour?: number
      }
    }
  | {
      type: 'contact.create'
      payload: {
        first_name: string
        last_name?: string
        phone?: string
        email?: string
        notes?: string
        birthday?: string | null
        tags?: string[]
      }
    }
  | {
      type: 'contact.update'
      payload: {
        contact_id?: string
        contact_name?: string
        first_name?: string
        last_name?: string
        phone?: string | null
        email?: string | null
        notes?: string | null
        birthday?: string | null
        tags?: string[]
      }
    }
  | {
      type: 'contact.link_card'
      payload: {
        contact_id?: string
        contact_name?: string
        card_id?: string
        card_title?: string
      }
    }
  | {
      type: 'contact.link_event'
      payload: {
        contact_id?: string
        contact_name?: string
        event_id?: string
        event_title?: string
      }
    }
  | {
      type: 'contact.query'
      payload: {
        contact_name?: string
        tag?: string
        mode?: 'count_cards' | 'list_by_tag' | 'summary'
      }
    }
  | {
      type: 'media.create'
      payload: {
        title: string
        media_type?: 'movie' | 'series'
        status?: 'watchlist' | 'seen'
        is_favorite?: boolean
        rating_stars?: number
      }
    }
  | {
      type: 'media.update_status'
      payload: { title?: string; media_id?: string; status: 'watchlist' | 'seen' }
    }
  | {
      type: 'media.toggle_favorite'
      payload: { title?: string; media_id?: string; value?: boolean }
    }
  | {
      type: 'media.rate'
      payload: { title?: string; media_id?: string; rating_stars: number }
    }
  | {
      type: 'media.query'
      payload: { mode: 'favorites' | 'watchlist' | 'seen' | 'search'; query?: string }
    }

type PedritoPlan = {
  reply: string
  actions: PedritoAction[]
  refresh?: string[]
  meta?: Record<string, Json>
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

function safeString(v: unknown, fallback = '') {
  return typeof v === 'string' ? v : fallback
}

function normalize(s: string) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
}

function splitName(fullName: string) {
  const clean = String(fullName || '').trim().replace(/\s+/g, ' ')
  if (!clean) return { first_name: '', last_name: '' }
  const parts = clean.split(' ')
  if (parts.length === 1) return { first_name: parts[0], last_name: '' }
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') }
}

function inferCalendarNameFromText(text: string, calendars: CalendarRow[]) {
  const t = normalize(text)
  const explicit = calendars.find((c) => t.includes(normalize(c.name)))
  if (explicit) return explicit.name
  if (t.includes('cumple')) return 'Cumpleaños'
  if (t.includes('birthday')) return 'Cumpleaños'
  if (t.includes('clase') || t.includes('universidad') || t.includes('examen') || t.includes('upv')) return 'Universidad'
  if (t.includes('tars') || t.includes('robot')) return 'TARS'
  return 'Personal'
}

function findCalendar(calendars: CalendarRow[], payload: { calendar_id?: string; calendar_name?: string }, fallbackText = '') {
  if (payload.calendar_id) {
    const byId = calendars.find((c) => c.id === payload.calendar_id)
    if (byId) return byId
  }
  if (payload.calendar_name) {
    const needle = normalize(payload.calendar_name)
    const byName = calendars.find((c) => normalize(c.name) === needle)
    if (byName) return byName
  }
  const inferred = inferCalendarNameFromText(fallbackText, calendars)
  return calendars.find((c) => normalize(c.name) === normalize(inferred)) ?? calendars[0] ?? null
}

function findBoard(boards: BoardRow[], payload: { board_id?: string; board_name?: string }, fallbackText = '') {
  if (payload.board_id) {
    const byId = boards.find((b) => b.id === payload.board_id && !b.is_trashed)
    if (byId) return byId
  }
  if (payload.board_name) {
    const needle = normalize(payload.board_name)
    const exact = boards.find((b) => normalize(b.title) === needle && !b.is_trashed)
    if (exact) return exact
    const contains = boards.find((b) => normalize(b.title).includes(needle) && !b.is_trashed)
    if (contains) return contains
  }
  return boards.find((b) => normalize(fallbackText).includes(normalize(b.title)) && !b.is_trashed) ?? boards.find((b) => !b.is_trashed) ?? null
}

function findColumn(columns: ColumnRow[], boardId: string, payload: { column_id?: string; column_name?: string }) {
  const boardCols = columns.filter((c) => c.board_id === boardId && !c.is_trashed).sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  if (payload.column_id) {
    const byId = boardCols.find((c) => c.id === payload.column_id)
    if (byId) return byId
  }
  if (payload.column_name) {
    const needle = normalize(payload.column_name)
    const exact = boardCols.find((c) => normalize(c.name) === needle)
    if (exact) return exact
    const contains = boardCols.find((c) => normalize(c.name).includes(needle))
    if (contains) return contains
  }
  const preferred = boardCols.find((c) => ['por hacer', 'todo', 'to do', 'pendiente', 'backlog', 'ideas'].includes(normalize(c.name)))
  return preferred ?? boardCols[0] ?? null
}

function findContact(contacts: ContactRow[], payload: { contact_id?: string; contact_name?: string }) {
  if (payload.contact_id) {
    const byId = contacts.find((c) => c.id === payload.contact_id && !c.is_deleted)
    if (byId) return byId
  }
  if (payload.contact_name) {
    const needle = normalize(payload.contact_name)
    const exact = contacts.find((c) => normalize(`${c.first_name} ${c.last_name ?? ''}`) === needle && !c.is_deleted)
    if (exact) return exact
    const partial = contacts.find((c) => normalize(`${c.first_name} ${c.last_name ?? ''}`).includes(needle) && !c.is_deleted)
    if (partial) return partial
  }
  return null
}

function findCardByTitle(cards: CardRow[], title?: string) {
  if (!title) return null
  const needle = normalize(title)
  return cards.find((c) => normalize(c.title) === needle && !c.is_trashed)
    ?? cards.find((c) => normalize(c.title).includes(needle) && !c.is_trashed)
    ?? null
}

function findEventByTitle(events: EventRow[], title?: string) {
  if (!title) return null
  const needle = normalize(title)
  return events.find((e) => normalize(e.title ?? '') === needle && !e.is_trashed)
    ?? events.find((e) => normalize(e.title ?? '').includes(needle) && !e.is_trashed)
    ?? null
}

function findMedia(items: MediaRow[], titleOrId?: string) {
  if (!titleOrId) return null
  const byId = items.find((item) => item.id === titleOrId && !item.is_deleted)
  if (byId) return byId
  const needle = normalize(titleOrId)
  return items.find((item) => normalize(item.title) === needle && !item.is_deleted)
    ?? items.find((item) => normalize(item.title).includes(needle) && !item.is_deleted)
    ?? null
}

function starsFromPrompt(prompt: string) {
  const score10 = prompt.match(/\b([0-9]|10)(?:[\.,]([0-9]))?\b/)
  if (!score10) return null
  const whole = Number(score10[1])
  const decimal = score10[2] ? Number(`0.${score10[2]}`) : 0
  const score = whole + decimal
  if (score > 10) return null
  return Math.max(0, Math.min(5, Math.round(score / 2)))
}

function inferMediaType(prompt: string): 'movie' | 'series' {
  const p = normalize(prompt)
  return p.includes('serie') || p.includes('series') ? 'series' : 'movie'
}

function addMinutes(date: Date, minutes: number) {
  const d = new Date(date)
  d.setMinutes(d.getMinutes() + minutes)
  return d
}
function addDays(date: Date, days: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}
function startOfDay(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}
function endOfDay(date: Date) {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}
function formatDateYYYYMMDD(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
function formatTimeHHMM(date: Date) {
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}
function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd
}
function findNextFreeSlot(existingEvents: EventRow[], fromDate: Date, slotMinutes = 60, daysAhead = 7, workdayStartHour = 9, workdayEndHour = 19) {
  const timedEvents = existingEvents.filter((e) => !e.is_trashed).map((e) => ({ start: new Date(e.start_time), end: new Date(e.end_time) }))
  for (let day = 0; day <= daysAhead; day++) {
    const currentDay = addDays(startOfDay(fromDate), day)
    let cursor = new Date(currentDay)
    cursor.setHours(workdayStartHour, 0, 0, 0)
    const dayEnd = new Date(currentDay)
    dayEnd.setHours(workdayEndHour, 0, 0, 0)
    while (addMinutes(cursor, slotMinutes) <= dayEnd) {
      const candidateStart = new Date(cursor)
      const candidateEnd = addMinutes(candidateStart, slotMinutes)
      const blocked = timedEvents.some((ev) => overlaps(candidateStart, candidateEnd, ev.start, ev.end))
      if (!blocked) return { start: candidateStart, end: candidateEnd }
      cursor = addMinutes(cursor, 30)
    }
  }
  return null
}

function parseTimeFromPrompt(prompt: string) {
  const m = prompt.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/)
  if (!m) return null
  return { hours: Number(m[1]), minutes: Number(m[2]) }
}

function weekdayIndexEs(text: string) {
  const map: Record<string, number> = { lunes: 1, martes: 2, miercoles: 3, miércoles: 3, jueves: 4, viernes: 5, sabado: 6, sábado: 6, domingo: 0 }
  for (const key of Object.keys(map)) if (normalize(text).includes(normalize(key))) return map[key]
  return null
}
function nextWeekday(base: Date, weekday: number) {
  const d = new Date(base)
  let diff = weekday - d.getDay()
  if (diff <= 0) diff += 7
  d.setDate(d.getDate() + diff)
  return d
}
function parseDateFromPrompt(prompt: string, base = new Date()) {
  const t = normalize(prompt)
  if (t.includes('pasado manana') || t.includes('pasado mañana')) return addDays(base, 2)
  if (t.includes('manana') || t.includes('mañana')) return addDays(base, 1)
  if (t.includes('hoy')) return base
  const weekday = weekdayIndexEs(t)
  if (weekday !== null) return nextWeekday(base, weekday)
  const iso = prompt.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T09:00:00`)
  const slash = prompt.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/)
  if (slash) {
    const year = slash[3] ? Number(slash[3]) : base.getFullYear()
    const month = Number(slash[2]) - 1
    const day = Number(slash[1])
    return new Date(year, month, day, 9, 0, 0, 0)
  }
  return base
}

async function enrichWithTMDb(tmdbApiKey: string | undefined, title: string, mediaType: 'movie' | 'series') {
  if (!tmdbApiKey) return null
  const endpoint = mediaType === 'series' ? 'tv' : 'movie'
  const url = new URL(`https://api.themoviedb.org/3/search/${endpoint}`)
  url.searchParams.set('api_key', tmdbApiKey)
  url.searchParams.set('language', 'es-ES')
  url.searchParams.set('query', title)
  url.searchParams.set('include_adult', 'false')
  const response = await fetch(url)
  if (!response.ok) return null
  const data = await response.json()
  const first = data?.results?.[0]
  if (!first) return null
  const release = first.release_date || first.first_air_date || null
  return {
    tmdb_id: first.id,
    title: first.title || first.name || title,
    original_title: first.original_title || first.original_name || null,
    overview: first.overview || null,
    poster_url: first.poster_path ? `https://image.tmdb.org/t/p/w500${first.poster_path}` : null,
    release_year: release ? Number(String(release).slice(0, 4)) : null,
    external_source: 'tmdb',
  }
}

function buildAgendaReply(events: EventRow[], calendars: CalendarRow[]) {
  const next = events.filter((e) => !e.is_trashed).sort((a, b) => +new Date(a.start_time) - +new Date(b.start_time)).slice(0, 8)
  if (!next.length) return 'No tienes nada próximo en agenda.'
  const lines = next.map((e) => {
    const cal = calendars.find((c) => c.id === e.calendar_id)
    const start = new Date(e.start_time)
    const end = new Date(e.end_time)
    if (e.is_all_day) return `• ${e.title || 'Evento'} — ${formatDateYYYYMMDD(start)} · ${cal?.name || 'Sin calendario'}`
    return `• ${e.title || 'Evento'} — ${formatDateYYYYMMDD(start)} ${formatTimeHHMM(start)}-${formatTimeHHMM(end)} · ${cal?.name || 'Sin calendario'}`
  })
  return `Tu agenda próxima es:\n${lines.join('\n')}`
}

function heuristicPlan(params: {
  prompt: string
  context: string
  calendars: CalendarRow[]
  events: EventRow[]
  boards: BoardRow[]
  columns: ColumnRow[]
  cards: CardRow[]
  contacts: ContactRow[]
  mediaItems: MediaRow[]
}): PedritoPlan {
  const { prompt, calendars, events, boards } = params
  const text = normalize(prompt)

  // Contactos
  if (text.includes('crea contacto') || text.includes('crear contacto')) {
    const raw = prompt.replace(/crea(r)? contacto/gi, '').replace(/con numero/gi, ' ').replace(/con número/gi, ' ').trim()
    const phoneMatch = prompt.match(/(\+?\d[\d\s]{7,}\d)/)
    const emailMatch = prompt.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
    const withoutExtras = raw.replace(phoneMatch?.[0] ?? '', '').replace(emailMatch?.[0] ?? '', '').trim()
    const name = splitName(withoutExtras)
    return {
      reply: `Voy a crear el contacto ${[name.first_name, name.last_name].filter(Boolean).join(' ')}.`,
      actions: [{ type: 'contact.create', payload: { first_name: name.first_name, last_name: name.last_name, phone: phoneMatch?.[0]?.trim(), email: emailMatch?.[0]?.trim(), tags: [] } }],
      refresh: ['contacts'],
    }
  }
  if (text.includes('asocia') && text.includes('tarea')) {
    const nameMatch = prompt.match(/asocia a (.+?) con la tarea/i)
    const taskMatch = prompt.match(/tarea (.+)$/i)
    return { reply: 'Voy a vincular ese contacto con la tarea.', actions: [{ type: 'contact.link_card', payload: { contact_name: nameMatch?.[1]?.trim(), card_title: taskMatch?.[1]?.trim() } }], refresh: ['contacts', 'trellos'] }
  }
  if (text.includes('cuantas tareas hay asociadas a') || text.includes('cuántas tareas hay asociadas a')) {
    const m = prompt.match(/asociadas a (.+)$/i)
    return { reply: 'Voy a comprobarlo.', actions: [{ type: 'contact.query', payload: { contact_name: m?.[1]?.trim(), mode: 'count_cards' } }], refresh: [] }
  }
  if (text.includes('contactos con etiqueta')) {
    const m = prompt.match(/etiqueta (.+)$/i)
    return { reply: 'Voy a buscar esos contactos.', actions: [{ type: 'contact.query', payload: { tag: m?.[1]?.trim(), mode: 'list_by_tag' } }], refresh: [] }
  }

  // Media
  if (text.includes('favorit') && (text.includes('que pelis') || text.includes('qué pelis') || text.includes('que series') || text.includes('qué series') || text.includes('favoritos'))) {
    return { reply: 'Voy a revisar tus favoritas.', actions: [{ type: 'media.query', payload: { mode: 'favorites' } }], refresh: [] }
  }
  if ((text.includes('por ver') || text.includes('watchlist')) && (text.includes('que ') || text.includes('qué '))) {
    return { reply: 'Voy a revisar tu lista por ver.', actions: [{ type: 'media.query', payload: { mode: 'watchlist' } }], refresh: [] }
  }
  if ((text.includes('vistas') || text.includes('he visto')) && (text.includes('que ') || text.includes('qué '))) {
    return { reply: 'Voy a revisar lo que tienes visto.', actions: [{ type: 'media.query', payload: { mode: 'seen' } }], refresh: [] }
  }
  if (text.includes('marca') && text.includes('favorita')) {
    const title = prompt.replace(/marca/gi, '').replace(/como favorita/gi, '').replace(/favorita/gi, '').trim()
    return { reply: `Voy a marcar ${title} como favorita.`, actions: [{ type: 'media.toggle_favorite', payload: { title, value: true } }], refresh: ['media', 'movies', 'peliculas'] }
  }
  if ((text.includes('marca') || text.includes('pon')) && (text.includes('vista') || text.includes('por ver'))) {
    const status = text.includes('vista') ? 'seen' : 'watchlist'
    const title = prompt.replace(/marca/gi, '').replace(/pon/gi, '').replace(/como vista/gi, '').replace(/como visto/gi, '').replace(/como por ver/gi, '').replace(/vista/gi, '').replace(/visto/gi, '').replace(/por ver/gi, '').replace(/y ponle.*/gi, '').trim()
    const actions: PedritoAction[] = [{ type: 'media.update_status', payload: { title, status } }]
    const stars = starsFromPrompt(prompt)
    if (stars !== null) actions.push({ type: 'media.rate', payload: { title, rating_stars: stars } })
    return { reply: `Voy a actualizar ${title}.`, actions, refresh: ['media', 'movies', 'peliculas'] }
  }
  if (text.includes('ponle un') || text.includes('ponle ') || text.includes('valora') || text.includes('valorala') || text.includes('valórala')) {
    const stars = starsFromPrompt(prompt)
    const title = prompt.replace(/ponle/gi, '').replace(/valora/gi, '').replace(/valorala/gi, '').replace(/valórala/gi, '').replace(/un\s*[0-9](?:[\.,][0-9])?/gi, '').trim()
    if (stars !== null && title) return { reply: `Voy a cambiar la valoración de ${title}.`, actions: [{ type: 'media.rate', payload: { title, rating_stars: stars } }], refresh: ['media', 'movies', 'peliculas'] }
  }
  if (text.includes('anade') || text.includes('añade') || text.includes('agrega')) {
    const status = text.includes('por ver') ? 'watchlist' : text.includes('vista') || text.includes('visto') ? 'seen' : 'watchlist'
    const title = prompt.replace(/anade/gi, '').replace(/añade/gi, '').replace(/agrega/gi, '').replace(/a por ver/gi, '').replace(/por ver/gi, '').replace(/como vista/gi, '').replace(/como visto/gi, '').replace(/vista/gi, '').replace(/visto/gi, '').trim()
    if (title) return { reply: `Voy a añadir ${title}.`, actions: [{ type: 'media.create', payload: { title, media_type: inferMediaType(prompt), status } }], refresh: ['media', 'movies', 'peliculas'] }
  }

  // Agenda / calendar / trello
  if (text.includes('que tengo') || text.includes('qué tengo') || text.includes('mi agenda') || text.includes('agenda de hoy') || text.includes('agenda de manana') || text.includes('agenda de mañana')) {
    return { reply: buildAgendaReply(events, calendars), actions: [], refresh: [] }
  }
  if (text.includes('planifica') || text.includes('planificalo') || text.includes('planifícalo') || text.includes('programa las tareas') || text.includes('agenda las tareas')) {
    const board = findBoard(boards, {}, prompt)
    if (!board) return { reply: 'No he encontrado ningún tablero para planificar.', actions: [], refresh: [] }
    const calName = inferCalendarNameFromText(board.title, calendars)
    return {
      reply: `Voy a planificar tareas del tablero ${board.title} en el calendario ${calName}.`,
      actions: [{ type: 'calendar.plan_board', payload: { board_id: board.id, board_name: board.title, calendar_name: calName, days_ahead: 7, slot_minutes: 60, max_cards: 5, workday_start_hour: 9, workday_end_hour: 19 } }],
      refresh: ['trellos', 'calendar'],
    }
  }
  if (text.includes('crea tarjeta') || text.includes('crear tarjeta') || text.includes('nueva tarjeta') || text.includes('crea una tarea') || text.includes('crear una tarea')) {
    const board = findBoard(boards, {}, prompt)
    const titleMatch = prompt.match(/["“](.+?)["”]/)?.[1] || prompt.replace(/crea(r)? una? (tarjeta|tarea)/i, '').trim() || 'Nueva tarea'
    return { reply: `Voy a crear la tarjeta "${titleMatch}".`, actions: [{ type: 'trello.create_card', payload: { board_id: board?.id, board_name: board?.title, title: titleMatch } }], refresh: ['trellos'] }
  }
  const looksLikeEvent = text.includes('evento') || text.includes('reunion') || text.includes('reunión') || text.includes('recordatorio') || text.includes('cumple') || text.includes('clase') || text.includes('quedada')
  if (looksLikeEvent) {
    const startBase = parseDateFromPrompt(prompt, new Date())
    const time = parseTimeFromPrompt(prompt)
    const start = new Date(startBase)
    if (time) start.setHours(time.hours, time.minutes, 0, 0)
    else if (text.includes('tarde')) start.setHours(18, 0, 0, 0)
    else if (text.includes('manana') || text.includes('mañana')) start.setHours(10, 0, 0, 0)
    else start.setHours(9, 0, 0, 0)
    const calendarName = inferCalendarNameFromText(prompt, calendars)
    const isBirthday = normalize(calendarName) === 'cumpleanos' || normalize(calendarName) === 'cumpleaños'
    const title = prompt.match(/["“](.+?)["”]/)?.[1] || prompt.replace(/crea(r)?/i, '').replace(/evento/gi, '').replace(/recordatorio/gi, '').trim() || 'Evento'
    if (isBirthday) {
      const day = startOfDay(start)
      return { reply: `Voy a crear "${title}" en ${calendarName}.`, actions: [{ type: 'calendar.create_event', payload: { title, calendar_name: calendarName, start_time: day.toISOString(), end_time: day.toISOString(), is_all_day: true, recurrence: 'yearly' } }], refresh: ['calendar'] }
    }
    return { reply: `Voy a crear "${title}" en ${calendarName}.`, actions: [{ type: 'calendar.create_event', payload: { title, calendar_name: calendarName, start_time: start.toISOString(), end_time: addMinutes(start, 60).toISOString(), is_all_day: false, recurrence: 'none' } }], refresh: ['calendar'] }
  }

  return { reply: 'Puedo ayudarte con agenda, tareas, contactos, películas y series. Prueba por ejemplo: “planifica las tareas de TARS”, “crea contacto Luis Pérez”, “añade Dune a por ver” o “qué tengo mañana”.', actions: [], refresh: [] }
}

async function syncBirthdayFromEdge(supabaseClient: ReturnType<typeof createClient>, userId: string, calendars: CalendarRow[], contact: ContactRow, prevBirthdayEventId?: string | null) {
  const birthdayCalendar = calendars.find((c) => normalize(c.name) === 'cumpleanos' || normalize(c.name) === 'cumpleaños') ?? calendars[0] ?? null
  if (prevBirthdayEventId) {
    await supabaseClient.from('events').update({ is_trashed: true }).eq('id', prevBirthdayEventId)
    await supabaseClient.from('contact_events').delete().eq('event_id', prevBirthdayEventId)
  }
  if (!contact.birthday || !birthdayCalendar) {
    await supabaseClient.from('contacts').update({ birthday_event_id: null }).eq('id', contact.id)
    return null
  }
  const [, month, day] = contact.birthday.split('-')
  const year = new Date().getFullYear()
  const dateStr = `${year}-${month}-${day}`
  const title = `🎂 Cumpleaños de ${contact.first_name}${contact.last_name ? ` ${contact.last_name}` : ''}`
  const { data: ev, error } = await supabaseClient.from('events').insert({
    user_id: userId,
    calendar_id: birthdayCalendar.id,
    title,
    description: '',
    is_all_day: true,
    recurrence: 'yearly',
    start_time: `${dateStr}T00:00:00`,
    end_time: `${dateStr}T23:59:59`,
    is_trashed: false,
    contact_id: contact.id,
  }).select('id').single()
  if (error) throw error
  await supabaseClient.from('contacts').update({ birthday_event_id: ev.id }).eq('id', contact.id)
  await supabaseClient.from('contact_events').upsert({ user_id: userId, contact_id: contact.id, event_id: ev.id }, { onConflict: 'contact_id,event_id' })
  return ev
}

async function executeCreateContact(params: { supabaseAdmin: ReturnType<typeof createClient>; userId: string; calendars: CalendarRow[]; action: Extract<PedritoAction, { type: 'contact.create' }> }) {
  const { supabaseAdmin, userId, calendars, action } = params
  const { data, error } = await supabaseAdmin.from('contacts').insert({ user_id: userId, first_name: action.payload.first_name?.trim() || 'Sin nombre', last_name: action.payload.last_name?.trim() || null, phone: action.payload.phone?.trim() || null, email: action.payload.email?.trim() || null, notes: action.payload.notes?.trim() || null, birthday: action.payload.birthday || null, tags: action.payload.tags ?? [], is_deleted: false }).select('*').single()
  if (error) throw error
  if (data.birthday) await syncBirthdayFromEdge(supabaseAdmin, userId, calendars, data, null)
  return data
}

async function executeUpdateContact(params: { supabaseAdmin: ReturnType<typeof createClient>; userId: string; contacts: ContactRow[]; calendars: CalendarRow[]; action: Extract<PedritoAction, { type: 'contact.update' }> }) {
  const { supabaseAdmin, contacts, calendars, userId, action } = params
  const contact = findContact(contacts, { contact_id: action.payload.contact_id, contact_name: action.payload.contact_name })
  if (!contact) throw new Error('No he encontrado el contacto.')
  const payload = { first_name: action.payload.first_name ?? contact.first_name, last_name: action.payload.last_name ?? contact.last_name, phone: action.payload.phone === undefined ? contact.phone : action.payload.phone, email: action.payload.email === undefined ? contact.email : action.payload.email, notes: action.payload.notes === undefined ? contact.notes : action.payload.notes, birthday: action.payload.birthday === undefined ? contact.birthday : action.payload.birthday, tags: action.payload.tags ?? contact.tags ?? [] }
  const { data, error } = await supabaseAdmin.from('contacts').update(payload).eq('id', contact.id).select('*').single()
  if (error) throw error
  const birthdayChanged = String(contact.birthday ?? '') !== String(data.birthday ?? '')
  if (birthdayChanged || (data.birthday && !data.birthday_event_id)) await syncBirthdayFromEdge(supabaseAdmin, userId, calendars, data, contact.birthday_event_id)
  return data
}

async function executeLinkContactCard(params: { supabaseAdmin: ReturnType<typeof createClient>; userId: string; contacts: ContactRow[]; cards: CardRow[]; action: Extract<PedritoAction, { type: 'contact.link_card' }> }) {
  const { supabaseAdmin, userId, contacts, cards, action } = params
  const contact = findContact(contacts, { contact_id: action.payload.contact_id, contact_name: action.payload.contact_name })
  if (!contact) throw new Error('No he encontrado el contacto.')
  const card = (action.payload.card_id ? cards.find((c) => c.id === action.payload.card_id && !c.is_trashed) : null) ?? findCardByTitle(cards, action.payload.card_title)
  if (!card) throw new Error('No he encontrado la tarjeta.')
  const { error } = await supabaseAdmin.from('contact_trello_cards').upsert({ user_id: userId, contact_id: contact.id, card_id: card.id }, { onConflict: 'contact_id,card_id' })
  if (error) throw error
  return { contact, card }
}

async function executeLinkContactEvent(params: { supabaseAdmin: ReturnType<typeof createClient>; userId: string; contacts: ContactRow[]; events: EventRow[]; action: Extract<PedritoAction, { type: 'contact.link_event' }> }) {
  const { supabaseAdmin, userId, contacts, events, action } = params
  const contact = findContact(contacts, { contact_id: action.payload.contact_id, contact_name: action.payload.contact_name })
  if (!contact) throw new Error('No he encontrado el contacto.')
  const event = (action.payload.event_id ? events.find((e) => e.id === action.payload.event_id && !e.is_trashed) : null) ?? findEventByTitle(events, action.payload.event_title)
  if (!event) throw new Error('No he encontrado el evento.')
  const { error } = await supabaseAdmin.from('contact_events').upsert({ user_id: userId, contact_id: contact.id, event_id: event.id }, { onConflict: 'contact_id,event_id' })
  if (error) throw error
  return { contact, event }
}

async function executeContactQuery(params: { supabaseAdmin: ReturnType<typeof createClient>; contacts: ContactRow[]; action: Extract<PedritoAction, { type: 'contact.query' }> }) {
  const { supabaseAdmin, contacts, action } = params
  if (action.payload.mode === 'list_by_tag') {
    const tag = normalize(action.payload.tag || '')
    const matches = contacts.filter((c) => (c.tags ?? []).some((t) => normalize(t) === tag))
    return { reply: matches.length ? `He encontrado ${matches.length} contacto(s): ${matches.map((c) => `${c.first_name} ${c.last_name ?? ''}`.trim()).join(', ')}.` : 'No he encontrado contactos con esa etiqueta.' }
  }
  if (action.payload.mode === 'count_cards') {
    const contact = findContact(contacts, { contact_name: action.payload.contact_name })
    if (!contact) return { reply: 'No he encontrado el contacto.' }
    const { count, error } = await supabaseAdmin.from('contact_trello_cards').select('*', { count: 'exact', head: true }).eq('contact_id', contact.id)
    if (error) throw error
    return { reply: `${contact.first_name}${contact.last_name ? ` ${contact.last_name}` : ''} tiene ${count ?? 0} tarea(s) asociada(s).` }
  }
  return { reply: `Tienes ${contacts.length} contacto(s) activos.` }
}

async function executeCreateEvent(params: { supabaseAdmin: ReturnType<typeof createClient>; userId: string; calendars: CalendarRow[]; contacts: ContactRow[]; action: Extract<PedritoAction, { type: 'calendar.create_event' }> }) {
  const { supabaseAdmin, userId, calendars, contacts, action } = params
  const cal = findCalendar(calendars, action.payload, action.payload.title)
  if (!cal) throw new Error('No hay calendarios disponibles para crear el evento.')
  const isBirthday = normalize(cal.name) === 'cumpleanos' || normalize(cal.name) === 'cumpleaños'
  const isAllDay = isBirthday ? true : !!action.payload.is_all_day
  let start = new Date(action.payload.start_time)
  let end = new Date(action.payload.end_time)
  if (isAllDay) {
    start = startOfDay(start)
    end = startOfDay(end < start ? start : end)
  } else if (end <= start) {
    end = addMinutes(start, 60)
  }
  const contact = action.payload.contact_id || action.payload.contact_name ? findContact(contacts, { contact_id: action.payload.contact_id ?? undefined, contact_name: action.payload.contact_name ?? undefined }) : null
  const payload = { user_id: userId, calendar_id: cal.id, trello_card_id: action.payload.trello_card_id ?? null, contact_id: contact?.id ?? null, title: action.payload.title?.trim() || 'Evento', description: action.payload.description ?? '', start_time: start.toISOString(), end_time: end.toISOString(), color_override: action.payload.color_override ?? null, is_all_day: isAllDay, is_trashed: false, recurrence: isBirthday ? 'yearly' : (action.payload.recurrence ?? 'none'), recurrence_end: action.payload.recurrence_end ?? null }
  const { data, error } = await supabaseAdmin.from('events').insert(payload).select('*').single()
  if (error) throw error
  if (contact) {
    await supabaseAdmin.from('contact_events').upsert({ user_id: userId, contact_id: contact.id, event_id: data.id }, { onConflict: 'contact_id,event_id' })
  }
  return data
}

async function executeCreateCard(params: { supabaseAdmin: ReturnType<typeof createClient>; userId: string; prompt: string; boards: BoardRow[]; columns: ColumnRow[]; action: Extract<PedritoAction, { type: 'trello.create_card' }> }) {
  const { supabaseAdmin, userId, prompt, boards, columns, action } = params
  const board = findBoard(boards, action.payload, prompt)
  if (!board) throw new Error('No he encontrado ningún tablero donde crear la tarjeta.')
  const column = findColumn(columns, board.id, action.payload)
  if (!column) throw new Error('No he encontrado ninguna columna válida para crear la tarjeta.')
  const { data, error } = await supabaseAdmin.from('trellos_cards').insert({ user_id: userId, board_id: board.id, column_id: column.id, title: action.payload.title?.trim() || 'Sin título', description: action.payload.description ?? '', color: action.payload.color ?? null, position: 0, is_completed: false, is_trashed: false }).select('*').single()
  if (error) throw error
  return data
}

async function executePlanBoard(params: { supabaseAdmin: ReturnType<typeof createClient>; userId: string; prompt: string; boards: BoardRow[]; cards: CardRow[]; columns: ColumnRow[]; calendars: CalendarRow[]; events: EventRow[]; action: Extract<PedritoAction, { type: 'calendar.plan_board' }> }) {
  const { supabaseAdmin, userId, prompt, boards, cards, calendars, events, action } = params
  const board = findBoard(boards, action.payload, prompt)
  if (!board) throw new Error('No he encontrado el tablero que quieres planificar.')
  const calendar = findCalendar(calendars, action.payload, board.title)
  if (!calendar) throw new Error('No he encontrado un calendario donde planificar.')
  const maxCards = Math.max(1, Math.min(Number(action.payload.max_cards ?? 5), 20))
  const slotMinutes = Math.max(15, Math.min(Number(action.payload.slot_minutes ?? 60), 240))
  const daysAhead = Math.max(1, Math.min(Number(action.payload.days_ahead ?? 7), 30))
  const workdayStartHour = Math.max(0, Math.min(Number(action.payload.workday_start_hour ?? 9), 23))
  const workdayEndHour = Math.max(workdayStartHour + 1, Math.min(Number(action.payload.workday_end_hour ?? 19), 24))
  const boardCards = cards.filter((c) => c.board_id === board.id && !c.is_trashed && !c.is_completed).sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const existingEventByCardId = new Set(events.filter((e) => !e.is_trashed && e.trello_card_id).map((e) => String(e.trello_card_id)))
  const unscheduled = boardCards.filter((c) => !existingEventByCardId.has(String(c.id))).slice(0, maxCards)
  const created: Array<Record<string, Json>> = []
  const workingEvents = [...events]
  for (const card of unscheduled) {
    const slot = findNextFreeSlot(workingEvents, new Date(), slotMinutes, daysAhead, workdayStartHour, workdayEndHour)
    if (!slot) break
    const { data, error } = await supabaseAdmin.from('events').insert({ user_id: userId, calendar_id: calendar.id, trello_card_id: card.id, title: card.title, description: card.description ?? '', start_time: slot.start.toISOString(), end_time: slot.end.toISOString(), color_override: card.color ?? null, is_all_day: false, is_trashed: false, recurrence: 'none', recurrence_end: null }).select('*').single()
    if (error) throw error
    created.push(data as Record<string, Json>)
    workingEvents.push(data as EventRow)
  }
  return { created, board: board.title, calendar: calendar.name, message: created.length ? `He planificado ${created.length} tarea(s) del tablero ${board.title} en ${calendar.name}.` : 'No he encontrado huecos libres para planificar.' }
}

async function executeMediaAction(params: { supabaseAdmin: ReturnType<typeof createClient>; userId: string; tmdbApiKey?: string; mediaItems: MediaRow[]; action: Extract<PedritoAction, { type: 'media.create' | 'media.update_status' | 'media.toggle_favorite' | 'media.rate' | 'media.query' }> }) {
  const { supabaseAdmin, userId, tmdbApiKey, mediaItems, action } = params
  if (action.type === 'media.create') {
    const title = action.payload.title.trim()
    const mediaType = action.payload.media_type ?? 'movie'
    const existing = findMedia(mediaItems, title)
    if (existing) return { reply: `${existing.title} ya estaba en tu biblioteca.`, data: existing }
    const enriched = await enrichWithTMDb(tmdbApiKey, title, mediaType)
    const payload = { user_id: userId, title: enriched?.title || title, search_title: normalize(title), original_title: enriched?.original_title || null, media_type: mediaType, status: action.payload.status ?? 'watchlist', is_favorite: !!action.payload.is_favorite, rating_stars: Math.max(0, Math.min(5, Math.round(action.payload.rating_stars ?? 0))), overview: enriched?.overview || null, poster_url: enriched?.poster_url || null, release_year: enriched?.release_year || null, external_source: enriched?.external_source || 'manual', tmdb_id: enriched?.tmdb_id || null, is_deleted: false }
    const { data, error } = await supabaseAdmin.from('media_items').insert(payload).select('*').single()
    if (error) throw error
    return { reply: `${data.title} añadida correctamente.`, data }
  }
  if (action.type === 'media.update_status') {
    const item = findMedia(mediaItems, action.payload.media_id || action.payload.title)
    if (!item) return { reply: 'No he encontrado ese título.' }
    const { data, error } = await supabaseAdmin.from('media_items').update({ status: action.payload.status }).eq('id', item.id).select('*').single()
    if (error) throw error
    return { reply: `${item.title} ahora está como ${action.payload.status === 'seen' ? 'vista' : 'por ver'}.`, data }
  }
  if (action.type === 'media.toggle_favorite') {
    const item = findMedia(mediaItems, action.payload.media_id || action.payload.title)
    if (!item) return { reply: 'No he encontrado ese título.' }
    const nextValue = typeof action.payload.value === 'boolean' ? action.payload.value : !item.is_favorite
    const { data, error } = await supabaseAdmin.from('media_items').update({ is_favorite: nextValue }).eq('id', item.id).select('*').single()
    if (error) throw error
    return { reply: `${item.title} ${nextValue ? 'ya está en favoritas' : 'ha salido de favoritas'}.`, data }
  }
  if (action.type === 'media.rate') {
    const item = findMedia(mediaItems, action.payload.media_id || action.payload.title)
    if (!item) return { reply: 'No he encontrado ese título.' }
    const { data, error } = await supabaseAdmin.from('media_items').update({ rating_stars: Math.max(0, Math.min(5, Math.round(action.payload.rating_stars))) }).eq('id', item.id).select('*').single()
    if (error) throw error
    return { reply: `${item.title} ahora tiene ${data.rating_stars} estrella(s).`, data }
  }
  if (action.type === 'media.query') {
    let result = mediaItems
    if (action.payload.mode === 'favorites') result = mediaItems.filter((i) => i.is_favorite)
    if (action.payload.mode === 'watchlist') result = mediaItems.filter((i) => i.status === 'watchlist')
    if (action.payload.mode === 'seen') result = mediaItems.filter((i) => i.status === 'seen')
    if (action.payload.mode === 'search') {
      const q = normalize(action.payload.query ?? '')
      result = mediaItems.filter((i) => normalize(i.title).includes(q))
    }
    if (!result.length) {
      return { reply: action.payload.mode === 'favorites' ? 'No tienes nada en favoritas.' : action.payload.mode === 'watchlist' ? 'No tienes nada en por ver.' : action.payload.mode === 'seen' ? 'No tienes nada marcado como visto.' : 'No he encontrado resultados.' }
    }
    return { reply: result.slice(0, 12).map((item) => `• ${item.title} — ${item.status === 'seen' ? 'vista' : 'por ver'}${item.is_favorite ? ' · ❤️' : ''}${item.rating_stars ? ` · ${item.rating_stars}★` : ''}`).join('\n') }
  }
  return { reply: 'Acción de media no soportada.' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const tmdbApiKey = Deno.env.get('TMDB_API_KEY')
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) return jsonResponse({ error: 'Faltan variables de entorno de Supabase en la función.' }, 500)
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: authData, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !authData.user) return jsonResponse({ error: 'No autorizado.' }, 401)
    const user = authData.user
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)
    const body = await req.json().catch(() => ({}))
    const prompt = safeString(body?.prompt).trim()
    const context = safeString(body?.context, 'pedrOS')
    if (!prompt) return jsonResponse({ error: 'Prompt vacío.' }, 400)

    const [calendarsRes, eventsRes, boardsRes, columnsRes, cardsRes, contactsRes, mediaRes] = await Promise.all([
      supabaseAdmin.from('calendars').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
      supabaseAdmin.from('events').select('*').eq('user_id', user.id).order('start_time', { ascending: true }),
      supabaseAdmin.from('trellos_boards').select('*').eq('user_id', user.id).order('position', { ascending: true }),
      supabaseAdmin.from('trellos_columns').select('*').eq('user_id', user.id).order('position', { ascending: true }),
      supabaseAdmin.from('trellos_cards').select('*').eq('user_id', user.id).order('position', { ascending: true }),
      supabaseAdmin.from('contacts').select('*').eq('user_id', user.id).eq('is_deleted', false).order('last_name', { ascending: true }).order('first_name', { ascending: true }),
      supabaseAdmin.from('media_items').select('*').eq('user_id', user.id).eq('is_deleted', false).order('updated_at', { ascending: false }),
    ])
    if (calendarsRes.error) throw calendarsRes.error
    if (eventsRes.error) throw eventsRes.error
    if (boardsRes.error) throw boardsRes.error
    if (columnsRes.error) throw columnsRes.error
    if (cardsRes.error) throw cardsRes.error
    if (contactsRes.error) throw contactsRes.error
    if (mediaRes.error && mediaRes.error.code !== 'PGRST205') throw mediaRes.error

    const calendars = (calendarsRes.data ?? []) as CalendarRow[]
    const events = (eventsRes.data ?? []) as EventRow[]
    const boards = (boardsRes.data ?? []) as BoardRow[]
    const columns = (columnsRes.data ?? []) as ColumnRow[]
    const cards = (cardsRes.data ?? []) as CardRow[]
    const contacts = (contactsRes.data ?? []) as ContactRow[]
    const mediaItems = (mediaRes.data ?? []) as MediaRow[]

    const plan = heuristicPlan({ prompt, context, calendars, events, boards, columns, cards, contacts, mediaItems })
    const refresh = new Set(plan.refresh ?? [])
    const executed: Array<Record<string, Json>> = []
    let reply = plan.reply || 'Hecho.'

    for (const action of plan.actions ?? []) {
      if (action.type === 'contact.create') {
        const created = await executeCreateContact({ supabaseAdmin, userId: user.id, calendars, action })
        executed.push({ type: action.type, result: created as unknown as Json })
        refresh.add('contacts')
        refresh.add('calendar')
        reply = `He creado el contacto ${created.first_name}${created.last_name ? ` ${created.last_name}` : ''}.`
        continue
      }
      if (action.type === 'contact.update') {
        const updated = await executeUpdateContact({ supabaseAdmin, userId: user.id, contacts, calendars, action })
        executed.push({ type: action.type, result: updated as unknown as Json })
        refresh.add('contacts'); refresh.add('calendar')
        reply = `He actualizado el contacto ${updated.first_name}${updated.last_name ? ` ${updated.last_name}` : ''}.`
        continue
      }
      if (action.type === 'contact.link_card') {
        const result = await executeLinkContactCard({ supabaseAdmin, userId: user.id, contacts, cards, action })
        executed.push({ type: action.type, result: result as unknown as Json })
        refresh.add('contacts'); refresh.add('trellos')
        reply = 'He vinculado el contacto con la tarea.'
        continue
      }
      if (action.type === 'contact.link_event') {
        const result = await executeLinkContactEvent({ supabaseAdmin, userId: user.id, contacts, events, action })
        executed.push({ type: action.type, result: result as unknown as Json })
        refresh.add('contacts'); refresh.add('calendar')
        reply = 'He vinculado el contacto con el evento.'
        continue
      }
      if (action.type === 'contact.query') {
        const result = await executeContactQuery({ supabaseAdmin, contacts, action })
        executed.push({ type: action.type, result: result as unknown as Json })
        reply = result.reply
        continue
      }
      if (action.type === 'calendar.create_event') {
        const created = await executeCreateEvent({ supabaseAdmin, userId: user.id, calendars, contacts, action })
        executed.push({ type: action.type, result: created as unknown as Json })
        refresh.add('calendar'); refresh.add('events')
        reply = `He creado el evento ${created.title}.`
        continue
      }
      if (action.type === 'trello.create_card') {
        const created = await executeCreateCard({ supabaseAdmin, userId: user.id, prompt, boards, columns, action })
        executed.push({ type: action.type, result: created as unknown as Json })
        refresh.add('trellos'); refresh.add('cards')
        reply = `He creado la tarjeta ${created.title}.`
        continue
      }
      if (action.type === 'calendar.plan_board') {
        const result = await executePlanBoard({ supabaseAdmin, userId: user.id, prompt, boards, cards, columns, calendars, events, action })
        executed.push({ type: action.type, result: result as unknown as Json })
        refresh.add('calendar'); refresh.add('events'); refresh.add('trellos'); refresh.add('cards')
        if (typeof result?.message === 'string') reply = result.message
        continue
      }
      if (action.type.startsWith('media.')) {
        const result = await executeMediaAction({ supabaseAdmin, userId: user.id, tmdbApiKey: tmdbApiKey ?? undefined, mediaItems, action: action as Extract<PedritoAction, { type: 'media.create' | 'media.update_status' | 'media.toggle_favorite' | 'media.rate' | 'media.query' }> })
        executed.push({ type: action.type, result: result as unknown as Json })
        reply = result.reply
        if (action.type !== 'media.query') {
          refresh.add('media'); refresh.add('movies'); refresh.add('peliculas')
        }
        continue
      }
    }

    return jsonResponse({ reply, actions: plan.actions ?? [], refresh: Array.from(refresh), executed, meta: { context, calendars: calendars.length, events: events.length, boards: boards.length, contacts: contacts.length, media_items: mediaItems.length } })
  } catch (error) {
    console.error('pedrito error:', error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Error interno en Pedrito.' }, 500)
  }
})
