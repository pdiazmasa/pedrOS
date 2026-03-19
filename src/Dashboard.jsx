import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { IconLogOut } from './components/Icons'

const MODULES = [
  {
    emoji: '📝',
    title: 'Notas',
    subtitle: 'Tu comodín de texto rápido',
    path: '/notas',
    hoverBorder: 'hover:border-blue-500',
    hoverShadow: 'hover:shadow-[0_0_20px_rgba(59,130,246,0.2)]',
  },
  {
    emoji: '📋',
    title: 'Trellos',
    subtitle: 'TARS, Personal, Universidad',
    path: '/trellos',
    hoverBorder: 'hover:border-emerald-500',
    hoverShadow: 'hover:shadow-[0_0_20px_rgba(16,185,129,0.2)]',
  },
  {
    emoji: '📅',
    title: 'Calendarios',
    subtitle: 'Gestión del tiempo',
    path: '/calendarios',
    hoverBorder: 'hover:border-purple-500',
    hoverShadow: 'hover:shadow-[0_0_20px_rgba(168,85,247,0.2)]',
  },
  {
    emoji: '📈',
    title: 'Finanzas',
    subtitle: 'Inversiones y control',
    path: '/finanzas',
    hoverBorder: 'hover:border-yellow-500',
    hoverShadow: 'hover:shadow-[0_0_20px_rgba(234,179,8,0.2)]',
  },
  {
    emoji: '🗺️',
    title: 'Chronopath',
    subtitle: 'Lugares visitados',
    path: '/chronopath',
    hoverBorder: 'hover:border-orange-500',
    hoverShadow: 'hover:shadow-[0_0_20px_rgba(249,115,22,0.2)]',
  },
  {
    emoji: '🔐',
    title: 'Contraseñas',
    subtitle: 'Bóveda 007',
    path: '/contraseñas',
    hoverBorder: 'hover:border-emerald-500',
    hoverShadow: 'hover:shadow-[0_0_20px_rgba(16,185,129,0.2)]',
  },
]

export default function Dashboard() {
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans px-4 sm:px-6 lg:px-8" style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top, 1.5rem))', paddingBottom: '1.5rem' }}>
      <header className="flex justify-between items-center mb-6 px-4 py-3 bg-slate-800 rounded-2xl border border-slate-700 shadow-lg transition-all duration-300">
        <h1 className="text-xl sm:text-2xl font-black tracking-tighter bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent leading-none select-none">
        pedrOS
          <span className="text-xs font-normal text-slate-500 ml-1.5 tracking-normal">v2.6.6</span>
        </h1>
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:text-red-300 transition-all duration-300 font-bold"
        >
          <IconLogOut className="w-5 h-5" />
          <span className="hidden sm:inline">Cerrar Sesión</span>
        </button>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {MODULES.map((module) => (
          <button
            key={module.path}
            type="button"
            onClick={() => navigate(module.path)}
            className={`group bg-slate-800 rounded-2xl border-2 border-slate-700 shadow-lg p-4 sm:p-6 text-left cursor-pointer transition-all duration-300 ${module.hoverBorder} ${module.hoverShadow}`}
          >
            <span className="text-3xl sm:text-4xl block mb-3 sm:mb-4 transition-transform duration-300 origin-left group-hover:scale-110">
              {module.emoji}
            </span>
            <h2 className="text-base sm:text-xl font-semibold text-white mb-1">
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
