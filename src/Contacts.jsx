// src/Contacts.jsx
// pedrOS — Módulo Contactos
// Stack: React + Tailwind CSS v4 + Supabase JS v2
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'

// ─── Utilidades de fecha ─────────────────────────────────────────────────────

function cx(...cls) { return cls.filter(Boolean).join(' ') }
function safeTrim(value) { return String(value ?? '').trim() }

function isoToDisplayDate(dateStr) {
  if (!dateStr) return ''
  const parts = String(dateStr).split('-')
  if (parts.length !== 3) return ''
  const [y, m, d] = parts
  return `${d}/${m}/${y}`
}

function displayToIsoDate(value) {
  const clean = safeTrim(value)
  if (!clean) return ''
  const match = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return ''
  const [, d, m, y] = match
  const dt = new Date(`${y}-${m}-${d}T00:00:00`)
  if (Number.isNaN(dt.getTime())) return ''
  if (String(dt.getDate()).padStart(2, '0') !== d || String(dt.getMonth() + 1).padStart(2, '0') !== m || String(dt.getFullYear()) !== y) return ''
  return `${y}-${m}-${d}`
}

// DD/MM/AAAA — para cumpleaños almacenado como YYYY-MM-DD
function formatBirthdayFull(dateStr) {
  return isoToDisplayDate(dateStr)
}

