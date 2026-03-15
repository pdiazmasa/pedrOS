import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'

const MODULES = [
  {
    emoji: '📝',
    title: 'Notas',
    subtitle: 'Tu comodín de texto rápido',
    path: '/notas',
    hoverBorder: 'hover:border-blue-500',
  },
  {
    emoji: '📋',
    title: 'Trellos',
    subtitle: 'TARS, Personal, Universidad',
    path: '/trellos',
    hoverBorder: 'hover:border-emerald-500',
  },
  {
    emoji: '📅',
    title: 'Calendarios',
    subtitle: 'Gestión del tiempo',
    path: '/calendarios',
    hoverBorder: 'hover:border-purple-500',
  },
  {
    emoji: '📈',
    title: 'Finanzas',
    subtitle: 'Inversiones y control',
    path: '/finanzas',
    hoverBorder: 'hover:border-yellow-500',
  },
  {
    emoji: '🗺️',
    title: 'Chronopath',
    subtitle: 'Lugares visitados',
    path: '/chronopath',
    hoverBorder: 'hover:border-orange-500',
  },
]

export default function Dashboard() {
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="bg-slate-800 rounded-2xl shadow-xl shadow-slate-900/50 px-6 py-4 flex items-center justify-between mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent">
          pedrOS
        </h1>
        <button
          type="button"
          onClick={handleLogout}
          className="px-4 py-2 rounded-lg bg-red-900/40 text-red-300 border border-red-800/50 hover:bg-red-800/50 hover:text-red-200 hover:border-red-600/60 transition-colors duration-200 font-medium"
        >
          Cerrar Sesión
        </button>
      </header>

      {/* Grid de Módulos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {MODULES.map((module) => (
          <button
            key={module.path}
            type="button"
            onClick={() => navigate(module.path)}
            className={`group bg-slate-800 border-2 border-slate-700 rounded-2xl p-6 text-left cursor-pointer transition-all duration-300 ${module.hoverBorder} hover:shadow-lg hover:shadow-slate-900/50`}
          >
            <span className="text-5xl block mb-4 transition-transform duration-300 group-hover:scale-110">
              {module.emoji}
            </span>
            <h2 className="text-xl font-semibold text-white mb-1">
              {module.title}
            </h2>
            <p className="text-slate-400 text-sm">
              {module.subtitle}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}
