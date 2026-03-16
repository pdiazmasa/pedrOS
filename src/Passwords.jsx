import { useNavigate } from 'react-router-dom'
import { IconArrowLeft } from './components/Icons'

export default function Passwords() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-black text-emerald-500 font-mono selection:bg-emerald-500 selection:text-black transition-all duration-300">
      <header className="border-b border-emerald-900 pb-6 px-4 py-4 sm:px-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="text-emerald-700 hover:text-emerald-500 transition-colors duration-300 text-2xl"
          aria-label="Volver"
        >
          <IconArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-black tracking-widest uppercase text-emerald-500">
          Bóveda 007
        </h1>
        <div className="w-8" />
      </header>

      <main className="p-4 sm:p-6 max-w-2xl mx-auto">
        <p className="text-emerald-700/80 text-sm mb-6">
          Gestión de contraseñas. Módulo en construcción.
        </p>

        <div className="bg-emerald-950/10 border border-emerald-900/50 hover:border-emerald-700 p-5 rounded-xl transition-all duration-300">
          <h2 className="text-emerald-400 font-bold mb-3 tracking-wide">Ejemplo de tarjeta</h2>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-emerald-800">Usuario:</span>
              <input
                type="text"
                readOnly
                placeholder="..."
                className="ml-2 bg-black border border-emerald-900/50 p-2 rounded text-emerald-300 w-full max-w-xs"
              />
            </div>
            <div>
              <span className="text-emerald-800">Pass:</span>
              <input
                type="password"
                readOnly
                placeholder="••••••••"
                className="ml-2 bg-black border border-emerald-900/50 p-2 rounded text-emerald-300 w-full max-w-xs"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-emerald-900/30 text-emerald-500 border border-emerald-700 hover:bg-emerald-800 hover:text-white px-4 py-2 font-bold transition-all duration-300"
            >
              Copiar
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
