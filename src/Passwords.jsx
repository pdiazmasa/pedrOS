/**
 * pedrOS · Bóveda 007
 *
 * SEGURIDAD REAL:
 *  · La contraseña maestra NUNCA sale del navegador.
 *  · Se deriva una clave AES-256-GCM con PBKDF2 (310 000 iteraciones, SHA-256).
 *  · Cada campo sensible (email + contraseña) se cifra individualmente con un
 *    IV aleatorio de 12 bytes antes de enviarse a Supabase.
 *  · Supabase solo almacena texto cifrado en Base64 — sin la clave maestra
 *    es computacionalmente imposible de leer.
 *  · El hash de verificación de la clave maestra se almacena en vault_master
 *    como SHA-256(salt + master) para poder validarla sin guardarla.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'

// ═══════════════════════════════════════════════════════════════
// CRYPTO ENGINE (Web Crypto API — nativa del navegador, sin libs)
// ═══════════════════════════════════════════════════════════════
//
// DISEÑO DE SEGURIDAD:
//  · El salt se genera UNA VEZ y se guarda en Supabase (vault_master.salt).
//  · Así el mismo salt se usa en local, en producción y en cualquier
//    dispositivo — nunca más depende de localStorage.
//  · El hash de verificación es SHA-256(salt + password) en Base64.
//  · La clave AES se deriva con PBKDF2(password, salt, 310000 iter).
//  · Nada de esto sale del navegador hacia Supabase salvo el hash y el salt.
// ═══════════════════════════════════════════════════════════════

const PBKDF2_ITERATIONS = 310_000

/** Buffer ↔ Base64 helpers */
function bufToB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}
function b64ToBuf(b64) {
  const bin = atob(b64)
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}

const enc = new TextEncoder()
const dec = new TextDecoder()

/** Genera un nuevo salt aleatorio de 32 bytes (Base64) */
function generateSalt() {
  return bufToB64(crypto.getRandomValues(new Uint8Array(32)))
}

/**
 * Deriva una CryptoKey AES-256-GCM desde la contraseña maestra + salt.
 * @param {string} masterPassword
 * @param {string} saltB64 — salt en Base64, obtenido desde Supabase
 */
async function deriveKey(masterPassword, saltB64) {
  const salt = b64ToBuf(saltB64)
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(masterPassword), 'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Cifra un string con AES-256-GCM.
 * Devuelve "ivB64:ciphertextB64"
 */
async function encrypt(text, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(text)
  )
  return `${bufToB64(iv)}:${bufToB64(cipher)}`
}

/**
 * Descifra un string cifrado con encrypt().
 * Si la clave es incorrecta o el texto es legacy (sin cifrar), devuelve el texto tal cual.
 */
async function decrypt(ciphertext, key) {
  if (!ciphertext) return ''
  try {
    if (ciphertext.includes(':')) {
      const [ivB64, dataB64] = ciphertext.split(':')
      const iv    = b64ToBuf(ivB64)
      const data  = b64ToBuf(dataB64)
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
      return dec.decode(plain)
    }
    return ciphertext // legacy plaintext
  } catch {
    return ciphertext // fallback: return as-is
  }
}

/**
 * Genera el hash de verificación.
 * SHA-256(salt_bytes + password_bytes) → Base64
 */
async function hashForVerification(masterPassword, saltB64) {
  const salt = b64ToBuf(saltB64)
  const data = new Uint8Array([...salt, ...enc.encode(masterPassword)])
  const hash = await crypto.subtle.digest('SHA-256', data)
  return bufToB64(hash)
}

/**
 * Hash legacy v1: SHA-256(password) en hexadecimal.
 * Solo para migrar usuarios que crearon la bóveda antes de esta versión.
 */
async function hashLegacy(masterPassword) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(masterPassword))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Hash legacy v2: SHA-256(localStorage_salt + password) en Base64.
 * Para migrar usuarios que usaron el salt de localStorage.
 * Solo funciona si el salt todavía está en localStorage del mismo navegador.
 */
