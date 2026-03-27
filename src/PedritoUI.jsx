// src/PedritoUI.jsx
import { useState, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from './supabaseClient'

const Ic = ({ d, className }) => (
  <svg className={className ?? 'w-5 h-5'} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
)

const ISend = (p) => <Ic {...p} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
const IClose = (p) => <Ic {...p} d="M6 18L18 6M6 6l12 12" />
const ILoader = (p) => <Ic {...p} d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />

const ROUTE_CONTEXT = {
  '/': 'Dashboard',
  '/notas': 'Notas',
  '/trellos': 'Trellos',
  '/calendarios': 'Calendarios',
  '/finanzas': 'Finanzas',
  '/chronopath': 'Chronopath',
  '/contactos': 'Contactos',
  '/peliculas': 'Películas',
}

const HIDDEN_ROUTES = ['/contraseñas']

function normalizePedritoResponse(data) {
  return {
    reply: data?.reply || data?.message || data?.summary || 'Hecho.',
    actions: Array.isArray(data?.actions) ? data.actions : [],
    refresh: Array.isArray(data?.refresh) ? data.refresh : [],
    meta: data?.meta || {},
    isError: false,
  }
}

function emitPedritoRefresh(targets = []) {
  if (typeof window === 'undefined') return
  const normalized = Array.isArray(targets) ? targets : []
  window.dispatchEvent(
    new CustomEvent('pedrito:refresh', {
      detail: {
        targets: normalized,
        modules: normalized,
        at: new Date().toISOString(),
      },
    })
  )
}

async function callPedrito(prompt, context) {
  const { data, error } = await supabase.functions.invoke('pedrito', {
    body: {
      prompt,
      context,
      now: new Date().toISOString(),
      routeContext: context,
    },
  })

  if (error) {
    throw new Error(error.message ?? 'Error al contactar con Pedrito.')
  }

  return normalizePedritoResponse(data)
}

function PedritoDashboard({ onAction }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [reply, setReply] = useState(null)
  const [visible, setVisible] = useState(false)
  const inputRef = useRef(null)
  const replyTimer = useRef(null)

  async function handleSubmit(e) {
    e?.preventDefault()
    const prompt = input.trim()
    if (!prompt || loading) return

    setLoading(true)
    setReply(null)
    setVisible(false)

    try {
      const data = await callPedrito(prompt, 'Dashboard')
      setReply({ text: data.reply, isError: false })
      setInput('')

      if (data.refresh.length) {
        emitPedritoRefresh(data.refresh)
        onAction?.(data.refresh)
      }
    } catch (err) {
      setReply({ text: err.message, isError: true })
    } finally {
      setLoading(false)
      setVisible(true)
      clearTimeout(replyTimer.current)
      replyTimer.current = setTimeout(() => setVisible(false), 8000)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) handleSubmit(e)
  }

  useEffect(() => {
    return () => clearTimeout(replyTimer.current)
  }, [])

  return (
    <div className="w-full mb-6">
      <form onSubmit={handleSubmit} className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-black leading-none">P</span>
          </div>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Pregunta a Pedrito… (agenda, contactos, películas…)"
          disabled={loading}
          className="w-full pl-12 pr-14 py-3.5 rounded-2xl bg-slate-800/80 border border-slate-700 hover:border-slate-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 text-white placeholder-slate-500 text-sm transition-all duration-200 outline-none disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:text-slate-500 text-white flex items-center justify-center transition-all duration-200"
        >
          {loading ? <ILoader className="w-4 h-4 animate-spin" /> : <ISend className="w-4 h-4" />}
        </button>
      </form>

      {visible && reply && (
        <div
          className={`mt-2 px-4 py-2.5 rounded-xl text-sm flex items-start gap-2 transition-all duration-300 ${
            reply.isError
              ? 'bg-red-500/10 border border-red-500/20 text-red-400'
              : 'bg-violet-500/10 border border-violet-500/20 text-violet-300'
          }`}
        >
          <span className="flex-1 whitespace-pre-wrap leading-relaxed">{reply.text}</span>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="text-slate-500 hover:text-white transition-colors flex-shrink-0 mt-0.5"
          >
            <IClose className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

function Message({ msg }) {
  const isUser = msg.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
          <span className="text-white text-xs font-black leading-none">P</span>
        </div>
      )}

      <div
        className={`max-w-[80%] px-3 py-2 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-violet-600 text-white rounded-br-md'
            : msg.isError
              ? 'bg-red-500/20 text-red-300 border border-red-500/20 rounded-bl-md'
              : 'bg-slate-700 text-slate-200 rounded-bl-md'
        }`}
      >
        {msg.text}
      </div>
    </div>
  )
}

function PedritoGlobal({ context, onAction }) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: 'Dime.',
      isError: false,
    },
  ])

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const popoverRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  useEffect(() => {
    function handleOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleOutside)
    }
  }, [open])

  async function handleSubmit(e) {
    e?.preventDefault()
    const prompt = input.trim()
    if (!prompt || loading) return

    setMessages((prev) => [...prev, { role: 'user', text: prompt }])
    setInput('')
    setLoading(true)

    try {
      const data = await callPedrito(prompt, context)

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: data.reply, isError: false },
      ])

      if (data.refresh.length) {
        emitPedritoRefresh(data.refresh)
        onAction?.(data.refresh)
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: err.message, isError: true },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) handleSubmit(e)
    if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div className="fixed bottom-6 right-6 z-[2000] flex flex-col items-end gap-3" ref={popoverRef}>
      {open && (
        <div
          className="w-72 sm:w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/50 flex flex-col overflow-hidden"
          style={{ maxHeight: '420px' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-800/50">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center">
                <span className="text-white text-xs font-black">P</span>
              </div>
              <div>
                <p className="text-white text-sm font-bold leading-none">Pedrito</p>
                <p className="text-slate-500 text-xs leading-none mt-0.5">{context}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-slate-500 hover:text-white transition-colors"
            >
              <IClose className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 bg-slate-900">
            {messages.map((msg, i) => (
              <Message key={i} msg={msg} />
            ))}
            {loading && (
              <div className="flex justify-start mb-2">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                  <span className="text-white text-xs font-black leading-none">P</span>
                </div>
                <div className="bg-slate-700 text-slate-300 rounded-2xl rounded-bl-md px-3 py-2 text-xs">
                  <ILoader className="w-4 h-4 animate-spin" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="border-t border-slate-800 p-3 bg-slate-900">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Escribe algo…"
                disabled={loading}
                className="flex-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 text-white placeholder-slate-500 text-xs outline-none transition-all disabled:opacity-60"
              />
              <button
                type="submit"
                onClick={handleSubmit}
                disabled={!input.trim() || loading}
                className="w-8 h-8 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:text-slate-500 text-white flex items-center justify-center transition-all flex-shrink-0"
              >
                <ISend className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-[52px] h-[52px] rounded-2xl shadow-lg shadow-violet-900/40 flex items-center justify-center transition-all duration-200 active:scale-95 ${
          open
            ? 'bg-slate-700 text-slate-300'
            : 'bg-gradient-to-br from-violet-600 to-blue-700 text-white hover:from-violet-500 hover:to-blue-600'
        }`}
        aria-label="Abrir Pedrito"
      >
        {open ? <IClose className="w-5 h-5" /> : <span className="text-lg font-black leading-none">P</span>}
      </button>
    </div>
  )
}

export function PedritoBar({ onAction }) {
  return <PedritoDashboard onAction={onAction} />
}

export function PedritoGlobalWrapper({ onAction }) {
  const location = useLocation()
  const path = location.pathname
  const context = ROUTE_CONTEXT[path] ?? 'pedrOS'

  if (HIDDEN_ROUTES.includes(path)) return null
  if (path === '/') return null

  return <PedritoGlobal context={context} onAction={onAction} />
}

export default function PedritoUI({ onAction }) {
  const location = useLocation()
  const path = location.pathname

  if (HIDDEN_ROUTES.includes(path)) return null

  if (path === '/') {
    return <PedritoDashboard onAction={onAction} />
  }

  const context = ROUTE_CONTEXT[path] ?? 'pedrOS'
  return <PedritoGlobal context={context} onAction={onAction} />
}
