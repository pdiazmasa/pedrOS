import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'

// ─── Helpers ──────────────────────────────────────────────────
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ─── Icons ────────────────────────────────────────────────────
const Ic = ({ d, className }) => (
  <svg className={className ?? 'w-5 h-5'} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
)
const IArrow  = (p) => <Ic {...p} d="M15 19l-7-7 7-7" />
const IEye    = (p) => <Ic {...p} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
const IEyeOff = (p) => <Ic {...p} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
const IPlus   = (p) => <Ic {...p} d="M12 4v16m8-8H4" />
const ITrash  = (p) => <Ic {...p} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0a1 1 0 011-1h4a1 1 0 011 1m-6 0h6" />
const IEdit   = (p) => <Ic {...p} d="M15.232 5.232l3.536 3.536M9 13l6.5-6.5a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H8v-2.414a2 2 0 01.586-1.414z" />
const ICopy   = (p) => <Ic {...p} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
const ILock   = (p) => <Ic {...p} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
const ILoader = (p) => <Ic {...p} d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
const IKey    = (p) => <Ic {...p} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />

// ─── Shared input style ────────────────────────────────────────
const inp = 'w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-sm'

// ─── Copy to clipboard with feedback ──────────────────────────
function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button
      type="button"
      onClick={copy}
      className={`p-2 rounded-lg transition-all ${copied ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white'}`}
      title="Copiar"
    >
      <ICopy className="w-4 h-4" />
    </button>
  )
}

// ─── Password entry card ───────────────────────────────────────
function EntryCard({ entry, onEdit, onDelete }) {
  const [showPwd, setShowPwd] = useState(false)

  return (
    <div className="bg-slate-800 border border-slate-700 hover:border-emerald-700/50 rounded-2xl p-5 transition-all duration-200 group">
      {/* Service */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-900/40 border border-emerald-800/60 flex items-center justify-center flex-shrink-0">
            <IKey className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="font-bold text-white text-base truncate">{entry.service}</p>
        </div>
        <div className="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(entry)} className="p-1.5 rounded-lg text-slate-500 hover:text-yellow-400 hover:bg-yellow-500/10 transition-all" title="Editar">
            <IEdit className="w-4 h-4" />
          </button>
          <button onClick={() => onDelete(entry.id)} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all" title="Eliminar">
            <ITrash className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Email */}
      {entry.email && (
        <div className="mb-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1 font-semibold">Email / Usuario</p>
          <div className="flex items-center gap-2">
            <p className="text-slate-300 text-sm flex-1 truncate font-mono">{entry.email}</p>
            <CopyBtn text={entry.email} />
          </div>
        </div>
      )}

      {/* Password */}
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1 font-semibold">Contraseña</p>
        <div className="flex items-center gap-2">
          <p className="text-slate-300 text-sm flex-1 font-mono tracking-wider break-all">
            {showPwd ? entry.password : '••••••••••••'}
          </p>
          <button
            type="button"
            onClick={() => setShowPwd(!showPwd)}
            className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white transition-all flex-shrink-0"
            title={showPwd ? 'Ocultar' : 'Mostrar'}
          >
            {showPwd ? <IEyeOff className="w-4 h-4" /> : <IEye className="w-4 h-4" />}
          </button>
          <CopyBtn text={entry.password} />
        </div>
      </div>
    </div>
  )
}