async function hashLegacyLocalStorage(masterPassword) {
  const stored = localStorage.getItem('pedros_vault_salt')
  if (!stored) return null
  const salt = b64ToBuf(stored)
  const data = new Uint8Array([...salt, ...enc.encode(masterPassword)])
  const hash = await crypto.subtle.digest('SHA-256', data)
  return bufToB64(hash)
}

// ═══════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════
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
const IShield = (p) => <Ic {...p} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
const ILoader = (p) => <Ic {...p} d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
const IKey    = (p) => <Ic {...p} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
const IFolder = (p) => <Ic {...p} d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
const IChevR  = (p) => <Ic {...p} d="M9 5l7 7-7 7" />

// ─── Shared styles ─────────────────────────────────────────────
const inp = 'w-full px-4 py-3 rounded-xl bg-slate-900 border border-emerald-900/50 text-white placeholder-emerald-900/60 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all text-sm'

// ═══════════════════════════════════════════════════════════════
// COPY BUTTON
// ═══════════════════════════════════════════════════════════════
function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!text) return
    try {
      // Primary: modern clipboard API
      await navigator.clipboard.writeText(text)
    } catch {
      // Fallback for browsers/contexts that block clipboard API
      const el = document.createElement('textarea')
      el.value = text
      el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0'
      document.body.appendChild(el)
      el.focus()
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? '¡Copiado!' : 'Copiar'}
      className={`p-2 rounded-lg transition-all duration-200 flex-shrink-0 ${
        copied
          ? 'bg-emerald-500/25 text-emerald-400 scale-110'
          : 'bg-slate-700/50 hover:bg-slate-700 text-slate-500 hover:text-white'
      }`}
    >
      {copied
        ? (
          // Checkmark when copied
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )
        : <ICopy className="w-4 h-4" />
      }
    </button>
  )
}

// ═══════════════════════════════════════════════════════════════
// ASYNC COPY BUTTON (decrypts on demand before copying)
// ═══════════════════════════════════════════════════════════════
function AsyncCopyBtn({ getTextFn }) {
  const [state, setState] = useState('idle') // idle | copying | done

  async function copy() {
    if (state !== 'idle') return
    setState('copying')
    try {
      const text = await getTextFn()
      if (!text) { setState('idle'); return }
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        const el = document.createElement('textarea')
        el.value = text
        el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0'
        document.body.appendChild(el)
        el.focus(); el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
      }
      setState('done')
      setTimeout(() => setState('idle'), 2000)
    } catch {
      setState('idle')
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={state === 'done' ? '¡Copiado!' : 'Copiar'}
      className={`p-2 rounded-lg transition-all duration-200 flex-shrink-0 ${
        state === 'done'
          ? 'bg-emerald-500/25 text-emerald-400 scale-110'
          : 'bg-slate-700/50 hover:bg-slate-700 text-slate-500 hover:text-white'
      }`}
    >
      {state === 'copying' ? (
        <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4" />
        </svg>
      ) : state === 'done' ? (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <ICopy className="w-4 h-4" />
      )}
    </button>
  )
}

