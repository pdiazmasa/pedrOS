import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import Login from './Login'
import Dashboard from './Dashboard'
import Notes from './Notes'
import Trellos from './Trellos'
import Calendars from './Calendars'
import Passwords from './Passwords'
import Finanzas from './Finanzas'
import Chronopath from './Chronopath'
import { PedritoGlobalWrapper } from './PedritoUI'
import './App.css'

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription?.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4 text-white font-sans">
        <p className="animate-pulse text-slate-500 text-sm">Cargando pedrOS...</p>
        <div className="w-10 h-10 rounded-lg border-2 border-slate-600 border-t-blue-500 animate-spin" />
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/notas" element={<Notes />} />
        <Route path="/trellos" element={<Trellos />} />
        <Route path="/calendarios" element={<Calendars />} />
        <Route path="/contraseñas" element={<Passwords />} />
        <Route path="/finanzas" element={<Finanzas />} />
        <Route path="/chronopath" element={<Chronopath />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Pedrito floating bubble — shown on all routes except / and /contraseñas */}
      <PedritoGlobalWrapper />
    </BrowserRouter>
  )
}