// ─── Add / Edit Modal ──────────────────────────────────────────
function EntryModal({ entry, onSave, onClose }) {
  const isEdit = !!entry
  const [service,  setService]  = useState(entry?.service  ?? '')
  const [email,    setEmail]    = useState(entry?.email    ?? '')
  const [password, setPassword] = useState(entry?.password ?? '')
  const [showPwd,  setShowPwd]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [err,      setErr]      = useState('')

  async function handleSave() {
    setErr('')
    if (!service.trim()) return setErr('El nombre del servicio es obligatorio.')
    if (!password.trim()) return setErr('La contraseña no puede estar vacía.')
    setSaving(true)
    await onSave({ service: service.trim(), email: email.trim(), password: password.trim() }, entry?.id)
    setSaving(false)
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-800 border border-slate-700 rounded-t-3xl sm:rounded-2xl p-6 w-full sm:max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-white text-lg">{isEdit ? 'Editar entrada' : 'Nueva entrada'}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none transition-colors">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Servicio *</label>
            <input className={inp} placeholder="Google, Netflix, GitHub..." value={service} onChange={e => setService(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Email / Usuario</label>
            <input className={inp} type="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Contraseña *</label>
            <div className="relative">
              <input
                className={`${inp} pr-12`}
                type={showPwd ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
              >
                {showPwd ? <IEyeOff className="w-5 h-5" /> : <IEye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {err && <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold transition-all text-sm">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all text-sm disabled:opacity-50">
              {saving ? 'Guardando...' : isEdit ? 'Guardar' : 'Añadir'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Master password gate ──────────────────────────────────────
function MasterGate({ userId, onUnlock }) {
  const [hasMaster, setHasMaster]   = useState(null)  // null=loading, true/false
  const [masterInput, setMasterInput] = useState('')
  const [masterConfirm, setMasterConfirm] = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    supabase.from('vault_master').select('hash').eq('user_id', userId).single()
      .then(({ data }) => setHasMaster(!!data))
  }, [userId])

  async function handleUnlock(e) {
    e.preventDefault()
    if (!masterInput) return setError('Introduce la contraseña maestra.')
    setLoading(true); setError('')
    const { data } = await supabase.from('vault_master').select('hash').eq('user_id', userId).single()
    const hash = await sha256(masterInput)
    if (hash === data?.hash) {
      onUnlock()
    } else {
      setError('Contraseña incorrecta.')
    }
    setLoading(false)
  }

  async function handleSetup(e) {
    e.preventDefault()
    if (masterInput.length < 4) return setError('Mínimo 4 caracteres.')
    if (masterInput !== masterConfirm) return setError('Las contraseñas no coinciden.')
    setLoading(true); setError('')
    const hash = await sha256(masterInput)
    const { error: err } = await supabase.from('vault_master')
      .upsert({ user_id: userId, hash }, { onConflict: 'user_id' })
    if (err) { setError(err.message); setLoading(false); return }
    onUnlock()
    setLoading(false)
  }

  if (hasMaster === null) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <ILoader className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4 text-emerald-500 font-mono">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-emerald-900/40 border border-emerald-800/60 flex items-center justify-center mx-auto mb-4">
            <ILock className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-black tracking-widest uppercase text-emerald-400">Bóveda 007</h1>
          <p className="text-emerald-800 text-sm mt-2">
            {hasMaster ? 'Introduce tu contraseña maestra para acceder' : 'Configura tu contraseña maestra'}
          </p>
        </div>

        <form onSubmit={hasMaster ? handleUnlock : handleSetup} className="space-y-4">
          <div className="relative">
            <input
              className="w-full px-4 py-3 rounded-xl bg-emerald-950/20 border border-emerald-900/60 text-emerald-300 placeholder-emerald-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all text-center text-xl tracking-widest font-mono"
              type={showPwd ? 'text' : 'password'}
              placeholder="••••••••"
              value={masterInput}
              onChange={e => setMasterInput(e.target.value)}
              autoFocus
            />
            <button type="button" onClick={() => setShowPwd(!showPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-800 hover:text-emerald-500 transition-colors">
              {showPwd ? <IEyeOff className="w-5 h-5" /> : <IEye className="w-5 h-5" />}
            </button>
          </div>

          {!hasMaster && (
            <input
              className="w-full px-4 py-3 rounded-xl bg-emerald-950/20 border border-emerald-900/60 text-emerald-300 placeholder-emerald-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all text-center text-xl tracking-widest font-mono"
              type="password"
              placeholder="Confirmar ••••••••"
              value={masterConfirm}
              onChange={e => setMasterConfirm(e.target.value)}
            />
          )}

          {error && (
            <p className="text-red-400 text-xs text-center bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm tracking-widest uppercase transition-all disabled:opacity-50"
          >
            {loading ? '...' : hasMaster ? 'Desbloquear' : 'Crear bóveda'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function Passwords() {
  const navigate = useNavigate()

  const [user,      setUser]      = useState(null)
  const [unlocked,  setUnlocked]  = useState(false)
  const [entries,   setEntries]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState(null)   // null | 'add' | entry object
  const [search,    setSearch]    = useState('')

  // Auth
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => setUser(u ?? null))
  }, [])

  // Load entries when unlocked
  useEffect(() => {
    if (!unlocked || !user) return
    setLoading(true)
    supabase.from('vault_entries').select('*').eq('user_id', user.id).order('service')
      .then(({ data }) => { setEntries(data ?? []); setLoading(false) })
  }, [unlocked, user])

  async function handleSave(fields, id) {
    if (id) {
      const { error } = await supabase.from('vault_entries').update(fields).eq('id', id)
      if (!error) setEntries(prev => prev.map(e => e.id === id ? { ...e, ...fields } : e))
    } else {
      const { data, error } = await supabase.from('vault_entries')
        .insert({ ...fields, user_id: user.id }).select().single()
      if (!error) setEntries(prev => [...prev, data].sort((a,b) => a.service.localeCompare(b.service)))
    }
    setModal(null)
  }

  async function handleDelete(id) {
    if (!window.confirm('¿Eliminar esta entrada?')) return
    await supabase.from('vault_entries').delete().eq('id', id)
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const filtered = entries.filter(e =>
    e.service.toLowerCase().includes(search.toLowerCase()) ||
    e.email.toLowerCase().includes(search.toLowerCase())
  )

  if (!user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <ILoader className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    )
  }

  if (!unlocked) {
    return <MasterGate userId={user.id} onUnlock={() => setUnlocked(true)} />
  }

  return (
    <div className="min-h-screen bg-black text-white font-mono selection:bg-emerald-500 selection:text-black">

      {/* Header */}
      <header className="sticky top-0 z-20 bg-black/95 backdrop-blur-sm border-b border-emerald-900/50 px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-emerald-700 hover:text-emerald-500 transition-colors"
            aria-label="Volver"
          >
            <IArrow className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-black tracking-widest uppercase text-emerald-500 flex items-center gap-2">
            <ILock className="w-5 h-5" /> Bóveda 007
          </h1>
          <button
            type="button"
            onClick={() => setModal('add')}
            className="w-9 h-9 rounded-xl bg-emerald-900/40 hover:bg-emerald-800/60 border border-emerald-800/60 flex items-center justify-center text-emerald-400 hover:text-emerald-300 transition-all"
            aria-label="Añadir"
          >
            <IPlus className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <input
          className="w-full px-4 py-2.5 rounded-xl bg-emerald-950/20 border border-emerald-900/50 text-emerald-300 placeholder-emerald-900 focus:outline-none focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700 transition-all text-sm"
          placeholder="Buscar por servicio o email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </header>

      {/* Content */}
      <main className="px-4 py-5 sm:px-6 max-w-3xl mx-auto pb-24">
        {/* Counter */}
        <p className="text-emerald-900 text-xs mb-4 font-semibold uppercase tracking-widest">
          {filtered.length} entrada{filtered.length !== 1 ? 's' : ''}
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-emerald-800">
            <ILoader className="w-7 h-7 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-emerald-900">
            <IKey className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">{search ? 'Sin resultados.' : 'La bóveda está vacía.'}</p>
            {!search && (
              <button
                onClick={() => setModal('add')}
                className="mt-4 px-5 py-2.5 rounded-xl bg-emerald-900/40 hover:bg-emerald-800/60 border border-emerald-800/60 text-emerald-400 font-bold text-sm transition-all"
              >
                Añadir primera entrada
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(entry => (
              <EntryCard
                key={entry.id}
                entry={entry}
                onEdit={e => setModal(e)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>

      {/* FAB on mobile */}
      <button
        type="button"
        onClick={() => setModal('add')}
        className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/50 flex items-center justify-center transition-all active:scale-95 sm:hidden"
        aria-label="Añadir contraseña"
      >
        <IPlus className="w-6 h-6" />
      </button>

      {/* Modal */}
      {modal && (
        <EntryModal
          entry={modal === 'add' ? null : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
