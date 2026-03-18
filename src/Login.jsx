import { useState } from 'react'
import { supabase } from './supabaseClient'
import { IconMail, IconLock } from './components/Icons'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setMessage({ type: '', text: '' })
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Credenciales incorrectas' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm p-6 sm:p-8 bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl shadow-slate-950/50 transition-all duration-300">
        <h1 className="font-black text-2xl text-center mb-2 bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
          pedrOS
        </h1>
        <p className="text-slate-400 text-sm text-center mb-6">
          Acceso restringido
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">
              Email
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                <IconMail className="w-5 h-5" />
              </span>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="tu@email.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-slate-900 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-300"
              />
            </div>
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1">
              Contraseña
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                <IconLock className="w-5 h-5" />
              </span>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-slate-900 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-300"
              />
            </div>
          </div>

          {message.text && (
            <p
              className={`text-sm rounded-lg px-3 py-2 ${
                message.type === 'error'
                  ? 'text-red-400 bg-red-500/10 border border-red-500/20'
                  : 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
              }`}
            >
              {message.text}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Espera...' : 'Iniciar sesión'}
          </button>
        </form>


      </div>
    </div>
  )
}