// Formato DD/MM/AAAA [HH:MM] para eventos
function formatEventDate(str) {
  if (!str) return ''
  try {
    const dt = new Date(str)
    const dd = String(dt.getDate()).padStart(2, '0')
    const mm = String(dt.getMonth() + 1).padStart(2, '0')
    const yyyy = dt.getFullYear()
    const hh = String(dt.getHours()).padStart(2, '0')
    const mi = String(dt.getMinutes()).padStart(2, '0')
    if (hh === '00' && mi === '00') return `${dd}/${mm}/${yyyy}`
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`
  } catch { return str }
}

function initials(first, last) {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase() || '?'
}

const AVATAR_COLORS = [
  'bg-blue-600','bg-emerald-600','bg-violet-600','bg-orange-600',
  'bg-rose-600','bg-cyan-600','bg-amber-600','bg-indigo-600',
]
function avatarColor(name) {
  let n = 0
  for (const c of name) n += c.charCodeAt(0)
  return AVATAR_COLORS[n % AVATAR_COLORS.length]
}

// ─── Estilos reutilizables ───────────────────────────────────────────────────

const sInput = 'w-full bg-slate-900 border border-slate-600 text-white placeholder-slate-500 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-200 text-sm'
const sLabel = 'block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1'
const sBtnPrimary   = 'bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-all duration-200'
const sBtnSecondary = 'bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white font-semibold rounded-lg px-4 py-2 text-sm transition-all duration-200'

// ─── Iconos ──────────────────────────────────────────────────────────────────

function IconX({ size = 'md' }) {
  const s = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
  return (
    <svg className={s} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
function IconEdit() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  )
}
function IconTrash() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  )
}
function IconSearch() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  )
}
function IconBack() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({ first, last, size = 'md' }) {
  const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-14 h-14 text-lg' }
  const color = avatarColor((first || '') + (last || ''))
  return (
    <div className={cx('rounded-full flex items-center justify-center font-bold text-white flex-shrink-0', sizes[size], color)}>
      {initials(first, last)}
    </div>
  )
}

// ─── Lógica de cumpleaños ────────────────────────────────────────────────────

async function ensureBirthdayCalendar(userId) {
  const { data: existing, error: existingError } = await supabase
    .from('calendars')
    .select('id, name, color')
    .eq('user_id', userId)
    .ilike('name', 'cumpleaños')
    .limit(1)

  if (existingError) throw existingError
  if (existing?.length) return existing[0]

  const { data: created, error: createdError } = await supabase
    .from('calendars')
    .insert({
      user_id: userId,
      name: 'Cumpleaños',
      color: '#e67c73',
      is_default: false,
    })
    .select('id, name, color')
    .single()

  if (createdError) throw createdError
  return created
}

async function syncBirthdayEvent(contact, prevEventId) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  if (prevEventId) {
    await supabase.from('events').update({ is_trashed: true }).eq('id', prevEventId)
    await supabase.from('contacts').update({ birthday_event_id: null }).eq('id', contact.id)
    await supabase.from('contact_events').delete().eq('event_id', prevEventId)
  }

  if (!contact.birthday) return

  const birthdayCalendar = await ensureBirthdayCalendar(user.id)
  if (!birthdayCalendar?.id) return

  const [, month, day] = contact.birthday.split('-')
  const year    = new Date().getFullYear()
  const dateStr = `${year}-${month}-${day}`
  const title   = `🎂 Cumpleaños de ${contact.first_name}${contact.last_name ? ' ' + contact.last_name : ''}`

  const { data: ev, error: evErr } = await supabase.from('events').insert({
    user_id:     user.id,
    calendar_id: birthdayCalendar.id,
    title,
    description: '',
    is_all_day:  true,
    recurrence:  'yearly',
    recurrence_end: null,
    start_time:  `${dateStr}T00:00:00`,
    end_time:    `${dateStr}T23:59:59`,
    is_trashed:  false,
    contact_id:  contact.id,
  }).select('id').single()

  if (evErr) { console.error('syncBirthdayEvent:', evErr); return }

  await supabase.from('contacts').update({ birthday_event_id: ev.id }).eq('id', contact.id)
  await supabase.from('contact_events').upsert(
    { user_id: user.id, contact_id: contact.id, event_id: ev.id },
    { onConflict: 'contact_id,event_id' }
  )
}

// ─── Modal crear / editar contacto ───────────────────────────────────────────

const EMPTY_FORM = {
  first_name: '', last_name: '', phone: '', email: '',
  notes: '', birthday: '', birthdayInput: '', tagInput: '', tags: [],
}

function ContactModal({ contact, onClose, onSaved }) {
  const [form, setForm] = useState(() => (
    contact
      ? {
          ...EMPTY_FORM,
          ...contact,
          first_name: contact.first_name ?? '',
          last_name: contact.last_name ?? '',
          phone: contact.phone ?? '',
          email: contact.email ?? '',
          notes: contact.notes ?? '',
          birthday: contact.birthday ?? '',
          birthdayInput: isoToDisplayDate(contact.birthday ?? ''),
          tagInput: '',
          tags: Array.isArray(contact.tags) ? contact.tags : [],
        }
      : { ...EMPTY_FORM }
  ))
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  function set(field, val) { setForm(f => ({ ...f, [field]: val })) }

  function handleBirthdayChange(value) {
    const digits = String(value ?? '').replace(/\D/g, '').slice(0, 8)
    const parts = []
    if (digits.slice(0, 2)) parts.push(digits.slice(0, 2))
    if (digits.slice(2, 4)) parts.push(digits.slice(2, 4))
    if (digits.slice(4, 8)) parts.push(digits.slice(4, 8))
    const birthdayInput = parts.join('/')
    const isoBirthday = displayToIsoDate(birthdayInput)
    setForm((f) => ({ ...f, birthdayInput, birthday: isoBirthday || '' }))
  }

  function handleBirthdayBlur() {
    const isoBirthday = displayToIsoDate(form.birthdayInput)
    setForm((f) => ({
      ...f,
      birthdayInput: isoBirthday ? isoToDisplayDate(isoBirthday) : safeTrim(f.birthdayInput),
      birthday: isoBirthday || '',
    }))
  }

  function addTag() {
    const tag = safeTrim(form.tagInput)
    if (!tag || form.tags.includes(tag)) { set('tagInput', ''); return }
    set('tags', [...form.tags, tag])
    set('tagInput', '')
  }
  function removeTag(t) { set('tags', form.tags.filter(x => x !== t)) }

  async function handleSave() {
    if (!safeTrim(form.first_name)) { setError('El nombre es obligatorio.'); return }
    const birthdayIso = displayToIsoDate(form.birthdayInput) || form.birthday || null
    if (safeTrim(form.birthdayInput) && !birthdayIso) { setError('El cumpleaños debe tener formato DD/MM/AAAA.'); return }
    setSaving(true); setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const payload = {
        user_id:    user.id,
        first_name: safeTrim(form.first_name),
        last_name:  safeTrim(form.last_name),
        phone:      safeTrim(form.phone) || null,
        email:      safeTrim(form.email) || null,
        notes:      safeTrim(form.notes) || null,
        birthday:   birthdayIso,
        tags:       Array.isArray(form.tags) ? form.tags : [],
      }

      let saved
      if (contact?.id) {
        const { data, error: err } = await supabase.from('contacts').update(payload).eq('id', contact.id).select().single()
        if (err) throw err
        saved = data
      } else {
        const { data, error: err } = await supabase.from('contacts').insert(payload).select().single()
        if (err) throw err
        saved = data
      }

      // Sincronizar cumpleaños si cambió o es nuevo
      const birthdayChanged = (contact?.birthday ?? null) !== (saved.birthday ?? null)
      const noEventYet = !contact?.birthday_event_id
      if (birthdayChanged || (noEventYet && saved.birthday)) {
        await syncBirthdayEvent(saved, contact?.birthday_event_id ?? null)
      }

      onSaved(saved)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-white font-bold text-base">
            {contact ? 'Editar contacto' : 'Nuevo contacto'}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <IconX />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={sLabel}>Nombre *</label>
              <input className={sInput} value={form.first_name}
                onChange={e => set('first_name', e.target.value)} placeholder="Pedro" />
            </div>
            <div>
              <label className={sLabel}>Apellidos</label>
              <input className={sInput} value={form.last_name}
                onChange={e => set('last_name', e.target.value)} placeholder="García" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={sLabel}>Teléfono</label>
              <input className={sInput} value={form.phone}
                onChange={e => set('phone', e.target.value)} placeholder="+34 600 000 000" />
            </div>
            <div>
              <label className={sLabel}>Email</label>
              <input className={sInput} type="email" value={form.email}
                onChange={e => set('email', e.target.value)} placeholder="pedro@email.com" />
            </div>
          </div>

          <div>
            <label className={sLabel}>Cumpleaños</label>
            <input
              className={sInput}
              type="text"
              inputMode="numeric"
              placeholder="dd/mm/yyyy"
              value={form.birthdayInput}
              onChange={e => handleBirthdayChange(e.target.value)}
              onBlur={handleBirthdayBlur}
            />
            {form.birthday && (
              <p className="text-xs text-slate-500 mt-1">
                {formatBirthdayFull(form.birthday)} · Se creará un evento anual en Cumpleaños
              </p>
            )}
          </div>

          <div>
            <label className={sLabel}>Notas</label>
            <textarea
              className={cx(sInput, 'resize-none')}
              rows={3}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Notas internas…"
            />
          </div>

          <div>
            <label className={sLabel}>Etiquetas</label>
            {form.tags.length > 0 && (
              <div className="flex gap-1.5 mb-2 flex-wrap">
                {form.tags.map(t => (
                  <span key={t} className="flex items-center gap-1 bg-blue-500/15 text-blue-300 border border-blue-500/30 rounded-full px-2.5 py-0.5 text-xs font-medium">
                    {t}
                    <button type="button" onClick={() => removeTag(t)}
                      className="text-blue-400 hover:text-white leading-none">&times;</button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                className={sInput}
                value={form.tagInput}
                onChange={e => set('tagInput', e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                placeholder="Nueva etiqueta + Enter"
              />
              <button type="button" onClick={addTag} className={sBtnSecondary}>Añadir</button>
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700">
          <button type="button" className={sBtnSecondary} onClick={onClose}>Cancelar</button>
          <button type="button" className={sBtnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Panel de detalle ────────────────────────────────────────────────────────

function ContactDetail({ contact, allCards, allEvents, onEdit, onDelete, onClose, onLinkCard, onUnlinkCard, onLinkEvent, onUnlinkEvent }) {
  const linkedCardIds  = useMemo(() => new Set(contact.linked_cards?.map(c => c.card_id)  ?? []), [contact])
  const linkedEventIds = useMemo(() => new Set(contact.linked_events?.map(e => e.event_id) ?? []), [contact])

  const [cardSearch,       setCardSearch]       = useState('')
  const [eventSearch,      setEventSearch]      = useState('')
  const [showCardPicker,   setShowCardPicker]   = useState(false)
  const [showEventPicker,  setShowEventPicker]  = useState(false)

  const filteredCards  = useMemo(() => allCards.filter(c =>
    !linkedCardIds.has(c.id) && (c.title ?? '').toLowerCase().includes(cardSearch.toLowerCase())
  ), [allCards, linkedCardIds, cardSearch])

  const filteredEvents = useMemo(() => allEvents.filter(e =>
    !linkedEventIds.has(e.id) && (e.title ?? '').toLowerCase().includes(eventSearch.toLowerCase())
  ), [allEvents, linkedEventIds, eventSearch])

  const linkedCards  = useMemo(() => allCards.filter(c  => linkedCardIds.has(c.id)),  [allCards,  linkedCardIds])
  const linkedEvents = useMemo(() => allEvents.filter(e => linkedEventIds.has(e.id)), [allEvents, linkedEventIds])

  return (
    <div className="h-full flex flex-col bg-slate-800 border-l border-slate-700">

      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <Avatar first={contact.first_name} last={contact.last_name} size="lg" />
          <div>
            <h2 className="text-white font-bold text-base leading-tight">
              {contact.first_name} {contact.last_name}
            </h2>
            {contact.phone && <p className="text-slate-400 text-xs mt-0.5">{contact.phone}</p>}
            {contact.email && <p className="text-slate-400 text-xs">{contact.email}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => onEdit(contact)}
            className="text-slate-400 hover:text-blue-400 transition-colors p-1.5 rounded-lg hover:bg-slate-700">
            <IconEdit />
          </button>
          <button type="button" onClick={() => onDelete(contact)}
            className="text-slate-400 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-slate-700">
            <IconTrash />
          </button>
          <button type="button" onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-700 md:hidden">
            <IconX />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* Info */}
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Información</h3>
          <div className="space-y-1.5 text-sm">
            {contact.birthday && (
              <div className="flex items-center gap-2 text-slate-300">
                <span className="w-5 text-center">🎂</span>
                <span>{formatBirthdayFull(contact.birthday)}</span>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-2 text-slate-300">
                <span className="w-5 text-center">📞</span>
                <a href={`tel:${contact.phone}`} className="hover:text-blue-400 transition-colors">{contact.phone}</a>
              </div>
            )}
            {contact.email && (
              <div className="flex items-center gap-2 text-slate-300">
                <span className="w-5 text-center">✉️</span>
                <a href={`mailto:${contact.email}`} className="hover:text-blue-400 transition-colors">{contact.email}</a>
              </div>
            )}
            {!contact.birthday && !contact.phone && !contact.email && (
              <p className="text-slate-500 text-xs">Sin datos de contacto.</p>
            )}
          </div>
        </section>

        {/* Etiquetas */}
        {contact.tags?.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Etiquetas</h3>
            <div className="flex flex-wrap gap-1.5">
              {contact.tags.map(t => (
                <span key={t} className="bg-blue-500/15 text-blue-300 border border-blue-500/30 rounded-full px-2.5 py-0.5 text-xs font-medium">
                  {t}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Notas */}
        {contact.notes && (
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Notas</h3>
            <p className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">{contact.notes}</p>
          </section>
        )}

        {/* Tareas Trello */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Tareas ({linkedCards.length})
            </h3>
            <button type="button"
              onClick={() => setShowCardPicker(v => !v)}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium">
              {showCardPicker ? 'Cerrar' : '+ Vincular'}
            </button>
          </div>

          {showCardPicker && (
            <div className="mb-3 bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
              <input
                className="w-full bg-transparent px-3 py-2 text-sm text-white placeholder-slate-500 outline-none border-b border-slate-700"
                placeholder="Buscar tarea…"
                value={cardSearch}
                onChange={e => setCardSearch(e.target.value)}
              />
              <div className="max-h-36 overflow-y-auto">
                {filteredCards.length === 0
                  ? <p className="text-slate-500 text-xs px-3 py-2">Sin resultados</p>
                  : filteredCards.map(c => (
                    <button key={c.id} type="button"
                      onClick={() => { onLinkCard(contact.id, c.id); setShowCardPicker(false); setCardSearch('') }}
                      className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors truncate">
                      {c.title}
                    </button>
                  ))
                }
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            {linkedCards.length === 0
              ? <p className="text-slate-500 text-xs">Sin tareas vinculadas.</p>
              : linkedCards.map(c => (
                <div key={c.id} className="flex items-center justify-between gap-2 bg-slate-700/50 rounded-lg px-3 py-2">
                  <span className="text-sm text-slate-200 truncate flex-1">{c.title}</span>
                  <button type="button" onClick={() => onUnlinkCard(contact.id, c.id)}
                    className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0">
                    <IconX size="sm" />
                  </button>
                </div>
              ))
            }
          </div>
        </section>

        {/* Eventos */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Eventos ({linkedEvents.length})
            </h3>
            <button type="button"
              onClick={() => setShowEventPicker(v => !v)}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium">
              {showEventPicker ? 'Cerrar' : '+ Vincular'}
            </button>
          </div>

          {showEventPicker && (
            <div className="mb-3 bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
              <input
                className="w-full bg-transparent px-3 py-2 text-sm text-white placeholder-slate-500 outline-none border-b border-slate-700"
                placeholder="Buscar evento…"
                value={eventSearch}
                onChange={e => setEventSearch(e.target.value)}
              />
              <div className="max-h-36 overflow-y-auto">
                {filteredEvents.length === 0
                  ? <p className="text-slate-500 text-xs px-3 py-2">Sin resultados</p>
                  : filteredEvents.map(ev => (
                    <button key={ev.id} type="button"
                      onClick={() => { onLinkEvent(contact.id, ev.id); setShowEventPicker(false); setEventSearch('') }}
                      className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors">
                      <span className="block truncate">{ev.title}</span>
                      <span className="text-xs text-slate-500">{formatEventDate(ev.start_time)}</span>
                    </button>
                  ))
                }
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            {linkedEvents.length === 0
              ? <p className="text-slate-500 text-xs">Sin eventos vinculados.</p>
              : linkedEvents.map(ev => (
                <div key={ev.id} className="flex items-center justify-between gap-2 bg-slate-700/50 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate">{ev.title}</p>
                    <p className="text-xs text-slate-500">{formatEventDate(ev.start_time)}</p>
                  </div>
                  <button type="button" onClick={() => onUnlinkEvent(contact.id, ev.id)}
                    className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0">
                    <IconX size="sm" />
                  </button>
                </div>
              ))
            }
          </div>
        </section>
      </div>
    </div>
  )
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function Contacts() {
  const navigate = useNavigate()

  const [user,     setUser]     = useState(null)
  const [contacts, setContacts] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [allCards,  setAllCards]  = useState([])
  const [allEvents, setAllEvents] = useState([])

  const [search,    setSearch]    = useState('')
  const [activeTag, setActiveTag] = useState(null)
  const [selected,  setSelected]  = useState(null)

  const [showModal,      setShowModal]      = useState(false)
  const [editingContact, setEditingContact] = useState(null)
  const [mobileDetail,   setMobileDetail]   = useState(false)

  const allTags = useMemo(() => {
    const s = new Set()
    contacts.forEach(c => c.tags?.forEach(t => s.add(t)))
    return [...s].sort()
  }, [contacts])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return contacts.filter(c => {
      const matchSearch = !q ||
        (c.first_name ?? '').toLowerCase().includes(q) ||
        (c.last_name  ?? '').toLowerCase().includes(q) ||
        c.tags?.some(t => t.toLowerCase().includes(q))
      const matchTag = !activeTag || c.tags?.includes(activeTag)
      return matchSearch && matchTag
    })
  }, [contacts, search, activeTag])

  const grouped = useMemo(() => {
    const sorted = [...filtered].sort((a, b) =>
      `${a.last_name ?? ''} ${a.first_name ?? ''}`.localeCompare(
        `${b.last_name ?? ''} ${b.first_name ?? ''}`, 'es'
      )
    )
    const map = {}
    for (const c of sorted) {
      const letter = ((c.last_name?.[0] ?? c.first_name?.[0]) ?? '#').toUpperCase()
      if (!map[letter]) map[letter] = []
      map[letter].push(c)
    }
    return map
  }, [filtered])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => setUser(u ?? null))
  }, [])

  useEffect(() => {
    if (!user) return
    ensureBirthdayCalendar(user.id).catch((e) => console.error('ensureBirthdayCalendar:', e))
    fetchContacts()
    fetchAllCards()
    fetchAllEvents()
  }, [user])

  useEffect(() => {
    function handler(e) {
      const mods = e.detail?.modules ?? e.detail?.targets ?? []
      if (mods.includes('contacts') || mods.includes('contactos') || mods.includes('all')) {
        fetchContacts()
        fetchAllCards()
        fetchAllEvents()
      }
    }
    window.addEventListener('pedrito:refresh', handler)
    return () => window.removeEventListener('pedrito:refresh', handler)
  }, [user])

  async function fetchContacts() {
    if (!user) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('*, contact_trello_cards(card_id), contact_events(event_id)')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .order('last_name',  { ascending: true })
        .order('first_name', { ascending: true })
      if (error) throw error

      const enriched = (data || []).map(c => ({
        ...c,
        linked_cards:  c.contact_trello_cards ?? [],
        linked_events: c.contact_events       ?? [],
      }))
      setContacts(enriched)

      if (selected) {
        setSelected(enriched.find(c => c.id === selected.id) ?? null)
      }
    } catch (e) {
      console.error('Contacts fetch:', e)
    } finally {
      setLoading(false)
    }
  }

  async function fetchAllCards() {
    if (!user) return
    const { data } = await supabase
      .from('trellos_cards').select('id, title')
      .eq('user_id', user.id).eq('is_trashed', false)
      .order('title', { ascending: true })
    setAllCards(data || [])
  }

  async function fetchAllEvents() {
    if (!user) return
    const { data } = await supabase
      .from('events').select('id, title, start_time')
      .eq('user_id', user.id).eq('is_trashed', false)
      .order('start_time', { ascending: false }).limit(300)
    setAllEvents(data || [])
  }

  function openNew()          { setEditingContact(null);    setShowModal(true) }
  function openEdit(contact)  { setEditingContact(contact); setShowModal(true) }

  async function handleSaved(saved) {
    setShowModal(false)
    await fetchContacts()

    const { data, error } = await supabase
      .from('contacts')
      .select('*, contact_trello_cards(card_id), contact_events(event_id)')
      .eq('id', saved.id)
      .single()

    if (!error && data) {
      setSelected({
        ...data,
        linked_cards: data.contact_trello_cards ?? [],
        linked_events: data.contact_events ?? [],
      })
    } else {
      setSelected({ ...saved, linked_cards: [], linked_events: [] })
    }

    if (window.innerWidth < 768) setMobileDetail(true)
  }

  async function handleDelete(contact) {
    if (!window.confirm(`¿Eliminar a ${contact.first_name} ${contact.last_name}?`)) return
    if (contact.birthday_event_id) {
      await supabase.from('events').update({ is_trashed: true }).eq('id', contact.birthday_event_id)
    }
    await supabase.from('contacts').update({ is_deleted: true }).eq('id', contact.id)
    setSelected(null); setMobileDetail(false)
    fetchContacts()
  }

  async function linkCard(contactId, cardId) {
    await supabase.from('contact_trello_cards').upsert(
      { user_id: user.id, contact_id: contactId, card_id: cardId },
      { onConflict: 'contact_id,card_id' }
    )
    fetchContacts()
  }
  async function unlinkCard(contactId, cardId) {
    await supabase.from('contact_trello_cards').delete()
      .eq('contact_id', contactId).eq('card_id', cardId)
    fetchContacts()
  }
  async function linkEvent(contactId, eventId) {
    await supabase.from('contact_events').upsert(
      { user_id: user.id, contact_id: contactId, event_id: eventId },
      { onConflict: 'contact_id,event_id' }
    )
    fetchContacts()
  }
  async function unlinkEvent(contactId, eventId) {
    await supabase.from('contact_events').delete()
      .eq('contact_id', contactId).eq('event_id', eventId)
    fetchContacts()
  }

  function selectContact(c) {
    setSelected(c)
    if (window.innerWidth < 768) setMobileDetail(true)
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans flex flex-col">

      {/* Top bar */}
      <header className="flex items-center gap-3 px-4 py-3 bg-slate-800 border-b border-slate-700 flex-shrink-0">
        <button type="button" onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm font-medium">
          <IconBack /> pedrOS
        </button>
        <span className="text-slate-700">/</span>
        <span className="text-white font-semibold text-sm">Contactos</span>
        <div className="flex-1" />
        <button type="button" onClick={openNew} className={sBtnPrimary}>+ Nuevo</button>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Lista ── */}
        <div className={cx(
          'flex flex-col border-r border-slate-700 bg-slate-900 w-full md:w-72 lg:w-80 flex-shrink-0',
          mobileDetail ? 'hidden md:flex' : 'flex'
        )}>

          {/* Búsqueda */}
          <div className="px-3 py-3 border-b border-slate-700 space-y-2">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                <IconSearch />
              </span>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nombre o etiqueta…"
                className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-all"
              />
            </div>

            {allTags.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                <button type="button" onClick={() => setActiveTag(null)}
                  className={cx('rounded-full px-2.5 py-0.5 text-xs font-medium transition-all',
                    activeTag === null ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white')}>
                  Todos
                </button>
                {allTags.map(t => (
                  <button key={t} type="button" onClick={() => setActiveTag(t === activeTag ? null : t)}
                    className={cx('rounded-full px-2.5 py-0.5 text-xs font-medium transition-all',
                      activeTag === t ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white')}>
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Contador */}
          <div className="px-4 py-1.5 border-b border-slate-800">
            <p className="text-xs text-slate-600">
              {filtered.length} {filtered.length === 1 ? 'contacto' : 'contactos'}
            </p>
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32 text-slate-500 text-sm">Cargando…</div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-500">
                <span className="text-3xl">👥</span>
                <p className="text-sm">{contacts.length === 0 ? 'Sin contactos aún' : 'Sin resultados'}</p>
                {contacts.length === 0 && (
                  <button type="button" onClick={openNew}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors mt-1">
                    Crear el primero
                  </button>
                )}
              </div>
            ) : (
              Object.entries(grouped).map(([letter, group]) => (
                <div key={letter}>
                  <div className="sticky top-0 bg-slate-900/95 backdrop-blur-sm px-4 py-1 text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 z-10">
                    {letter}
                  </div>
                  {group.map(c => (
                    <button key={c.id} type="button" onClick={() => selectContact(c)}
                      className={cx(
                        'w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-150 border-b border-slate-800/40',
                        selected?.id === c.id ? 'bg-slate-700' : 'hover:bg-slate-800'
                      )}>
                      <Avatar first={c.first_name} last={c.last_name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {c.last_name ? `${c.last_name}, ${c.first_name}` : c.first_name}
                        </p>
                        {c.phone
                          ? <p className="text-xs text-slate-500 truncate">{c.phone}</p>
                          : c.email
                            ? <p className="text-xs text-slate-500 truncate">{c.email}</p>
                            : null}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {c.birthday && (
                          <span className="text-xs" title={`Cumpleaños: ${formatBirthdayFull(c.birthday)}`}>🎂</span>
                        )}
                        {c.tags?.length > 0 && (
                          <span className="text-xs bg-blue-500/20 text-blue-400 rounded-full px-1.5 py-0.5 font-medium">
                            {c.tags.length}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Detalle ── */}
        <div className={cx('flex-1 overflow-hidden', mobileDetail ? 'flex flex-col' : 'hidden md:flex flex-col')}>
          {selected ? (
            <>
              {mobileDetail && (
                <div className="md:hidden px-4 py-2 border-b border-slate-700 bg-slate-800">
                  <button type="button" onClick={() => setMobileDetail(false)}
                    className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors">
                    <IconBack /> Contactos
                  </button>
                </div>
              )}
              <ContactDetail
                contact={selected}
                allCards={allCards}
                allEvents={allEvents}
                onEdit={openEdit}
                onDelete={handleDelete}
                onClose={() => { setSelected(null); setMobileDetail(false) }}
                onLinkCard={linkCard}
                onUnlinkCard={unlinkCard}
                onLinkEvent={linkEvent}
                onUnlinkEvent={unlinkEvent}
              />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-600">
              <span className="text-5xl">👤</span>
              <p className="text-sm">Selecciona un contacto para ver sus detalles</p>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <ContactModal
          contact={editingContact}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
