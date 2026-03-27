import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'

const PANEL = 'bg-slate-800 border border-slate-700 rounded-2xl shadow-lg'
const INPUT = 'w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
const BTN_PRIMARY = 'rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50'
const BTN_SECONDARY = 'rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-slate-600 hover:bg-slate-700'
const BTN_GHOST = 'rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white'
const FILTERS = [
  { value: 'all', label: 'Todo' },
  { value: 'watchlist', label: 'Por ver' },
  { value: 'seen', label: 'Vistas' },
  { value: 'favorites', label: 'Favoritas' },
]

function cx(...classes) {
  return classes.filter(Boolean).join(' ')
}

function formatType(type) {
  return type === 'series' ? 'Serie' : 'Película'
}

function formatStatus(status) {
  return status === 'seen' ? 'Vista' : 'Por ver'
}

function clampStars(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(5, Math.round(n)))
}

function scoreToStars(scoreOutOf10) {
  const n = Number(scoreOutOf10)
  if (!Number.isFinite(n)) return 0
  return clampStars(Math.round(n / 2))
}

function Poster({ src, alt, compact = false }) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={cx(
          'object-cover bg-slate-900',
          compact ? 'h-16 w-12 rounded-lg' : 'h-64 w-full rounded-t-2xl'
        )}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    )
  }

  return (
    <div className={cx(
      'flex items-center justify-center bg-slate-900 text-slate-500',
      compact ? 'h-16 w-12 rounded-lg text-xs' : 'h-64 w-full rounded-t-2xl text-sm'
    )}>
      Sin póster
    </div>
  )
}

function StarRating({ value, onChange, readOnly = false, size = 'md' }) {
  const iconClass = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(star)}
          className={cx(readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110', 'transition-transform')}
          aria-label={`${star} estrellas`}
        >
          <svg
            className={cx(iconClass, star <= value ? 'text-amber-400' : 'text-slate-600')}
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
          </svg>
        </button>
      ))}
    </div>
  )
}

function HeartButton({ active, onClick, small = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'inline-flex items-center justify-center rounded-full transition-colors',
        small ? 'h-8 w-8' : 'h-10 w-10',
        active ? 'bg-rose-500/15 text-rose-400' : 'bg-slate-900/70 text-slate-500 hover:text-rose-400'
      )}
      aria-label={active ? 'Quitar de favoritas' : 'Marcar como favorita'}
    >
      <svg className={small ? 'w-4 h-4' : 'w-5 h-5'} viewBox="0 0 24 24" fill="currentColor">
        <path d="m12 21.35-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09A6 6 0 0 1 16.5 3C19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54z" />
      </svg>
    </button>
  )
}