// ═══════════════════════════════════════════════════════════════
// ENTRY CARD
// ═══════════════════════════════════════════════════════════════
function EntryCard({ entry, cryptoKey, onEdit, onDelete }) {
  const [showPwd,    setShowPwd]    = useState(false)
  const [plainEmail, setPlainEmail] = useState(null)
  const [plainPwd,   setPlainPwd]   = useState(null)
  const [decrypting, setDecrypting] = useState(false)

  // Decrypt on demand when user reveals password
  async function revealPassword() {
    if (showPwd) { setShowPwd(false); return }
    if (plainPwd !== null) { setShowPwd(true); return }
    setDecrypting(true)
    const [em, pw] = await Promise.all([
      entry.email    ? decrypt(entry.email,    cryptoKey) : Promise.resolve(''),
      entry.password ? decrypt(entry.password, cryptoKey) : Promise.resolve(''),
    ])
    setPlainEmail(em)
    setPlainPwd(pw)
    setShowPwd(true)
    setDecrypting(false)
  }

  // Decrypt email for copy (without showing password)
  async function getPlainEmail() {
    if (plainEmail !== null) return plainEmail
    const em = await decrypt(entry.email, cryptoKey)
    setPlainEmail(em)
    return em
  }

  return (
    <div className="bg-slate-900/80 border border-emerald-900/30 hover:border-emerald-700/50 rounded-2xl p-5 transition-all duration-200 group">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-900/40 border border-emerald-800/40 flex items-center justify-center flex-shrink-0">
            <IKey className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="font-bold text-white text-base truncate">{entry.service}</p>
        </div>
        <div className="flex gap-1 flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(entry)}
            className="p-1.5 rounded-lg text-slate-600 hover:text-yellow-400 hover:bg-yellow-500/10 transition-all"
            title="Editar"
          >
            <IEdit className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(entry.id)}
            className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
            title="Eliminar"
          >
            <ITrash className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Email */}
      {entry.email && (
        <div className="mb-3">
          <p className="text-xs text-emerald-900 uppercase tracking-wide mb-1 font-semibold">Email / Usuario</p>
          <div className="flex items-center gap-2">
            <p className="text-slate-400 text-sm flex-1 truncate font-mono">
              {showPwd && plainEmail !== null ? plainEmail : '••••••••••@••••••'}
            </p>
            <AsyncCopyBtn getTextFn={() =>
              plainEmail !== null
                ? Promise.resolve(plainEmail)
                : decrypt(entry.email, cryptoKey).then(v => { setPlainEmail(v); return v ?? '' })
            } />
          </div>
        </div>
      )}

      {/* Password */}
      <div>
        <p className="text-xs text-emerald-900 uppercase tracking-wide mb-1 font-semibold">Contraseña</p>
        <div className="flex items-center gap-2">
          <p className="text-slate-300 text-sm flex-1 font-mono tracking-wider break-all">
            {showPwd && plainPwd !== null ? plainPwd : '••••••••••••'}
          </p>
          <button
            type="button"
            onClick={revealPassword}
            disabled={decrypting}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-500 hover:text-emerald-400 transition-all flex-shrink-0"
            title={showPwd ? 'Ocultar' : 'Mostrar'}
          >
            {decrypting
              ? <ILoader className="w-4 h-4 animate-spin" />
              : showPwd ? <IEyeOff className="w-4 h-4" /> : <IEye className="w-4 h-4" />
            }
          </button>
          {showPwd && plainPwd && <CopyBtn text={plainPwd} />}
        </div>
      </div>

      {/* Encrypted badge */}
      <div className="mt-3 flex items-center gap-1.5">
        <IShield className="w-3 h-3 text-emerald-800" />
        <span className="text-xs text-emerald-900 font-mono">AES-256-GCM</span>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// ADD / EDIT MODAL
