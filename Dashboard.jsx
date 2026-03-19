import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { IconLogOut } from './components/Icons'

// ─── Module definitions ────────────────────────────────────────
// Each module can optionally receive a `bgImage` (path in /public)
// that becomes a subtle parallax texture on the card.
const MODULES = [
  {
    emoji: '📝',
    title: 'Notas',
    subtitle: 'Tu comodín de texto rápido',
    path: '/notas',
    accent: '#3b82f6',
    hoverBorder: 'hover:border-blue-500',
    hoverShadow: 'hover:shadow-[0_0_24px_rgba(59,130,246,0.25)]',
    // bgImage: '/module-notes.jpg',
  },
  {
    emoji: '📋',
    title: 'Trellos',
    subtitle: 'TARS, Personal, Universidad',
    path: '/trellos',
    accent: '#10b981',
    hoverBorder: 'hover:border-emerald-500',
    hoverShadow: 'hover:shadow-[0_0_24px_rgba(16,185,129,0.25)]',
  },
  {
    emoji: '📅',
    title: 'Calendarios',
    subtitle: 'Gestión del tiempo',
    path: '/calendarios',
    accent: '#a855f7',
    hoverBorder: 'hover:border-purple-500',
    hoverShadow: 'hover:shadow-[0_0_24px_rgba(168,85,247,0.25)]',
  },
  {
    emoji: '📈',
    title: 'Finanzas',
    subtitle: 'Inversiones y control',
    path: '/finanzas',
    accent: '#eab308',
    hoverBorder: 'hover:border-yellow-500',
    hoverShadow: 'hover:shadow-[0_0_24px_rgba(234,179,8,0.25)]',
  },
  {
    emoji: '🗺️',
    title: 'Chronopath',
    subtitle: 'Lugares visitados',
    path: '/chronopath',
    accent: '#f97316',
    hoverBorder: 'hover:border-orange-500',
    hoverShadow: 'hover:shadow-[0_0_24px_rgba(249,115,22,0.25)]',
  },
  {
    emoji: '🔐',
    title: 'Contraseñas',
    subtitle: 'Bóveda 007',
    path: '/contraseñas',
    accent: '#10b981',
    hoverBorder: 'hover:border-emerald-600',
    hoverShadow: 'hover:shadow-[0_0_24px_rgba(16,185,129,0.2)]',
  },
]

// ─── ModuleCard ────────────────────────────────────────────────
/**
 * Tarjeta de módulo reutilizable.
 *
 * Props del module:
 *   emoji       — emoji visible
 *   title       — nombre del módulo
 *   subtitle    — descripción corta
 *   accent      — color hex para el glow de hover
 *   bgImage     — (opcional) ruta absoluta desde /public, ej: '/module-notes.jpg'
 *   hoverBorder / hoverShadow — clases Tailwind
 */
function ModuleCard({ module, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        group relative overflow-hidden
        bg-slate-800 rounded-2xl border-2 border-slate-700 shadow-lg
        p-4 sm:p-5 text-left cursor-pointer
        transition-all duration-300
        ${module.hoverBorder} ${module.hoverShadow}
      `}
    >
      {/* Optional: background image texture */}
      {module.bgImage && (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-10 group-hover:opacity-20 transition-opacity duration-500"
          style={{ backgroundImage: `url(${module.bgImage})` }}
          aria-hidden="true"
        />
      )}

      {/* Accent glow blob — bottom-left */}
      <div
        className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full blur-3xl opacity-0 group-hover:opacity-20 transition-opacity duration-300 pointer-events-none"
        style={{ backgroundColor: module.accent }}
        aria-hidden="true"
      />

      {/* Card content */}
      <div className="relative z-10">
        <span className="text-3xl sm:text-4xl block mb-3 transition-transform duration-300 origin-left group-hover:scale-110 will-change-transform">
          {module.emoji}
        </span>
        <h2 className="text-base sm:text-lg font-bold text-white mb-0.5 leading-tight">
          {module.title}
        </h2>
        <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
          {module.subtitle}
        </p>
      </div>
    </button>
  )
}

// ─── Dashboard ─────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans px-4 py-5 sm:px-6 lg:px-8">

      {/* ── Header ──────────────────────────────────────────── */}
      <header className="flex justify-between items-center mb-8 sm:mb-10 px-4 py-3 bg-slate-800 rounded-2xl border border-slate-700 shadow-lg transition-all duration-300">

        {/* Logo + wordmark */}
        <div className="flex items-center gap-2.5">
          <img
            src="/icon-192.png"
            alt="pedrOS"
            className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl object-cover flex-shrink-0 shadow-md"
            draggable={false}
          />
          <h1 className="text-xl sm:text-2xl font-black tracking-tighter bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent leading-none select-none">
            pedrOS
          </h1>
        </div>

        {/* Logout */}
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:text-red-300 transition-all duration-300 font-bold text-sm"
        >
          <IconLogOut className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
          <span className="hidden sm:inline">Cerrar Sesión</span>
        </button>
      </header>

      {/* ── Module grid ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5">
        {MODULES.map((module) => (
          <ModuleCard
            key={module.path}
            module={module}
            onClick={() => navigate(module.path)}
          />
        ))}
      </div>

    </div>
  )
}