function MediaModal({ open, item, onClose, onSave }) {
  const [title, setTitle] = useState('')
  const [mediaType, setMediaType] = useState('movie')
  const [status, setStatus] = useState('watchlist')
  const [isFavorite, setIsFavorite] = useState(false)
  const [ratingStars, setRatingStars] = useState(0)
  const [enrich, setEnrich] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setTitle(item?.title || '')
    setMediaType(item?.media_type || 'movie')
    setStatus(item?.status || 'watchlist')
    setIsFavorite(!!item?.is_favorite)
    setRatingStars(clampStars(item?.rating_stars || 0))
    setEnrich(!item)
    setSaving(false)
    setError('')
  }, [open, item])

  if (!open) return null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) {
      setError('El título es obligatorio.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave({
        id: item?.id || null,
        title: title.trim(),
        media_type: mediaType,
        status,
        is_favorite: isFavorite,
        rating_stars: ratingStars,
        enrich,
      })
    } catch (err) {
      setError(err.message || 'No se pudo guardar.')
      setSaving(false)
      return
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-xl rounded-t-3xl border border-slate-700 bg-slate-800 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
          <h2 className="text-lg font-bold text-white">{item ? 'Editar' : 'Añadir'} película o serie</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Título</label>
            <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dune, Interstellar, The Bear..." autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Tipo</label>
              <select className={INPUT} value={mediaType} onChange={(e) => setMediaType(e.target.value)}>
                <option value="movie">Película</option>
                <option value="series">Serie</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Estado</label>
              <select className={INPUT} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="watchlist">Por ver</option>
                <option value="seen">Vista</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">Favorita</p>
              <p className="text-xs text-slate-500">Se podrá filtrar con el corazón</p>
            </div>
            <HeartButton active={isFavorite} onClick={() => setIsFavorite((v) => !v)} />
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3">
            <p className="mb-2 text-sm font-semibold text-white">Valoración</p>
            <StarRating value={ratingStars} onChange={setRatingStars} />
          </div>

          <label className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-300">
            <input type="checkbox" checked={enrich} onChange={(e) => setEnrich(e.target.checked)} className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-500" />
            Buscar automáticamente póster y sinopsis en TMDb
          </label>

          {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>Cancelar</button>
            <button type="submit" disabled={saving} className={BTN_PRIMARY}>{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function MediaCard({ item, onToggleFavorite, onStatus, onRate, onEdit, onDelete }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-800 shadow-lg">
      <div className="relative">
        <Poster src={item.poster_url} alt={item.title} />
        <div className="absolute right-3 top-3">
          <HeartButton active={item.is_favorite} onClick={() => onToggleFavorite(item)} />
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="line-clamp-2 text-base font-bold text-white">{item.title}</h3>
              <p className="mt-1 text-xs text-slate-400">
                {formatType(item.media_type)}{item.release_year ? ` · ${item.release_year}` : ''}
              </p>
            </div>
            <span className={cx(
              'rounded-full px-2.5 py-1 text-xs font-semibold',
              item.status === 'seen' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'
            )}>
              {formatStatus(item.status)}
            </span>
          </div>
        </div>

        <StarRating value={item.rating_stars || 0} onChange={(stars) => onRate(item, stars)} />

        <p className="line-clamp-4 text-sm leading-relaxed text-slate-300">
          {item.overview || 'Sin sinopsis todavía.'}
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={() => onStatus(item, item.status === 'seen' ? 'watchlist' : 'seen')} className={BTN_SECONDARY}>
            {item.status === 'seen' ? 'Pasar a por ver' : 'Marcar vista'}
          </button>
          <button type="button" onClick={() => onEdit(item)} className={BTN_GHOST}>Editar</button>
          <button type="button" onClick={() => onDelete(item)} className="rounded-xl px-3 py-2 text-sm font-semibold text-red-400 hover:bg-red-500/10">Eliminar</button>
        </div>
      </div>
    </article>
  )
}

function MediaRow({ item, onToggleFavorite, onStatus, onRate, onEdit, onDelete }) {
  return (
    <article className="flex gap-3 rounded-2xl border border-slate-700 bg-slate-800 p-3 shadow-lg">
      <Poster src={item.poster_url} alt={item.title} compact />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-white">{item.title}</h3>
            <p className="mt-0.5 text-xs text-slate-400">{formatType(item.media_type)}{item.release_year ? ` · ${item.release_year}` : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <HeartButton active={item.is_favorite} onClick={() => onToggleFavorite(item)} small />
            <span className={cx('rounded-full px-2 py-1 text-[11px] font-semibold', item.status === 'seen' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300')}>
              {formatStatus(item.status)}
            </span>
          </div>
        </div>
        <p className="mt-2 line-clamp-2 text-sm text-slate-300">{item.overview || 'Sin sinopsis todavía.'}</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <StarRating value={item.rating_stars || 0} onChange={(stars) => onRate(item, stars)} size="sm" />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onStatus(item, item.status === 'seen' ? 'watchlist' : 'seen')} className={BTN_GHOST}>
              {item.status === 'seen' ? 'Por ver' : 'Vista'}
            </button>
            <button type="button" onClick={() => onEdit(item)} className={BTN_GHOST}>Editar</button>
            <button type="button" onClick={() => onDelete(item)} className="rounded-xl px-3 py-2 text-sm font-semibold text-red-400 hover:bg-red-500/10">Eliminar</button>
          </div>
        </div>
      </div>
    </article>
  )
}

export default function Movies() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [view, setView] = useState('grid')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fetchItems = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser()
    const authUser = auth?.user ?? null
    setUser(authUser)
    if (!authUser) {
      setItems([])
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('media_items')
      .select('*')
      .eq('user_id', authUser.id)
      .eq('is_deleted', false)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })

    if (fetchError) {
      console.error('Movies fetch:', fetchError)
      setItems([])
    } else {
      setItems(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  useEffect(() => {
    function handler(event) {
      const mods = event.detail?.targets ?? event.detail?.modules ?? []
      if (mods.includes('all') || mods.includes('media') || mods.includes('movies') || mods.includes('peliculas')) {
        fetchItems()
      }
    }

    window.addEventListener('pedrito:refresh', handler)
    return () => window.removeEventListener('pedrito:refresh', handler)
  }, [fetchItems])

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      const matchesQuery = !q || item.title?.toLowerCase().includes(q) || item.original_title?.toLowerCase().includes(q)
      const matchesFilter =
        filter === 'all' ? true :
        filter === 'favorites' ? !!item.is_favorite :
        item.status === filter
      return matchesQuery && matchesFilter
    })
  }, [items, query, filter])

  async function enrichFromTMDb(title, mediaType) {
    const { data, error: edgeError } = await supabase.functions.invoke('media-search', {
      body: {
        query: title,
        mediaType,
      },
    })

    if (edgeError) throw new Error(edgeError.message || 'No se pudo consultar TMDb.')
    return data
  }

  async function saveItem(payload) {
    if (!user) throw new Error('Sesión no disponible.')
    setSaving(true)
    setError('')
    try {
      let enriched = null
      if (payload.enrich) {
        try {
          enriched = await enrichFromTMDb(payload.title, payload.media_type)
        } catch (err) {
          console.warn('TMDb enrich fallback:', err)
        }
      }

      const dbPayload = {
        user_id: user.id,
        title: payload.title,
        media_type: payload.media_type,
        status: payload.status,
        is_favorite: !!payload.is_favorite,
        rating_stars: clampStars(payload.rating_stars || 0),
        overview: enriched?.overview || editingItem?.overview || null,
        poster_url: enriched?.poster_url || editingItem?.poster_url || null,
        tmdb_id: enriched?.tmdb_id || editingItem?.tmdb_id || null,
        external_source: enriched?.external_source || editingItem?.external_source || 'manual',
        original_title: enriched?.original_title || editingItem?.original_title || null,
        release_year: enriched?.release_year || editingItem?.release_year || null,
        search_title: payload.title.toLowerCase(),
        is_deleted: false,
      }

      if (payload.id) {
        const { error: updateError } = await supabase
          .from('media_items')
          .update(dbPayload)
          .eq('id', payload.id)
        if (updateError) throw updateError
      } else {
        const { data: existingItem, error: existingError } = await supabase
          .from('media_items')
          .select('id')
          .eq('search_title', dbPayload.search_title)
          .eq('media_type', dbPayload.media_type)
          .eq('is_deleted', false)
          .maybeSingle()

        if (existingError) throw existingError

        if (existingItem?.id) {
          const { error: updateExistingError } = await supabase
            .from('media_items')
            .update(dbPayload)
            .eq('id', existingItem.id)

          if (updateExistingError) throw updateExistingError
        } else {
          const { error: insertError } = await supabase
            .from('media_items')
            .insert(dbPayload)

          if (insertError) throw insertError
        }
      }

      setModalOpen(false)
      setEditingItem(null)
      await fetchItems()
    } finally {
      setSaving(false)
    }
  }

  async function patchItem(itemId, patch) {
    const { error: updateError } = await supabase
      .from('media_items')
      .update(patch)
      .eq('id', itemId)
    if (updateError) {
      console.error(updateError)
      return
    }
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, ...patch } : item)))
  }

  async function handleDelete(item) {
    if (!window.confirm(`¿Eliminar "${item.title}"?`)) return
    await patchItem(item.id, { is_deleted: true })
    setItems((prev) => prev.filter((entry) => entry.id !== item.id))
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">
        <div className="flex items-center gap-3 text-slate-400">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-blue-500" />
          Cargando películas…
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 px-4 py-6 text-white sm:px-6 lg:px-8">
      <header className={cx(PANEL, 'mb-6 flex items-center justify-between gap-4 p-4')}>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('/')} className="rounded-xl p-2 text-slate-400 hover:bg-slate-700 hover:text-white">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" /></svg>
          </button>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">Películas y series</h1>
            <p className="text-sm text-slate-400">Tu biblioteca personal en pedrOS</p>
          </div>
        </div>
        <button type="button" onClick={() => { setEditingItem(null); setModalOpen(true) }} className={BTN_PRIMARY}>Añadir</button>
      </header>

      <section className={cx(PANEL, 'mb-6 p-4')}>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div>
            <input className={INPUT} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por título…" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((entry) => (
              <button
                key={entry.value}
                type="button"
                onClick={() => setFilter(entry.value)}
                className={cx(
                  'rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
                  filter === entry.value ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-700'
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setView('grid')} className={cx(BTN_SECONDARY, view === 'grid' && 'border-blue-500 text-white')}>Tarjetas</button>
            <button type="button" onClick={() => setView('list')} className={cx(BTN_SECONDARY, view === 'list' && 'border-blue-500 text-white')}>Lista</button>
          </div>
        </div>
      </section>

      {error && <p className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      {!filteredItems.length ? (
        <section className={cx(PANEL, 'p-12 text-center')}>
          <p className="text-4xl">🎬</p>
          <p className="mt-3 text-slate-300">No hay resultados en esta vista.</p>
          <p className="mt-1 text-sm text-slate-500">Añade una película o serie y pedrOS intentará completar póster y sinopsis automáticamente.</p>
        </section>
      ) : view === 'grid' ? (
        <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredItems.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              onToggleFavorite={(entry) => patchItem(entry.id, { is_favorite: !entry.is_favorite })}
              onStatus={(entry, next) => patchItem(entry.id, { status: next })}
              onRate={(entry, stars) => patchItem(entry.id, { rating_stars: clampStars(stars) })}
              onEdit={(entry) => { setEditingItem(entry); setModalOpen(true) }}
              onDelete={handleDelete}
            />
          ))}
        </section>
      ) : (
        <section className="space-y-3">
          {filteredItems.map((item) => (
            <MediaRow
              key={item.id}
              item={item}
              onToggleFavorite={(entry) => patchItem(entry.id, { is_favorite: !entry.is_favorite })}
              onStatus={(entry, next) => patchItem(entry.id, { status: next })}
              onRate={(entry, stars) => patchItem(entry.id, { rating_stars: clampStars(stars) })}
              onEdit={(entry) => { setEditingItem(entry); setModalOpen(true) }}
              onDelete={handleDelete}
            />
          ))}
        </section>
      )}

      <MediaModal
        open={modalOpen}
        item={editingItem}
        onClose={() => {
          if (saving) return
          setModalOpen(false)
          setEditingItem(null)
        }}
        onSave={saveItem}
      />
    </div>
  )
}
