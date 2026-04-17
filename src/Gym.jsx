
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'

const PANEL = 'bg-slate-800 border border-slate-700 rounded-2xl shadow-lg'
const INPUT = 'w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
const TEXTAREA = 'w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y min-h-[92px]'
const BTN_PRIMARY = 'rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50'
const BTN_SECONDARY = 'rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-slate-600 hover:bg-slate-700'
const BTN_GHOST = 'rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white'

const TABS = [
  { value: 'exercises', label: 'Ejercicios' },
  { value: 'stats', label: 'Estadísticas' },
  { value: 'log', label: 'Registro' },
]

const GROUPS = [
  { value: 'all', label: 'Todos' },
  { value: 'pecho', label: 'Pecho' },
  { value: 'espalda', label: 'Espalda' },
  { value: 'brazo', label: 'Brazo' },
  { value: 'pierna', label: 'Pierna' },
]

const RANGE_OPTIONS = [
  { value: 'all', label: 'Histórico' },
  { value: '30', label: '30 días' },
  { value: '90', label: '3 meses' },
  { value: '180', label: '6 meses' },
  { value: '365', label: '1 año' },
]

function cx(...classes) {
  return classes.filter(Boolean).join(' ')
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
}

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function toDate(value) {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function formatDateDisplay(value) {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(`${value}T00:00:00`) : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}

function formatDateShort(value) {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(`${value}T00:00:00`) : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit' }).format(d)
}

function formatDateISO(date = new Date()) {
  const d = new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatKg(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)} kg`
}

function daysSince(value) {
  if (!value) return null
  const d = typeof value === 'string' ? new Date(`${value}T00:00:00`) : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const today = startOfDay(new Date())
  return Math.max(0, Math.round((today - startOfDay(d)) / 86400000))
}

function average(values) {
  if (!values.length) return null
  return values.reduce((sum, val) => sum + val, 0) / values.length
}

function groupLabel(value) {
  const found = GROUPS.find((item) => item.value === value)
  return found?.label || value
}

function EmptyState({ title, subtitle }) {
  return (
    <div className={cx(PANEL, 'p-6 text-center')}>
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
    </div>
  )
}

function Poster({ src, alt }) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className="h-16 w-16 rounded-xl object-cover bg-slate-900"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    )
  }

  return (
    <div className="h-16 w-16 rounded-xl bg-slate-900 text-slate-500 flex items-center justify-center text-[11px] text-center px-2">
      Sin imagen
    </div>
  )
}

function SectionHeader({ title, subtitle, right }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

function ProgressChart({ points }) {
  const [activeIndex, setActiveIndex] = useState(points.length ? points.length - 1 : null)

  useEffect(() => {
    setActiveIndex(points.length ? points.length - 1 : null)
  }, [points])

  if (!points.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-8 text-center text-sm text-slate-500">
        Aún no hay registros para este rango.
      </div>
    )
  }

  const width = 680
  const height = 260
  const paddingLeft = 34
  const paddingRight = 20
  const paddingTop = 18
  const paddingBottom = 34

  const values = points.map((point) => point.weight_kg)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const valueSpan = Math.max(1, maxValue - minValue)

  const plotWidth = width - paddingLeft - paddingRight
  const plotHeight = height - paddingTop - paddingBottom

  const coords = points.map((point, index) => {
    const x = paddingLeft + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth)
    const y = paddingTop + plotHeight - ((point.weight_kg - minValue) / valueSpan) * plotHeight
    return { ...point, x, y }
  })

  const path = coords
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')

  const activePoint = activeIndex != null ? coords[activeIndex] : coords[coords.length - 1]
  const yTicks = 4

  return (
    <div className="space-y-3">
      {activePoint && (
        <div className="rounded-2xl bg-slate-900/70 border border-slate-700 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold text-white">{formatKg(activePoint.weight_kg)}</span>
            <span className="text-slate-400">{activePoint.reps} rep{activePoint.reps === 1 ? '' : 's'}</span>
            <span className="text-slate-500">{formatDateDisplay(activePoint.workout_date)}</span>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          {Array.from({ length: yTicks + 1 }).map((_, index) => {
            const ratio = index / yTicks
            const y = paddingTop + ratio * plotHeight
            const value = maxValue - ratio * valueSpan
            return (
              <g key={index}>
                <line
                  x1={paddingLeft}
                  x2={width - paddingRight}
                  y1={y}
                  y2={y}
                  stroke="#334155"
                  strokeDasharray="4 4"
                />
                <text x={8} y={y + 4} fill="#94a3b8" fontSize="11">
                  {Number(value.toFixed(1))}
                </text>
              </g>
            )
          })}

          {coords.length > 1 && (
            <path d={path} fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          )}

          {coords.map((point, index) => (
            <g key={`${point.id}-${point.workout_date}`}>
              <circle
                cx={point.x}
                cy={point.y}
                r={activeIndex === index ? 6 : 4}
                fill={activeIndex === index ? '#60a5fa' : '#93c5fd'}
                stroke="#0f172a"
                strokeWidth="2"
                className="cursor-pointer transition-all"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => setActiveIndex(index)}
              />
            </g>
          ))}

          {coords.length > 1 && (
            <>
              <text x={paddingLeft} y={height - 10} fill="#94a3b8" fontSize="11">
                {formatDateShort(coords[0].workout_date)}
              </text>
              <text x={width / 2 - 18} y={height - 10} fill="#94a3b8" fontSize="11">
                {formatDateShort(coords[Math.floor((coords.length - 1) / 2)].workout_date)}
              </text>
              <text x={width - paddingRight - 42} y={height - 10} fill="#94a3b8" fontSize="11">
                {formatDateShort(coords[coords.length - 1].workout_date)}
              </text>
            </>
          )}
        </svg>
      </div>
    </div>
  )
}

function ExerciseRow({ exercise, isSelected, record, lastDays, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'w-full rounded-2xl border px-3 py-3 text-left transition-all',
        isSelected
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-slate-700 bg-slate-900/50 hover:border-slate-600 hover:bg-slate-900'
      )}
    >
      <div className="flex items-center gap-3">
        <Poster src={exercise.image_url} alt={exercise.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-white">{exercise.name}</p>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
            <span className="rounded-full bg-slate-800 px-2 py-0.5">{groupLabel(exercise.muscle_group)}</span>
            {record && <span>Récord: {formatKg(record.weight_kg)}</span>}
            {lastDays != null && <span>Última vez: hace {lastDays} día{lastDays === 1 ? '' : 's'}</span>}
          </div>
        </div>
      </div>
    </button>
  )
}

function StatCard({ label, value, tone = 'default', help }) {
  const toneStyles = {
    default: 'border-slate-700 bg-slate-900/60',
    green: 'border-emerald-700/50 bg-emerald-500/10',
    red: 'border-rose-700/50 bg-rose-500/10',
    blue: 'border-blue-700/50 bg-blue-500/10',
  }

  return (
    <div className={cx('rounded-2xl border px-4 py-4', toneStyles[tone] || toneStyles.default)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
      {help && <p className="mt-2 text-xs text-slate-400">{help}</p>}
    </div>
  )
}

export default function Gym() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('exercises')
  const [groupFilter, setGroupFilter] = useState('all')
  const [exerciseSearch, setExerciseSearch] = useState('')
  const [selectedExerciseId, setSelectedExerciseId] = useState(null)
  const [range, setRange] = useState('all')
  const [exercises, setExercises] = useState([])
  const [logs, setLogs] = useState([])
  const [imageDraft, setImageDraft] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [metaSaving, setMetaSaving] = useState(false)
  const [recordForm, setRecordForm] = useState({ exerciseId: '', weight: '', reps: '' })
  const [recordSaving, setRecordSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const fetchAll = useCallback(async (authUser) => {
    if (!authUser) return
    setLoading(true)
    try {
      const [{ data: exerciseRows, error: exerciseError }, { data: logRows, error: logError }] = await Promise.all([
        supabase.from('gym_exercises').select('*').eq('is_active', true).order('muscle_group').order('sort_order'),
        supabase.from('gym_logs').select('*').eq('user_id', authUser.id).order('workout_date', { ascending: false }).order('created_at', { ascending: false }),
      ])

      if (exerciseError) throw exerciseError
      if (logError) throw logError

      setExercises(exerciseRows || [])
      setLogs(logRows || [])

      const firstExerciseId = (exerciseRows || [])[0]?.id || null
      setSelectedExerciseId((prev) => prev || firstExerciseId)
      setRecordForm((prev) => ({ ...prev, exerciseId: prev.exerciseId || firstExerciseId || '' }))
    } catch (error) {
      console.error('Gym fetchAll:', error)
      setExercises([])
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      setUser(authUser ?? null)
      if (authUser) fetchAll(authUser)
      else setLoading(false)
    })
  }, [fetchAll])

  useEffect(() => {
    function handleRefresh(event) {
      const mods = event.detail?.modules ?? event.detail?.targets ?? []
      if (!user) return
      if (mods.includes('gym') || mods.includes('gimnasio') || mods.includes('all')) {
        fetchAll(user)
      }
    }

    window.addEventListener('pedrito:refresh', handleRefresh)
    return () => window.removeEventListener('pedrito:refresh', handleRefresh)
  }, [user, fetchAll])

  const logsByExerciseId = useMemo(() => {
    const map = new Map()
    for (const log of logs) {
      const arr = map.get(log.exercise_id) || []
      arr.push(log)
      map.set(log.exercise_id, arr)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        if (a.workout_date === b.workout_date) return new Date(a.created_at) - new Date(b.created_at)
        return new Date(a.workout_date) - new Date(b.workout_date)
      })
    }
    return map
  }, [logs])

  const lastLogByExerciseId = useMemo(() => {
    const map = new Map()
    for (const log of logs) {
      if (!map.has(log.exercise_id)) map.set(log.exercise_id, log)
    }
    return map
  }, [logs])

  const bestLogByExerciseId = useMemo(() => {
    const map = new Map()
    for (const exercise of exercises) {
      const exerciseLogs = logsByExerciseId.get(exercise.id) || []
      if (!exerciseLogs.length) continue
      const best = [...exerciseLogs].sort((a, b) => {
        if (Number(b.weight_kg) !== Number(a.weight_kg)) return Number(b.weight_kg) - Number(a.weight_kg)
        if (Number(b.reps) !== Number(a.reps)) return Number(b.reps) - Number(a.reps)
        return new Date(b.workout_date) - new Date(a.workout_date)
      })[0]
      map.set(exercise.id, best)
    }
    return map
  }, [exercises, logsByExerciseId])

  const selectedExercise = useMemo(
    () => exercises.find((exercise) => exercise.id === selectedExerciseId) || null,
    [exercises, selectedExerciseId]
  )

  useEffect(() => {
    setImageDraft(selectedExercise?.image_url || '')
    setNoteDraft(selectedExercise?.exercise_note || '')
    setRecordForm((prev) => ({
      ...prev,
      exerciseId: selectedExercise?.id || prev.exerciseId || '',
    }))
  }, [selectedExercise])

  const filteredExercises = useMemo(() => {
    const searchNeedle = normalize(exerciseSearch)
    return exercises.filter((exercise) => {
      const groupOk = groupFilter === 'all' || exercise.muscle_group === groupFilter
      const searchOk =
        !searchNeedle ||
        normalize(exercise.name).includes(searchNeedle) ||
        normalize(exercise.exercise_note || '').includes(searchNeedle)
      return groupOk && searchOk
    })
  }, [exercises, exerciseSearch, groupFilter])

  const selectedExerciseLogs = useMemo(() => {
    return selectedExercise ? logsByExerciseId.get(selectedExercise.id) || [] : []
  }, [selectedExercise, logsByExerciseId])

  const chartPoints = useMemo(() => {
    if (range === 'all') return selectedExerciseLogs
    const days = Number(range)
    const cutoff = addDays(startOfDay(new Date()), -(days - 1))
    return selectedExerciseLogs.filter((log) => {
      const d = toDate(`${log.workout_date}T00:00:00`)
      return d && d >= cutoff
    })
  }, [selectedExerciseLogs, range])

  const stats = useMemo(() => {
    const exerciseMap = new Map(exercises.map((exercise) => [exercise.id, exercise]))
    const allTimeCounts = new Map()
    const last30Counts = new Map()
    const groupCounts = new Map()
    const lastPerformed = []

    const today = startOfDay(new Date())
    const recentStart = addDays(today, -29)
    const prevStart = addDays(today, -59)
    const prevEnd = addDays(today, -30)

    for (const exercise of exercises) {
      const exerciseLogs = logsByExerciseId.get(exercise.id) || []
      const totalCount = exerciseLogs.length
      if (totalCount) {
        allTimeCounts.set(exercise.id, totalCount)

        const recentLogs = exerciseLogs.filter((log) => {
          const d = toDate(`${log.workout_date}T00:00:00`)
          return d && d >= recentStart && d <= today
        })
        const previousLogs = exerciseLogs.filter((log) => {
          const d = toDate(`${log.workout_date}T00:00:00`)
          return d && d >= prevStart && d <= prevEnd
        })

        last30Counts.set(exercise.id, recentLogs.length)

        const groupKey = exercise.muscle_group
        groupCounts.set(groupKey, (groupCounts.get(groupKey) || 0) + totalCount)

        const lastLog = exerciseLogs[exerciseLogs.length - 1]
        lastPerformed.push({
          exercise,
          log: lastLog,
          days: daysSince(lastLog.workout_date),
        })
      }
    }

    const allTimeTop = [...allTimeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([exerciseId, count]) => ({ exercise: exerciseMap.get(exerciseId), count }))

    const recentTop = [...last30Counts.entries()]
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([exerciseId, count]) => ({ exercise: exerciseMap.get(exerciseId), count }))

    const monthlyComparisons = exercises
      .map((exercise) => {
        const exerciseLogs = logsByExerciseId.get(exercise.id) || []
        const recentValues = exerciseLogs
          .filter((log) => {
            const d = toDate(`${log.workout_date}T00:00:00`)
            return d && d >= recentStart && d <= today
          })
          .map((log) => Number(log.weight_kg))
        const previousValues = exerciseLogs
          .filter((log) => {
            const d = toDate(`${log.workout_date}T00:00:00`)
            return d && d >= prevStart && d <= prevEnd
          })
          .map((log) => Number(log.weight_kg))

        const recentAvg = average(recentValues)
        const previousAvg = average(previousValues)
        if (recentAvg == null || previousAvg == null) return null

        const delta = recentAvg - previousAvg
        const pct = previousAvg > 0 ? (delta / previousAvg) * 100 : null

        return { exercise, recentAvg, previousAvg, delta, pct }
      })
      .filter(Boolean)

    const avgDelta = average(monthlyComparisons.map((item) => item.delta))
    const avgPct = average(monthlyComparisons.map((item) => item.pct).filter((item) => Number.isFinite(item)))

    const bestImprovement = [...monthlyComparisons]
      .filter((item) => item.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 6)

    const worstDecline = [...monthlyComparisons]
      .filter((item) => item.delta < 0)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, 6)

    const groupFrequency = GROUPS.filter((item) => item.value !== 'all').map((group) => ({
      group: group.value,
      label: group.label,
      count: groupCounts.get(group.value) || 0,
    }))

    return {
      totalLogs: logs.length,
      totalTrainingDays: new Set(logs.map((log) => log.workout_date)).size,
      allTimeTop,
      recentTop,
      avgDelta,
      avgPct,
      bestImprovement,
      worstDecline,
      groupFrequency,
      lastPerformed: lastPerformed.sort((a, b) => a.days - b.days),
    }
  }, [exercises, logs, logsByExerciseId])

  const recentExerciseQuickPicks = useMemo(() => {
    const seen = new Set()
    const picks = []
    for (const log of logs) {
      if (seen.has(log.exercise_id)) continue
      const exercise = exercises.find((item) => item.id === log.exercise_id)
      if (!exercise) continue
      seen.add(log.exercise_id)
      picks.push(exercise)
      if (picks.length >= 8) break
    }
    return picks
  }, [logs, exercises])

  async function handleSaveMetadata() {
    if (!selectedExercise) return
    setMetaSaving(true)
    try {
      const { error } = await supabase
        .from('gym_exercises')
        .update({
          image_url: imageDraft.trim() || null,
          exercise_note: noteDraft.trim() || null,
        })
        .eq('id', selectedExercise.id)

      if (error) throw error
      await fetchAll(user)
      setFeedback({ type: 'success', text: 'Ficha del ejercicio actualizada.' })
    } catch (error) {
      console.error('Gym handleSaveMetadata:', error)
      setFeedback({ type: 'error', text: 'No se pudo guardar la ficha.' })
    } finally {
      setMetaSaving(false)
    }
  }

  async function handleSaveLog(event) {
    event?.preventDefault?.()
    if (!user || !recordForm.exerciseId || !recordForm.weight || !recordForm.reps) return
    setRecordSaving(true)
    try {
      const payload = {
        user_id: user.id,
        exercise_id: recordForm.exerciseId,
        workout_date: formatDateISO(new Date()),
        weight_kg: Number(recordForm.weight),
        reps: Number(recordForm.reps),
      }

      const { error } = await supabase
        .from('gym_logs')
        .upsert(payload, { onConflict: 'user_id,exercise_id,workout_date' })

      if (error) throw error
      await fetchAll(user)

      const savedExercise = exercises.find((item) => item.id === recordForm.exerciseId)
      setSelectedExerciseId(recordForm.exerciseId)
      setFeedback({
        type: 'success',
        text: `Guardado ${savedExercise?.name || 'ejercicio'}: ${payload.weight_kg} kg x ${payload.reps}.`,
      })
      setRecordForm((prev) => ({ ...prev, weight: '', reps: '' }))
    } catch (error) {
      console.error('Gym handleSaveLog:', error)
      setFeedback({ type: 'error', text: 'No se pudo guardar el registro.' })
    } finally {
      setRecordSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="flex items-center gap-3 text-slate-300">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-blue-500" />
          Cargando gimnasio...
        </div>
      </div>
    )
  }

  if (!user) {
    navigate('/')
    return null
  }

  const selectedRecord = selectedExercise ? bestLogByExerciseId.get(selectedExercise.id) : null
  const selectedLastDays = selectedExercise ? daysSince(lastLogByExerciseId.get(selectedExercise.id)?.workout_date) : null
  const todaysSelectedLog = logs.find(
    (log) => log.exercise_id === recordForm.exerciseId && log.workout_date === formatDateISO(new Date())
  )

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans">
      <div className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="rounded-full px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              ← pedrOS
            </button>
            <h1 className="mt-2 text-2xl font-bold text-white">Gimnasio</h1>
            <p className="text-sm text-slate-400">Catálogo, progreso y registro rápido para el móvil.</p>
          </div>
        </div>

        <div className="px-4 pb-4 sm:px-6">
          <div className="inline-flex rounded-2xl border border-slate-700 bg-slate-800 p-1">
            {TABS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setTab(item.value)}
                className={cx(
                  'rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
                  tab === item.value ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {feedback && (
        <div className="px-4 pt-4 sm:px-6">
          <div
            className={cx(
              'rounded-2xl border px-4 py-3 text-sm',
              feedback.type === 'success'
                ? 'border-emerald-700/50 bg-emerald-500/10 text-emerald-200'
                : 'border-rose-700/50 bg-rose-500/10 text-rose-200'
            )}
          >
            {feedback.text}
          </div>
        </div>
      )}

      <div className="px-4 py-4 sm:px-6 sm:py-6">
        {tab === 'exercises' && (
          <div className="grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-4">
            <div className={cx(PANEL, 'p-4 space-y-4')}>
              <SectionHeader
                title="Ejercicios"
                subtitle="Busca por nombre y entra a la ficha completa."
              />

              <div className="space-y-3">
                <input
                  value={exerciseSearch}
                  onChange={(event) => setExerciseSearch(event.target.value)}
                  className={INPUT}
                  placeholder="Buscar ejercicio..."
                />

                <div className="flex flex-wrap gap-2">
                  {GROUPS.map((group) => (
                    <button
                      key={group.value}
                      type="button"
                      onClick={() => setGroupFilter(group.value)}
                      className={cx(
                        'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                        groupFilter === group.value
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-900 text-slate-300 hover:bg-slate-700'
                      )}
                    >
                      {group.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
                {filteredExercises.length ? (
                  filteredExercises.map((exercise) => (
                    <ExerciseRow
                      key={exercise.id}
                      exercise={exercise}
                      isSelected={selectedExerciseId === exercise.id}
                      record={bestLogByExerciseId.get(exercise.id)}
                      lastDays={daysSince(lastLogByExerciseId.get(exercise.id)?.workout_date)}
                      onClick={() => setSelectedExerciseId(exercise.id)}
                    />
                  ))
                ) : (
                  <EmptyState title="No hay ejercicios" subtitle="Prueba otro filtro o búsqueda." />
                )}
              </div>
            </div>

            <div className={cx(PANEL, 'p-4 sm:p-5')}>
              {selectedExercise ? (
                <div className="space-y-5">
                  <SectionHeader
                    title={selectedExercise.name}
                    subtitle={groupLabel(selectedExercise.muscle_group)}
                    right={
                      <div className="inline-flex rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300">
                        Récord: {selectedRecord ? formatKg(selectedRecord.weight_kg) : '—'}
                      </div>
                    }
                  />

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-3">
                        {selectedExercise.image_url ? (
                          <img
                            src={selectedExercise.image_url}
                            alt={selectedExercise.name}
                            className="w-full rounded-xl object-cover aspect-square bg-slate-900"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="aspect-square rounded-xl bg-slate-900 text-slate-500 flex items-center justify-center text-sm text-center px-4">
                            Añade una URL de imagen para este ejercicio
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <StatCard
                          label="Récord histórico"
                          value={selectedRecord ? formatKg(selectedRecord.weight_kg) : '—'}
                          help={selectedRecord ? `${selectedRecord.reps} reps · ${formatDateDisplay(selectedRecord.workout_date)}` : 'Sin registros'}
                          tone="blue"
                        />
                        <StatCard
                          label="Última vez"
                          value={selectedLastDays != null ? `${selectedLastDays} d` : '—'}
                          help={selectedLastDays != null ? formatDateDisplay(lastLogByExerciseId.get(selectedExercise.id)?.workout_date) : 'Sin registros'}
                        />
                      </div>

                      <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 space-y-3">
                        <p className="text-sm font-semibold text-white">Editar ficha</p>
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">URL de imagen</label>
                          <input
                            value={imageDraft}
                            onChange={(event) => setImageDraft(event.target.value)}
                            className={INPUT}
                            placeholder="https://... o /gym/press-banca.jpg"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Nota general del ejercicio</label>
                          <textarea
                            value={noteDraft}
                            onChange={(event) => setNoteDraft(event.target.value)}
                            className={TEXTAREA}
                            placeholder="Ejemplo: peso por mancuerna, mantener recorrido completo..."
                          />
                        </div>
                        <button type="button" onClick={handleSaveMetadata} disabled={metaSaving} className={BTN_PRIMARY}>
                          {metaSaving ? 'Guardando...' : 'Guardar ficha'}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex rounded-2xl border border-slate-700 bg-slate-900 p-1">
                          {RANGE_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setRange(option.value)}
                              className={cx(
                                'rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors',
                                range === option.value ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                              )}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <ProgressChart points={chartPoints} />

                      <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
                        <p className="text-sm font-semibold text-white">Historial reciente</p>
                        <div className="mt-3 space-y-2 max-h-56 overflow-y-auto">
                          {selectedExerciseLogs.length ? (
                            [...selectedExerciseLogs]
                              .sort((a, b) => new Date(b.workout_date) - new Date(a.workout_date))
                              .slice(0, 12)
                              .map((log) => (
                                <div key={log.id} className="flex items-center justify-between rounded-xl bg-slate-900 px-3 py-2 text-sm">
                                  <span className="text-slate-300">{formatDateDisplay(log.workout_date)}</span>
                                  <span className="font-semibold text-white">{formatKg(log.weight_kg)}</span>
                                  <span className="text-slate-400">{log.reps} reps</span>
                                </div>
                              ))
                          ) : (
                            <p className="text-sm text-slate-500">Aún no has registrado este ejercicio.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState title="Selecciona un ejercicio" subtitle="Toca un ejercicio de la lista para ver su ficha." />
              )}
            </div>
          </div>
        )}

        {tab === 'stats' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <StatCard label="Registros totales" value={stats.totalLogs} tone="blue" />
              <StatCard label="Días de gym" value={stats.totalTrainingDays} />
              <StatCard
                label="Δ media último mes"
                value={stats.avgDelta != null ? `${stats.avgDelta >= 0 ? '+' : ''}${stats.avgDelta.toFixed(1)} kg` : '—'}
                tone={stats.avgDelta == null ? 'default' : stats.avgDelta >= 0 ? 'green' : 'red'}
                help={stats.avgPct != null ? `${stats.avgPct >= 0 ? '+' : ''}${stats.avgPct.toFixed(1)}% vs mes anterior` : 'Se necesitan datos en ambos meses'}
              />
              <StatCard
                label="Ejercicios activos"
                value={new Set(logs.map((log) => log.exercise_id)).size}
                help="Ejercicios con al menos un registro"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className={cx(PANEL, 'p-4')}>
                <SectionHeader title="Ejercicios favoritos" subtitle="Los que más haces en todo el histórico." />
                <div className="mt-4 space-y-2">
                  {stats.allTimeTop.length ? stats.allTimeTop.map((item, index) => (
                    <div key={item.exercise?.id || index} className="flex items-center justify-between rounded-xl bg-slate-900/60 px-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">{item.exercise?.name}</p>
                        <p className="text-xs text-slate-400">{groupLabel(item.exercise?.muscle_group)}</p>
                      </div>
                      <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200">
                        {item.count} registro{item.count === 1 ? '' : 's'}
                      </span>
                    </div>
                  )) : <p className="text-sm text-slate-500">Aún no hay datos.</p>}
                </div>
              </div>

              <div className={cx(PANEL, 'p-4')}>
                <SectionHeader title="Ejercicios más entrenados" subtitle="Últimos 30 días." />
                <div className="mt-4 space-y-2">
                  {stats.recentTop.length ? stats.recentTop.map((item, index) => (
                    <div key={item.exercise?.id || index} className="flex items-center justify-between rounded-xl bg-slate-900/60 px-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">{item.exercise?.name}</p>
                        <p className="text-xs text-slate-400">{groupLabel(item.exercise?.muscle_group)}</p>
                      </div>
                      <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200">
                        {item.count} este mes
                      </span>
                    </div>
                  )) : <p className="text-sm text-slate-500">Sin registros recientes.</p>}
                </div>
              </div>

              <div className={cx(PANEL, 'p-4')}>
                <SectionHeader title="Mayor mejora" subtitle="Media del último mes vs mes anterior." />
                <div className="mt-4 space-y-2">
                  {stats.bestImprovement.length ? stats.bestImprovement.map((item) => (
                    <div key={item.exercise.id} className="flex items-center justify-between rounded-xl bg-slate-900/60 px-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">{item.exercise.name}</p>
                        <p className="text-xs text-slate-400">
                          {item.previousAvg.toFixed(1)} → {item.recentAvg.toFixed(1)} kg
                        </p>
                      </div>
                      <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
                        +{item.delta.toFixed(1)} kg
                      </span>
                    </div>
                  )) : <p className="text-sm text-slate-500">Aún no hay suficiente histórico.</p>}
                </div>
              </div>

              <div className={cx(PANEL, 'p-4')}>
                <SectionHeader title="Peor evolución" subtitle="Media del último mes vs mes anterior." />
                <div className="mt-4 space-y-2">
                  {stats.worstDecline.length ? stats.worstDecline.map((item) => (
                    <div key={item.exercise.id} className="flex items-center justify-between rounded-xl bg-slate-900/60 px-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">{item.exercise.name}</p>
                        <p className="text-xs text-slate-400">
                          {item.previousAvg.toFixed(1)} → {item.recentAvg.toFixed(1)} kg
                        </p>
                      </div>
                      <span className="rounded-full bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-300">
                        {item.delta.toFixed(1)} kg
                      </span>
                    </div>
                  )) : <p className="text-sm text-slate-500">Sin descensos medibles todavía.</p>}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className={cx(PANEL, 'p-4')}>
                <SectionHeader title="Frecuencia por grupo muscular" subtitle="Conteo de registros acumulados." />
                <div className="mt-4 space-y-3">
                  {stats.groupFrequency.map((item) => {
                    const maxCount = Math.max(1, ...stats.groupFrequency.map((row) => row.count))
                    const pct = (item.count / maxCount) * 100
                    return (
                      <div key={item.group}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-semibold text-slate-200">{item.label}</span>
                          <span className="text-slate-400">{item.count}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-900 overflow-hidden">
                          <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className={cx(PANEL, 'p-4')}>
                <SectionHeader title="Días desde la última vez" subtitle="Tus ejercicios con su último registro." />
                <div className="mt-4 space-y-2 max-h-[420px] overflow-y-auto">
                  {stats.lastPerformed.length ? stats.lastPerformed.map((item) => (
                    <div key={item.exercise.id} className="flex items-center justify-between rounded-xl bg-slate-900/60 px-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">{item.exercise.name}</p>
                        <p className="text-xs text-slate-400">{formatDateDisplay(item.log.workout_date)}</p>
                      </div>
                      <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200">
                        {item.days} día{item.days === 1 ? '' : 's'}
                      </span>
                    </div>
                  )) : <p className="text-sm text-slate-500">Aún no hay registros.</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'log' && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
            <div className={cx(PANEL, 'p-4 space-y-4')}>
              <SectionHeader title="Registro rápido" subtitle="Pensado para usarlo desde el móvil en el gym." />

              <form onSubmit={handleSaveLog} className="space-y-4">
                <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
                  <p className="text-sm font-semibold text-white">
                    {recordForm.exerciseId ? (exercises.find((item) => item.id === recordForm.exerciseId)?.name || 'Selecciona un ejercicio') : 'Selecciona un ejercicio'}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">Fecha automática: {formatDateDisplay(new Date())}</p>
                  {todaysSelectedLog && (
                    <p className="mt-2 text-xs text-blue-300">
                      Ya existe hoy: {formatKg(todaysSelectedLog.weight_kg)} x {todaysSelectedLog.reps}. Si guardas, se sobreescribe.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Peso máximo</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.5"
                      value={recordForm.weight}
                      onChange={(event) => setRecordForm((prev) => ({ ...prev, weight: event.target.value }))}
                      className={INPUT}
                      placeholder="Ej. 80"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Repeticiones</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      step="1"
                      value={recordForm.reps}
                      onChange={(event) => setRecordForm((prev) => ({ ...prev, reps: event.target.value }))}
                      className={INPUT}
                      placeholder="Ej. 6"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!recordForm.exerciseId || !recordForm.weight || !recordForm.reps || recordSaving}
                  className={cx(BTN_PRIMARY, 'w-full py-3 text-base')}
                >
                  {recordSaving ? 'Guardando...' : 'Guardar ejercicio'}
                </button>
              </form>

              <div>
                <p className="mb-2 text-sm font-semibold text-white">Últimos ejercicios usados</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {recentExerciseQuickPicks.length ? recentExerciseQuickPicks.map((exercise) => (
                    <button
                      key={exercise.id}
                      type="button"
                      onClick={() => {
                        setSelectedExerciseId(exercise.id)
                        setRecordForm((prev) => ({ ...prev, exerciseId: exercise.id }))
                      }}
                      className={cx(
                        'flex-shrink-0 rounded-full border px-3 py-2 text-xs font-semibold transition-colors',
                        recordForm.exerciseId === exercise.id
                          ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                          : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600'
                      )}
                    >
                      {exercise.name}
                    </button>
                  )) : <p className="text-sm text-slate-500">Aún no hay registros.</p>}
                </div>
              </div>
            </div>

            <div className={cx(PANEL, 'p-4 space-y-4')}>
              <div className="space-y-3">
                <input
                  value={exerciseSearch}
                  onChange={(event) => setExerciseSearch(event.target.value)}
                  className={INPUT}
                  placeholder="Buscar ejercicio para registrar..."
                />
                <div className="flex flex-wrap gap-2">
                  {GROUPS.map((group) => (
                    <button
                      key={group.value}
                      type="button"
                      onClick={() => setGroupFilter(group.value)}
                      className={cx(
                        'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                        groupFilter === group.value ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-700'
                      )}
                    >
                      {group.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
                {filteredExercises.length ? (
                  filteredExercises.map((exercise) => (
                    <button
                      key={exercise.id}
                      type="button"
                      onClick={() => {
                        setSelectedExerciseId(exercise.id)
                        setRecordForm((prev) => ({ ...prev, exerciseId: exercise.id }))
                      }}
                      className={cx(
                        'w-full rounded-2xl border px-3 py-3 text-left transition-all',
                        recordForm.exerciseId === exercise.id
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-slate-700 bg-slate-900/50 hover:border-slate-600 hover:bg-slate-900'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Poster src={exercise.image_url} alt={exercise.name} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-white">{exercise.name}</p>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
                            <span className="rounded-full bg-slate-800 px-2 py-0.5">{groupLabel(exercise.muscle_group)}</span>
                            {bestLogByExerciseId.get(exercise.id) && (
                              <span>Récord: {formatKg(bestLogByExerciseId.get(exercise.id).weight_kg)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <EmptyState title="No hay ejercicios" subtitle="Prueba otra búsqueda." />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