// ═══════════════════════════════════════════════════════════════
function EntryModal({ entry, cryptoKey, userId, folders, onSaved, onClose }) {
  const isEdit = !!entry

  // Decrypt existing values for editing
  const [service,   setService]   = useState(entry?.service ?? '')
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [folderId,  setFolderId]  = useState(entry?.folder_id ?? '')
  const [showPwd,   setShowPwd]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [loading,   setLoading]   = useState(isEdit)
  const [err,       setErr]       = useState('')

  useEffect(() => {
    if (!isEdit) return
    // Decrypt current values so user can edit them
    Promise.all([
      entry.email    ? decrypt(entry.email,    cryptoKey) : '',
      entry.password ? decrypt(entry.password, cryptoKey) : '',
    ]).then(([em, pw]) => {
      setEmail(em ?? '')
      setPassword(pw ?? '')
      setLoading(false)
    })
  }, [])

  async function handleSave() {
    setErr('')
    if (!service.trim())   return setErr('El nombre del servicio es obligatorio.')
    if (!password.trim())  return setErr('La contraseña no puede estar vacía.')
    setSaving(true)
    try {
      // Encrypt sensitive fields before sending to Supabase
      const [encEmail, encPassword] = await Promise.all([
        email.trim() ? encrypt(email.trim(), cryptoKey) : '',
        encrypt(password.trim(), cryptoKey),
      ])
      const payload = {
        service:   service.trim(),
        email:     encEmail,
        password:  encPassword,
        user_id:   userId,
        folder_id: folderId || null,
      }
      if (isEdit) {
        const { error } = await supabase.from('vault_entries').update(payload).eq('id', entry.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('vault_entries').insert(payload)
        if (error) throw error
      }
      onSaved()
    } catch (e) {
      setErr(e.message ?? 'Error al guardar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-900 border border-emerald-900/50 rounded-t-3xl sm:rounded-2xl p-6 w-full sm:max-w-md shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-white text-lg flex items-center gap-2">
            <ILock className="w-5 h-5 text-emerald-500" />
            {isEdit ? 'Editar entrada' : 'Nueva entrada'}
          </h3>
          <button onClick={onClose} className="text-slate-600 hover:text-white text-xl leading-none transition-colors">✕</button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-emerald-800">
            <ILoader className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-emerald-900 uppercase tracking-wide mb-1.5">Servicio *</label>
              <input className={inp} placeholder="Google, Netflix, GitHub..." value={service} onChange={e => setService(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="block text-xs font-semibold text-emerald-900 uppercase tracking-wide mb-1.5">Carpeta</label>
              <select
                className={`${inp} appearance-none`}
                value={folderId}
                onChange={e => setFolderId(e.target.value)}
              >
                <option value="">Sin carpeta</option>
                {folders.map(f => (
                  <option key={f.id} value={f.id}>{f.icon} {f.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-emerald-900 uppercase tracking-wide mb-1.5">Email / Usuario</label>
              <input className={inp} type="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-emerald-900 uppercase tracking-wide mb-1.5">Contraseña *</label>
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-900 hover:text-emerald-500 transition-colors"
                >
                  {showPwd ? <IEyeOff className="w-5 h-5" /> : <IEye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Encryption notice */}
            <div className="flex items-center gap-2 text-xs text-emerald-900 bg-emerald-950/30 border border-emerald-900/30 rounded-lg px-3 py-2">
              <IShield className="w-3.5 h-3.5 text-emerald-700 flex-shrink-0" />
              <span>Los datos se cifran con AES-256-GCM en tu navegador antes de guardarse.</span>
            </div>

            {err && <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</p>}

            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-all text-sm">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold transition-all text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <><ILoader className="w-4 h-4 animate-spin" /> Cifrando...</> : isEdit ? 'Guardar' : 'Añadir'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MASTER PASSWORD GATE
// ═══════════════════════════════════════════════════════════════
function MasterGate({ userId, onUnlock }) {
  const [hasMaster,      setHasMaster]      = useState(null)
  const [masterInput,    setMasterInput]    = useState('')
  const [masterConfirm,  setMasterConfirm]  = useState('')
  const [showPwd,        setShowPwd]        = useState(false)
  const [error,          setError]          = useState('')
  const [loading,        setLoading]        = useState(false)

  useEffect(() => {
    supabase.from('vault_master').select('hash, salt').eq('user_id', userId).single()
      .then(({ data }) => setHasMaster(!!data))
  }, [userId])

  async function handleUnlock(e) {
    e.preventDefault()
    if (!masterInput) return setError('Introduce la contraseña maestra.')
    setLoading(true); setError('')

    const { data } = await supabase
      .from('vault_master').select('hash, salt').eq('user_id', userId).single()
    const storedHash = data?.hash
    const storedSalt = data?.salt  // null si es una fila antigua sin salt

    // ── CASO 1: salt ya está en Supabase (versión actual) ──────────────
    if (storedSalt) {
      const hash = await hashForVerification(masterInput, storedSalt)
      if (hash === storedHash) {
        const key = await deriveKey(masterInput, storedSalt)
        onUnlock(key)
        return
      }
      // Hash no coincide con el salt de Supabase → intentar migración legacy
    }

    // ── CASO 2: legacy v2 — salt estaba en localStorage ───────────────
    // (solo funciona en el mismo navegador donde se creó la bóveda)
    const legacyLSHash = await hashLegacyLocalStorage(masterInput)
    if (legacyLSHash && legacyLSHash === storedHash) {
      // Contraseña correcta: migrar salt a Supabase
      const lsSalt = localStorage.getItem('pedros_vault_salt')
      await supabase.from('vault_master')
        .upsert({ user_id: userId, hash: storedHash, salt: lsSalt }, { onConflict: 'user_id' })
      const key = await deriveKey(masterInput, lsSalt)
      onUnlock(key)
      return
    }

    // ── CASO 3: legacy v1 — hash plano SHA-256 hex sin salt ───────────
    const legacyHexHash = await hashLegacy(masterInput)
    if (legacyHexHash === storedHash) {
      // Contraseña correcta: generar nuevo salt y migrar todo a Supabase
      const newSalt = generateSalt()
      const newHash = await hashForVerification(masterInput, newSalt)
      await supabase.from('vault_master')
        .upsert({ user_id: userId, hash: newHash, salt: newSalt }, { onConflict: 'user_id' })
      const key = await deriveKey(masterInput, newSalt)
      onUnlock(key)
      return
    }

    setError('Contraseña incorrecta.')
    setLoading(false)
  }

  async function handleSetup(e) {
    e.preventDefault()
    if (masterInput.length < 4)       return setError('Mínimo 4 caracteres.')
    if (masterInput !== masterConfirm) return setError('Las contraseñas no coinciden.')
    setLoading(true); setError('')
    // Generar salt aleatorio y guardarlo en Supabase junto al hash
    const salt = generateSalt()
    const hash = await hashForVerification(masterInput, salt)
    const { error: err } = await supabase.from('vault_master')
      .upsert({ user_id: userId, hash, salt }, { onConflict: 'user_id' })
    if (err) { setError(err.message); setLoading(false); return }
    const key = await deriveKey(masterInput, salt)
    onUnlock(key)
  }

  if (hasMaster === null) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <ILoader className="w-8 h-8 text-emerald-700 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4 font-mono relative">
      {/* Back to Dashboard — top-left like all other modules */}
      <button
        type="button"
        onClick={() => window.history.back()}
        className="absolute top-4 left-4 flex items-center gap-1.5 text-emerald-900 hover:text-emerald-600 transition-colors text-sm font-semibold"
        aria-label="Volver"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        <span className="hidden sm:inline font-mono tracking-wide">pedrOS</span>
      </button>

      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-emerald-950/60 border border-emerald-900/60 flex items-center justify-center mx-auto mb-4">
            <ILock className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-black tracking-widest uppercase text-emerald-500">Bóveda 007</h1>
          <p className="text-emerald-900 text-sm mt-2">
            {hasMaster ? 'Introduce tu contraseña maestra' : 'Configura tu contraseña maestra'}
          </p>
          {!hasMaster && (
            <p className="text-emerald-950 text-xs mt-1">
              Esta clave cifra todos tus datos con AES-256. No se puede recuperar.
            </p>
          )}
        </div>

        <form onSubmit={hasMaster ? handleUnlock : handleSetup} className="space-y-3">
          <div className="relative">
            <input
              className="w-full px-4 py-4 rounded-xl bg-emerald-950/20 border border-emerald-900/40 text-emerald-300 placeholder-emerald-950 focus:outline-none focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700 transition-all text-center text-2xl tracking-widest font-mono"
              type={showPwd ? 'text' : 'password'}
              placeholder="••••••••"
              value={masterInput}
              onChange={e => setMasterInput(e.target.value)}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPwd(!showPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-900 hover:text-emerald-600 transition-colors"
            >
              {showPwd ? <IEyeOff className="w-5 h-5" /> : <IEye className="w-5 h-5" />}
            </button>
          </div>

          {!hasMaster && (
            <input
              className="w-full px-4 py-4 rounded-xl bg-emerald-950/20 border border-emerald-900/40 text-emerald-300 placeholder-emerald-950 focus:outline-none focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700 transition-all text-center text-2xl tracking-widest font-mono"
              type="password"
              placeholder="Confirmar ••••••••"
              value={masterConfirm}
              onChange={e => setMasterConfirm(e.target.value)}
            />
          )}

          {error && (
            <p className="text-red-500 text-xs text-center bg-red-500/10 border border-red-900/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-black text-sm tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading
              ? <><ILoader className="w-4 h-4 animate-spin" /> Derivando clave...</>
              : hasMaster ? 'Desbloquear' : 'Crear bóveda'
            }
          </button>
        </form>

        {/* Security info */}
        <div className="mt-6 flex items-start gap-2 text-xs text-emerald-950">
          <IShield className="w-3.5 h-3.5 text-emerald-900 flex-shrink-0 mt-0.5" />
          <span>Cifrado AES-256-GCM con PBKDF2 ({PBKDF2_ITERATIONS.toLocaleString()} iteraciones). Salt almacenado en Supabase.</span>
        </div>

        {/* Reset vault — for migration/locked out users */}
        {hasMaster && (
          <details className="mt-4">
            <summary className="text-xs text-emerald-950/60 hover:text-emerald-900 cursor-pointer text-center select-none">
              ¿No puedes acceder?
            </summary>
            <div className="mt-3 p-3 bg-red-950/20 border border-red-900/30 rounded-xl space-y-2">
              <p className="text-xs text-red-900 leading-relaxed">
                Si perdiste el acceso por cambio de entorno (local → web), puedes resetear la bóveda.
                <strong className="text-red-700"> Esto borrará todas las contraseñas guardadas.</strong>
              </p>
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm('¿Borrar TODA la bóveda? Esta acción no se puede deshacer.')) return
                  await supabase.from('vault_entries').delete().eq('user_id', userId)
                  await supabase.from('vault_master').delete().eq('user_id', userId)
                  localStorage.removeItem('pedros_vault_salt')
                  window.location.reload()
                }}
                className="w-full py-2 rounded-lg bg-red-900/30 hover:bg-red-900/50 text-red-500 border border-red-900/40 text-xs font-bold uppercase tracking-widest transition-all"
              >
                ⚠ Resetear bóveda
              </button>
            </div>
          </details>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
// ── Check Web Crypto API availability ─────────────────────────
if (typeof crypto === 'undefined' || !crypto.subtle) {
  console.warn('[Bóveda 007] Web Crypto API no disponible. El cifrado no funcionará.')
}

// ── FolderModal — create/rename folder ────────────────────────
function FolderModal({ folder, userId, onSaved, onClose }) {
  const isEdit = !!folder
  const ICONS = ['📁','🏦','💼','🎮','🏠','❤️','🛒','🎓','✈️','🔧','📱','🌐']
  const [name,    setName]    = useState(folder?.name ?? '')
  const [icon,    setIcon]    = useState(folder?.icon ?? '📁')
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState('')

  async function handleSave() {
    if (!name.trim()) return setErr('El nombre es obligatorio.')
    setSaving(true)
    const payload = { name: name.trim(), icon, user_id: userId }
    const { error } = isEdit
      ? await supabase.from('vault_folders').update(payload).eq('id', folder.id)
      : await supabase.from('vault_folders').insert(payload)
    if (error) { setErr(error.message); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-slate-900 border border-emerald-900/50 rounded-t-3xl sm:rounded-2xl p-6 w-full sm:max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-white text-lg">{isEdit ? 'Editar carpeta' : 'Nueva carpeta'}</h3>
          <button onClick={onClose} className="text-slate-600 hover:text-white text-xl leading-none transition-colors">✕</button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-emerald-900 uppercase tracking-wide mb-1.5">Nombre *</label>
            <input
              className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-emerald-900/50 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-600 transition-all text-sm"
              placeholder="Banco, Trabajo, Personal..."
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-emerald-900 uppercase tracking-wide mb-2">Icono</label>
            <div className="flex flex-wrap gap-2">
              {ICONS.map(ic => (
                <button key={ic} type="button" onClick={() => setIcon(ic)}
                  className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${icon === ic ? 'bg-emerald-700/40 ring-2 ring-emerald-600' : 'bg-slate-800 hover:bg-slate-700'}`}>
                  {ic}
                </button>
              ))}
            </div>
          </div>
          {err && <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm transition-all">Cancelar</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-sm disabled:opacity-50 transition-all">
              {saving ? 'Guardando...' : isEdit ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Passwords() {
  const navigate = useNavigate()

  const [user,          setUser]          = useState(null)
  const [cryptoKey,     setCryptoKey]     = useState(null)
  const [entries,       setEntries]       = useState([])
  const [folders,       setFolders]       = useState([])
  const [loading,       setLoading]       = useState(true)
  const [modal,         setModal]         = useState(null)   // null | 'add' | entry obj
  const [folderModal,   setFolderModal]   = useState(null)   // null | 'new' | folder obj
  const [activeFolderId, setActiveFolderId] = useState(null) // null = todas
  const [search,        setSearch]        = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => setUser(u ?? null))
  }, [])

  const loadAll = useCallback(async (uid) => {
    setLoading(true)
    const [entriesRes, foldersRes] = await Promise.all([
      supabase.from('vault_entries').select('*').eq('user_id', uid).order('service'),
      supabase.from('vault_folders').select('*').eq('user_id', uid).order('name'),
    ])
    setEntries(entriesRes.data ?? [])
    setFolders(foldersRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (cryptoKey && user) loadAll(user.id)
  }, [cryptoKey, user, loadAll])

  async function handleDelete(id) {
    if (!window.confirm('¿Eliminar esta entrada permanentemente?')) return
    await supabase.from('vault_entries').delete().eq('id', id)
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  async function handleDeleteFolder(id) {
    if (!window.confirm('¿Eliminar carpeta? Las contraseñas dentro quedarán sin carpeta.')) return
    await supabase.from('vault_folders').delete().eq('id', id)
    setFolders(prev => prev.filter(f => f.id !== id))
    setEntries(prev => prev.map(e => e.folder_id === id ? { ...e, folder_id: null } : e))
    if (activeFolderId === id) setActiveFolderId(null)
  }

  // Filtered entries
  const filtered = entries.filter(e => {
    const matchSearch = e.service.toLowerCase().includes(search.toLowerCase())
    const matchFolder = activeFolderId === null || e.folder_id === activeFolderId
    return matchSearch && matchFolder
  })

  // Group by folder when no active filter and no search
  const showGrouped = !search && activeFolderId === null

  // Build grouped structure
  const folderMap = Object.fromEntries(folders.map(f => [f.id, f]))
  const grouped = showGrouped ? [
    ...folders.map(f => ({
      folder: f,
      entries: entries.filter(e => e.folder_id === f.id),
    })).filter(g => g.entries.length > 0),
    ...(entries.some(e => !e.folder_id) ? [{
      folder: null,
      entries: entries.filter(e => !e.folder_id),
    }] : []),
  ] : null

  if (!user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <ILoader className="w-8 h-8 text-emerald-700 animate-spin" />
      </div>
    )
  }

  if (!cryptoKey) {
    return <MasterGate userId={user.id} onUnlock={key => setCryptoKey(key)} />
  }

  return (
    <div className="min-h-screen bg-black text-white font-mono selection:bg-emerald-700 selection:text-white">

      {/* Header */}
      <header className="sticky top-0 z-20 bg-black/95 backdrop-blur-sm border-b border-emerald-900/30 px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between mb-3">
          <button type="button" onClick={() => navigate('/')}
            className="text-emerald-900 hover:text-emerald-600 transition-colors" aria-label="Volver">
            <IArrow className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-black tracking-widest uppercase text-emerald-600 flex items-center gap-2">
            <ILock className="w-5 h-5" /> Bóveda 007
          </h1>
          <div className="flex gap-2">
            <button type="button" onClick={() => setFolderModal('new')}
              className="w-9 h-9 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-900/40 flex items-center justify-center text-emerald-800 hover:text-emerald-500 transition-all"
              aria-label="Nueva carpeta" title="Nueva carpeta">
              <IFolder className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => setModal('add')}
              className="w-9 h-9 rounded-xl bg-emerald-900/30 hover:bg-emerald-900/60 border border-emerald-900/40 flex items-center justify-center text-emerald-600 hover:text-emerald-400 transition-all"
              aria-label="Añadir contraseña">
              <IPlus className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search */}
        <input
          className="w-full px-4 py-2.5 rounded-xl bg-emerald-950/20 border border-emerald-900/30 text-emerald-400 placeholder-emerald-950 focus:outline-none focus:border-emerald-800 transition-all text-sm"
          placeholder="Buscar servicio..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {/* Folder filter pills */}
        {folders.length > 0 && (
          <div className="flex gap-2 mt-2.5 overflow-x-auto pb-0.5 scrollbar-none">
            <button
              onClick={() => setActiveFolderId(null)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                activeFolderId === null
                  ? 'bg-emerald-700/40 text-emerald-400 ring-1 ring-emerald-700'
                  : 'bg-emerald-950/30 text-emerald-900 hover:text-emerald-700'
              }`}
            >
              Todas
            </button>
            {folders.map(f => (
              <button key={f.id}
                onClick={() => setActiveFolderId(activeFolderId === f.id ? null : f.id)}
                className={`flex-shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  activeFolderId === f.id
                    ? 'bg-emerald-700/40 text-emerald-400 ring-1 ring-emerald-700'
                    : 'bg-emerald-950/30 text-emerald-900 hover:text-emerald-700'
                }`}
              >
                {f.icon} {f.name}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Content */}
      <main className="px-4 py-5 sm:px-6 max-w-3xl mx-auto pb-24">

        {loading ? (
          <div className="flex items-center justify-center py-16 text-emerald-900">
            <ILoader className="w-7 h-7 animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16 text-emerald-950">
            <IKey className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">La bóveda está vacía.</p>
            <button onClick={() => setModal('add')}
              className="mt-4 px-5 py-2.5 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/40 border border-emerald-900/30 text-emerald-700 font-bold text-sm transition-all">
              Añadir primera entrada
            </button>
          </div>
        ) : showGrouped ? (
          /* ── GROUPED VIEW ── */
          <div className="space-y-6">
            {grouped.map(({ folder, entries: gEntries }) => (
              <div key={folder?.id ?? 'no-folder'}>
                {/* Folder header */}
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{folder?.icon ?? '🔑'}</span>
                    <span className="text-xs font-bold text-emerald-800 uppercase tracking-widest">
                      {folder?.name ?? 'Sin carpeta'}
                    </span>
                    <span className="text-xs text-emerald-950">{gEntries.length}</span>
                  </div>
                  {folder && (
                    <div className="flex gap-1">
                      <button onClick={() => setFolderModal(folder)}
                        className="p-1 text-emerald-950 hover:text-emerald-700 transition-colors" title="Editar">
                        <IEdit className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDeleteFolder(folder.id)}
                        className="p-1 text-emerald-950 hover:text-red-600 transition-colors" title="Eliminar carpeta">
                        <ITrash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                {/* Entries in folder */}
                <div className="space-y-2 pl-1 border-l border-emerald-900/20">
                  {gEntries.map(entry => (
                    <EntryCard key={entry.id} entry={entry} cryptoKey={cryptoKey}
                      onEdit={e => setModal(e)} onDelete={handleDelete} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* ── FLAT / SEARCH VIEW ── */
          <div className="space-y-3">
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-emerald-950">
                <p className="text-sm">Sin resultados.</p>
              </div>
            ) : filtered.map(entry => (
              <EntryCard key={entry.id} entry={entry} cryptoKey={cryptoKey}
                onEdit={e => setModal(e)} onDelete={handleDelete} />
            ))}
          </div>
        )}

      </main>

      {/* FAB mobile */}
      <button type="button" onClick={() => setModal('add')}
        className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-2xl bg-emerald-800 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-950/80 flex items-center justify-center transition-all active:scale-95 sm:hidden"
        aria-label="Añadir contraseña">
        <IPlus className="w-6 h-6" />
      </button>

      {/* Entry modal */}
      {modal && (
        <EntryModal
          entry={modal === 'add' ? null : modal}
          cryptoKey={cryptoKey}
          userId={user.id}
          folders={folders}
          onSaved={() => { setModal(null); loadAll(user.id) }}
          onClose={() => setModal(null)}
        />
      )}

      {/* Folder modal */}
      {folderModal && (
        <FolderModal
          folder={folderModal === 'new' ? null : folderModal}
          userId={user.id}
          onSaved={() => { setFolderModal(null); loadAll(user.id) }}
          onClose={() => setFolderModal(null)}
        />
      )}
    </div>
  )
}
