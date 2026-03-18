// ═══════════════════════════════════════════════════════════════
// pedrOS · Finanzas ERP v3
// Tabs: Ahorro & Inversiones | Cuenta Corriente | Suscripciones
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import Papa from 'papaparse'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  ComposedChart, Area, Line,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'

// Worker bundled locally — no CDN, no fake worker warning
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

// ═══════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════
const Ic = ({ d, className }) => (
  <svg className={className ?? 'w-5 h-5'} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
)
const IArrowLeft = (p) => <Ic {...p} d="M15 19l-7-7 7-7" />
const IPlus      = (p) => <Ic {...p} d="M12 4v16m8-8H4" />
const ITrash     = (p) => <Ic {...p} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0a1 1 0 011-1h4a1 1 0 011 1m-6 0h6" />
const IEdit      = (p) => <Ic {...p} d="M15.232 5.232l3.536 3.536M9 13l6.5-6.5a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H8v-2.414a2 2 0 01.586-1.414z" />
const ILoader    = (p) => <Ic {...p} d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
const IUpload    = (p) => <Ic {...p} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
const ICheck     = (p) => <Ic {...p} d="M5 13l4 4L19 7" />
const IFilter    = (p) => <Ic {...p} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
const IChevronD  = (p) => <Ic {...p} d="M19 9l-7 7-7-7" />

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════
const INVESTMENT_PALETTE = [
  '#10b981','#3b82f6','#f59e0b','#ec4899',
  '#8b5cf6','#06b6d4','#f97316','#84cc16',
  '#e11d48','#14b8a6',
]

const CATEGORY_COLORS = {
  'Comida':          '#f97316',
  'Supermercado':    '#22c55e',
  'Transporte':      '#3b82f6',
  'Ocio':            '#a855f7',
  'Salud':           '#ec4899',
  'Hogar':           '#f59e0b',
  'Ropa':            '#06b6d4',
  'Tecnología':      '#8b5cf6',
  'Suscripciones':   '#e11d48',
  'Educación':       '#14b8a6',
  'Compras':         '#fb923c',
  'Ingreso':         '#10b981',
  'Sin categorizar': '#475569',
}

const DEFAULT_EXPENSE_CATEGORIES = [
  'Comida','Supermercado','Transporte','Ocio','Salud',
  'Hogar','Ropa','Tecnología','Suscripciones','Educación',
  'Compras',
]

const FIXED_CATEGORIES = ['Ingreso', 'Sin categorizar']

function uniqStrings(items) {
  return [...new Set((items ?? []).map((v) => String(v ?? '').trim()).filter(Boolean))]
}

function normalizeCategoryName(raw) {
  const clean = String(raw ?? '').replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

function buildCategories(managedCategories = []) {
  return uniqStrings([...managedCategories, ...FIXED_CATEGORIES])
}

function getCatColor(cat) {
  if (CATEGORY_COLORS[cat]) return CATEGORY_COLORS[cat]
  let h = 0
  for (const c of (cat ?? '')) h = c.charCodeAt(0) + ((h << 5) - h)
  return `hsl(${Math.abs(h) % 360},60%,55%)`
}

const DEFAULT_COLORS = Object.values(INVESTMENT_PALETTE)

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
const fmt = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n ?? 0)

const fmtPct = (n) =>
  `${n >= 0 ? '+' : ''}${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(n ?? 0)} %`

const fmtMonthLabel = (ym) => {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${months[parseInt(m, 10) - 1]} ${y.slice(2)}`
}

/** Limpia número en formato español: "9.389,60 €" → 9389.60 */
function parseEsNumber(raw) {
  if (raw == null) return NaN
  return Number(
    String(raw)
      .replace(/€/g, '').replace(/\s/g, '')
      .replace(/\./g, '').replace(/,/g, '.')
      .trim()
  )
}

/** Aplica reglas de categorización sobre una descripción */
function applyRules(description, rules) {
  const lower = description.toLowerCase()
  for (const rule of rules) {
    if (lower.includes(rule.keyword.toLowerCase())) return rule.category
  }
  return 'Sin categorizar'
}

/** Extrae primera keyword útil de una descripción para aprendizaje */
function extractKeyword(description) {
  return (description ?? '')
    .toLowerCase()
    .split(/[\s,./\*\-_]+/)
    .find((w) => w.length >= 3 && /[a-záéíóúñ0-9]/.test(w)) ?? ''
}

function getCustomCategoriesStorageKey(userId) {
  return `finance_custom_categories_${userId ?? 'guest'}`
}

function loadCustomCategories(userId) {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(getCustomCategoriesStorageKey(userId))
    if (!raw) return [...DEFAULT_EXPENSE_CATEGORIES]
    const parsed = JSON.parse(raw)
    const cleaned = uniqStrings(parsed.map(normalizeCategoryName)).filter((c) => !FIXED_CATEGORIES.includes(c))
    return cleaned.length ? cleaned : [...DEFAULT_EXPENSE_CATEGORIES]
  } catch {
    return []
  }
}

function saveCustomCategories(userId, categories) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    getCustomCategoriesStorageKey(userId),
    JSON.stringify(uniqStrings(categories.map(normalizeCategoryName)).filter((c) => !FIXED_CATEGORIES.includes(c)))
  )
}

function normalizeSlashDate(raw, defaultYear = new Date().getFullYear()) {
  const m = String(raw ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
  if (!m) return null
  const day = m[1].padStart(2, '0')
  const month = m[2].padStart(2, '0')
  let year = defaultYear
  if (m[3]) {
    year = m[3].length === 2 ? Number(`20${m[3]}`) : Number(m[3])
  } else {
    const now = new Date()
    const nowMonth = now.getMonth() + 1
    const monthNum = Number(month)
    if (monthNum > nowMonth + 1) year = defaultYear - 1
  }
  return `${year}-${month}-${day}`
}

function parsePastedTransactions(text, defaultYear = new Date().getFullYear()) {
  const lines = String(text ?? '')
    .split('\n')
    .map((l) => l.replace(/ /g, ' ').trim())
    .filter(Boolean)

  const transactions = []
  const seen = new Set()
  const isAmount = (line) => /^[+-]?\d{1,3}(?:\.\d{3})*,\d{2}\s*€$/.test(line)
  const isMonthHeader = (line) => /^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)$/i.test(line)

  let i = 0
  while (i < lines.length) {
    if (isMonthHeader(lines[i])) { i++; continue }

    const description = lines[i]
    let j = i + 1

    while (j < lines.length && !/(\d{1,2}\/\d{1,2})(?:\/\d{2,4})?/.test(lines[j])) {
      if (isAmount(lines[j])) break
      j++
    }

    if (j >= lines.length) break
    const dateMatch = lines[j].match(/(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(?:\s*-\s*(.+))?$/)
    if (!dateMatch) { i += 1; continue }

    const amountLine = lines[j + 1]
    if (!isAmount(amountLine)) { i += 1; continue }

    const date = normalizeSlashDate(dateMatch[1], defaultYear)
    const detail = dateMatch[2]?.trim()
    const descriptionFull = detail ? `${description} - ${detail}` : description
    const amountAbs = parseEsNumber(amountLine)
    if (!date || Number.isNaN(amountAbs)) { i = j + 1; continue }

    const signedAmount = amountLine.trim().startsWith('+') ? amountAbs : -amountAbs
    const key = `${date}|${descriptionFull}|${signedAmount}`
    if (!seen.has(key)) {
      transactions.push({ date, description: descriptionFull, amount: Number(signedAmount.toFixed(2)) })
      seen.add(key)
    }

    i = j + 2
  }

  return transactions
}


function buildTransactionDedupKey(t) {
  return [
    String(t.date ?? '').trim(),
    String(t.description ?? '').trim().toLowerCase().replace(/\s+/g, ' '),
    Number(t.amount ?? 0).toFixed(2),
  ].join('|')
}

function dedupeTransactions(rows) {
  const seen = new Set()
  const out = []
  for (const row of rows) {
    const key = buildTransactionDedupKey(row)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out
}

function sumByCategoryNet(transactions, yearMonth = '') {
  const map = {}
  for (const t of transactions) {
    if (yearMonth && t.date.slice(0, 7) !== yearMonth) continue
    const cat = t.category || 'Sin categorizar'
    map[cat] = (map[cat] || 0) + Number(t.amount)
  }
  return map
}

// ═══════════════════════════════════════════════════════════════
// INVESTMENT DATA LOGIC
// ═══════════════════════════════════════════════════════════════

/** Calcula estado actual de cada inversión desde sus movimientos */
function computeCurrentState(investments, movements) {
  const state = {}
  for (const inv of investments) state[inv.id] = { totalValue: 0, totalInvested: 0 }
  const sorted = [...movements].sort((a, b) => a.date.localeCompare(b.date))
  for (const mv of sorted) {
    if (!state[mv.investment_id]) continue
    const s = state[mv.investment_id]
    if (mv.type === 'aportacion') s.totalInvested += Number(mv.amount)
    if (mv.type === 'retiro')     s.totalInvested -= Number(mv.amount)
    s.totalValue = Number(mv.new_total_value)
  }
  return state
}

/** Genera datos carry-forward para el AreaChart mensual */
function formatChartData(investments, movements) {
  if (!movements.length) return []
  const sorted = [...movements].sort((a, b) => a.date.localeCompare(b.date))
  const first = sorted[0].date.slice(0, 7)
  const today = new Date().toISOString().slice(0, 7)
  const months = []
  let cur = first
  while (cur <= today) {
    months.push(cur)
    const [y, m] = cur.split('-').map(Number)
    cur = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  }
  const byInv = {}
  for (const inv of investments) byInv[inv.id] = []
  for (const mv of sorted) { if (byInv[mv.investment_id]) byInv[mv.investment_id].push(mv) }

  return months.map((month) => {
    const pt = { month }
    let invested = 0
    for (const inv of investments) {
      const rel = byInv[inv.id].filter((mv) => mv.date.slice(0, 7) <= month)
      pt[inv.id] = rel.length ? Number(rel[rel.length - 1].new_total_value) : 0
      for (const mv of rel) {
        if (mv.type === 'aportacion') invested += Number(mv.amount)
        else if (mv.type === 'retiro') invested -= Number(mv.amount)
      }
    }
    pt.__invested = invested
    return pt
  })
}

// ═══════════════════════════════════════════════════════════════
// CURRENT ACCOUNT DATA LOGIC
// ═══════════════════════════════════════════════════════════════

function getAvailableMonths(transactions) {
  const set = new Set(transactions.map((t) => t.date.slice(0, 7)))
  return [...set].sort().reverse()
}

function computeMonthlyBars(transactions) {
  const map = {}
  for (const t of transactions) {
    const ym = t.date.slice(0, 7)
    if (!map[ym]) map[ym] = { month: ym, __income: 0, __expenses: 0, __netExpenses: 0 }
    const amount = Number(t.amount)
    if (amount > 0) map[ym].__income += amount
    else map[ym].__expenses += Math.abs(amount)
  }

  for (const row of Object.values(map)) {
    const netByCat = sumByCategoryNet(transactions, row.month)
    let netExpenses = 0
    for (const [cat, netAmount] of Object.entries(netByCat)) {
      const netExpense = Math.max(0, -netAmount)
      if (netExpense > 0) {
        row[cat] = netExpense
        netExpenses += netExpense
      }
    }
    row.__netExpenses = netExpenses
  }

  return Object.values(map).sort((a, b) => a.month.localeCompare(b.month))
}

function computeDonut(transactions, yearMonth) {
  const map = sumByCategoryNet(transactions, yearMonth)
  return Object.entries(map)
    .map(([name, netAmount]) => ({ name, value: Math.max(0, -netAmount) }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value)
}

function computeDailyBalance(transactions, yearMonth) {
  const byDay = {}
  for (const t of transactions) {
    if (t.date.slice(0, 7) !== yearMonth) continue
    const day = t.date.slice(8, 10)
    byDay[day] = (byDay[day] || 0) + Number(t.amount)
  }
  const days = Object.keys(byDay).sort()
  let running = 0
  return days.map((day) => {
    running += byDay[day]
    return { day, balance: Number(running.toFixed(2)) }
  })
}

function computeTop5(transactions, yearMonth) {
  const map = {}
  for (const t of transactions) {
    if (t.date.slice(0, 7) !== yearMonth) continue
    const key = t.description
    if (!map[key]) map[key] = { description: t.description, amount: 0, category: t.category || 'Sin categorizar' }
    map[key].amount += Number(t.amount)
    if (Number(t.amount) < map[key].amount) map[key].category = t.category || map[key].category
  }
  return Object.values(map)
    .map((x) => ({ ...x, amount: Number(x.amount.toFixed(2)) }))
    .filter((x) => x.amount < 0)
    .sort((a, b) => a.amount - b.amount)
    .slice(0, 5)
}

// ═══════════════════════════════════════════════════════════════
// PDF PARSER (Trade Republic / generic European bank)
// ═══════════════════════════════════════════════════════════════

async function extractPdfText(file) {
  const buffer = await file.arrayBuffer()
  const pdf    = await pdfjsLib.getDocument({ data: buffer }).promise
  let fullText = ''

  for (let p = 1; p <= pdf.numPages; p++) {
    const page   = await pdf.getPage(p)
    const tc     = await page.getTextContent()

    // Group text items by Y coordinate for proper line reconstruction
    const byY = new Map()
    for (const item of tc.items) {
      if (!('str' in item)) continue
      const y = Math.round(item.transform[5])
      if (!byY.has(y)) byY.set(y, [])
      byY.get(y).push(item)
    }

    const ys = [...byY.keys()].sort((a, b) => b - a)   // PDF Y: 0 = bottom
    for (const y of ys) {
      const line = byY.get(y)
        .sort((a, b) => a.transform[4] - b.transform[4])
        .map((i) => i.str)
        .join('  ')
        .trim()
      if (line) fullText += line + '\n'
    }
    fullText += '\n'
  }
  return fullText
}

/**
 * Parses bank PDF text into transactions.
 *
 * Trade Republic España format (confirmed from real PDF):
 *   Dates split across two lines: "16 feb" on one line, "2026" on next.
 *   Columns: DESCRIPCIÓN | ENTRADA DE DINERO | SALIDA DE DINERO | BALANCE
 *   Sign determined from description keywords (incoming/outgoing/buy trade).
 */

const MESES_ES = {
  ene:'01',feb:'02',mar:'03',abr:'04',may:'05',jun:'06',
  jul:'07',ago:'08',sep:'09',oct:'10',nov:'11',dic:'12',
}

function parseDayMonth(str) {
  const m = str.trim().match(/^(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)$/i)
  if (!m) return null
  return { day: m[1].padStart(2,'0'), month: MESES_ES[m[2].toLowerCase()] }
}

function extractAmounts(str) {
  const re = /(\d{1,3}(?:\.\d{3})*,\d{2})\s*€/g
  const out = []; let m
  while ((m = re.exec(str)) !== null) out.push(parseEsNumber(m[1]))
  return out
}

function parseTransactionLine(line, date) {
  const SKIP = [
    /^TRADE REPUBLIC/i,/^TRANSACCIONES/i,/^RESUMEN/i,/^FECHA\s+TIPO/i,
    /^ENTRADA DE/i,/^SALIDA DE/i,/^BALANCE$/i,/^CUENTAS/i,/^NOTAS SOBRE/i,
    /^Trade Republic Bank/i,/^C\/ Velaz/i,/^NIF/i,/^Creado en/i,/^Página/i,/^www\./i,
    /^Brunnenstrasse/i,/^Registrada/i,/^Charlottenburg/i,
    /^Directores/i,/^Andreas/i,/^Gernot/i,/^Christian/i,/^Thomas/i,
  ]
  if (SKIP.some((re) => re.test(line.trim()))) return null

  const amounts = extractAmounts(line)
  if (amounts.length < 2) return null

  const movementAmt = amounts[amounts.length - 2]

  // Build clean description: remove all euro amounts, tipo words
  let desc = line
    .replace(/\d{1,3}(?:\.\d{3})*,\d{2}\s*€/g, '')
    .replace(/\bTransferencia\b/gi, '')
    .replace(/\bOperar\b/gi, '')
    .replace(/\bTransacci\u00f3n\s+con\s+tarjeta\b/gi, '')
    .replace(/\bcon\s+tarjeta\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  if (!desc || desc.length < 2) return null

  const descLower = desc.toLowerCase()
  const isIncoming =
    descLower.includes('incoming transfer') || descLower.includes('incoming') ||
    descLower.includes('inter\u00e9s') || descLower.includes('n\u00f3mina') ||
    descLower.includes('salary') || descLower.includes('reintegro')
  const isOutgoing =
    descLower.includes('outgoing transfer') || descLower.includes('outgoing') ||
    descLower.includes('buy trade')

  let amount
  if (isIncoming) amount = +movementAmt
  else            amount = -movementAmt   // outgoing, card, buy trade → expense

  if (isNaN(amount) || movementAmt === 0) return null
  return { date, description: desc, amount: Number(amount.toFixed(2)) }
}

function parseBankText(text) {
  const lines = text.split('\n').map((l) => l.trim())
  const isTR = /TRANSACCIONES DE CUENTA/i.test(text) || /TRADE REPUBLIC/i.test(text)
  return isTR ? parseTradeRepublic(lines) : parseGeneric(text)
}

/**
 * Trade Republic España: date is "DD mes" on one line, year on the next.
 * Accumulates lines until year is found, then parses the combined row.
 */
function parseTradeRepublic(lines) {
  const transactions = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const dateStart = line.match(/^(\d{1,2}\s+(?:ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic))\b/i)
    if (!dateStart) { i++; continue }

    const dm = parseDayMonth(dateStart[1])
    if (!dm) { i++; continue }

    let combined = line
    let year = null
    let j = i + 1

    while (j < lines.length && j < i + 8) {
      const next = lines[j]
      const yearMatch = next.match(/^(20\d{2})\b(.*)$/)
      if (yearMatch) {
        year = yearMatch[1]
        const rest = yearMatch[2].trim()
        if (rest) combined += '  ' + rest
        j++; break
      }
      if (/^(\d{1,2}\s+(?:ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic))\b/i.test(next)) break
      combined += '  ' + next
      j++
    }

    if (!year) { i++; continue }

    const date = `${year}-${dm.month}-${dm.day}`
    const withoutDate = combined.replace(/^\d{1,2}\s+\w+\s*/i, '').trim()
    const tx = parseTransactionLine(withoutDate, date)
    if (tx) transactions.push(tx)
    i = j
  }

  const seen = new Set()
  return transactions.filter((t) => {
    const key = `${t.date}|${t.description}|${t.amount}`
    if (seen.has(key)) return false
    seen.add(key); return true
  })
}

/** Generic fallback for banks using DD.MM.YYYY inline format */
function parseGeneric(text) {
  const transactions = []
  const re = /(\d{2}[./]\d{2}[./]\d{4})\s{2,}(.+?)\s{2,}([+-]?\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*€?(?:\s|$)/gm
  let m
  while ((m = re.exec(text)) !== null) {
    const date = normalizeDDMMYYYY(m[1])
    const amount = parseEsNumber(m[3])
    if (date && !isNaN(amount)) transactions.push({ date, description: m[2].trim(), amount })
  }
  const seen = new Set()
  return transactions.filter((t) => {
    const key = `${t.date}|${t.description}|${t.amount}`
    if (seen.has(key)) return false
    seen.add(key); return true
  })
}

function normalizeDDMMYYYY(raw) {
  const m = raw.match(/^(\d{2})[./](\d{2})[./](\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}
// ═══════════════════════════════════════════════════════════════
// UI PRIMITIVES
// ═══════════════════════════════════════════════════════════════
const inputCls     = 'w-full px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 transition-all text-sm'
const selectCls    = `${inputCls} appearance-none cursor-pointer`
const btnPrimary   = 'px-4 py-2.5 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed'
const btnSecondary = 'px-4 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold transition-all text-sm'
const btnBlue      = 'px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed'

function FF({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}
function ErrMsg({ msg }) {
  if (!msg) return null
  return <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{msg}</p>
}
function Spinner({ className }) {
  return <ILoader className={`animate-spin ${className ?? 'w-6 h-6'}`} />
}
function EmptyState({ text }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-600 text-sm gap-2">
      <span className="text-3xl">📭</span><p>{text}</p>
    </div>
  )
}
function Modal({ title, onClose, wide, children }) {
  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-start justify-center z-50 p-4 pt-12 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} shadow-2xl`}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-bold text-lg">{title}</h3>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-white transition-colors text-xl leading-none">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
function ChartCard({ title, children, className }) {
  return (
    <div className={`bg-slate-800 border border-slate-700 rounded-2xl p-4 ${className ?? ''}`}>
      <p className="text-sm font-bold text-white mb-4">{title}</p>
      {children}
    </div>
  )
}
function StatCard({ label, value, sub, valueClass, accent }) {
  return (
    <div className={`bg-slate-800 rounded-2xl border p-5 ${accent ?? 'border-slate-700'}`}>
      <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-2">{label}</p>
      <p className={`text-3xl font-black ${valueClass ?? 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// CUSTOM RECHARTS TOOLTIPS
// ═══════════════════════════════════════════════════════════════
const TT_STYLE = { backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: 8, fontSize: 12 }

function InvTooltip({ active, payload, label, investments }) {
  if (!active || !payload?.length) return null
  const imap = Object.fromEntries(investments.map((i) => [i.id, i]))
  const areas = payload.filter((p) => p.dataKey !== '__invested')
  const inv   = payload.find((p) => p.dataKey === '__invested')
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-xl p-3 text-xs shadow-2xl min-w-[160px]">
      <p className="text-slate-300 font-bold mb-2">{fmtMonthLabel(label)}</p>
      {areas.map((p) => (
        <div key={p.dataKey} className="flex justify-between gap-4 mb-1">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.fill }} />
            {imap[p.dataKey]?.name ?? p.dataKey}
          </span>
          <span className="font-semibold text-white">{fmt(p.value)}</span>
        </div>
      ))}
      <div className="border-t border-slate-600 mt-2 pt-2 flex justify-between">
        <span className="text-slate-400">Total</span>
        <span className="font-bold text-white">{fmt(areas.reduce((s, p) => s + (p.value ?? 0), 0))}</span>
      </div>
      {inv && <div className="flex justify-between mt-1"><span className="text-slate-400">Invertido</span><span className="text-yellow-400 font-semibold">{fmt(inv.value)}</span></div>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// CSV IMPORT MODAL (Indexa Capital)
// ═══════════════════════════════════════════════════════════════
function parseIndexaCsv(csvText, investmentId, userId) {
  const result = Papa.parse(csvText, {
    header: true, delimiter: ';', skipEmptyLines: true,
    transformHeader: (h) => h.replace(/^\uFEFF/, '').trim(),
  })
  const movements = []
  const errors    = []
  for (const [i, row] of result.data.entries()) {
    const date    = (row['Fecha'] ?? '').trim()
    const ntv     = parseEsNumber(row['EN EUROS (€)'])
    const aport   = parseEsNumber(row['Aportaciones netas del día (€)'])
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { errors.push(`Fila ${i + 2}: fecha inválida`); continue }
    if (Number.isNaN(ntv) || Number.isNaN(aport))     { errors.push(`Fila ${i + 2}: valores no numéricos`); continue }
    if (ntv === 0 && aport === 0) continue   // pre-funding rows
    const type   = aport > 0 ? 'aportacion' : aport < 0 ? 'retiro' : 'actualizacion_valor'
    const amount = Math.abs(aport)
    movements.push({ user_id: userId, investment_id: investmentId, date, type, amount, new_total_value: ntv })
  }
  return { movements, errors, totalRows: result.data.length }
}

function CsvImportModal({ investments, userId, onImported, onClose }) {
  const fileRef = useRef(null)
  const [invId,      setInvId]      = useState(investments[0]?.id ?? '')
  const [status,     setStatus]     = useState('idle')
  const [preview,    setPreview]    = useState(null)
  const [result,     setResult]     = useState(null)
  const [err,        setErr]        = useState('')
  const [newName,    setNewName]    = useState('')
  const [newColor,   setNewColor]   = useState(DEFAULT_COLORS[0])
  const [createNew,  setCreateNew]  = useState(investments.length === 0)

  function handleFile(e) {
    const file = e.target.files?.[0]; if (!file) return
    setStatus('parsing'); setPreview(null); setResult(null); setErr('')
    const r = new FileReader()
    r.onload = (ev) => {
      try { setPreview(parseIndexaCsv(ev.target.result, invId, userId)); setStatus('preview') }
      catch (ex) { setErr(ex.message); setStatus('error') }
    }
    r.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  async function handleUpload() {
    if (!preview?.movements?.length) return
    setStatus('uploading'); setErr('')
    try {
      let investment_id = invId
      if (createNew) {
        const name = newName.trim()
        if (!name) { setErr('Escribe el nombre.'); setStatus('preview'); return }
        const { data, error: e } = await supabase.from('finance_investments')
          .insert({ user_id: userId, name, color: newColor }).select().single()
        if (e) throw e
        investment_id = data.id
      }
      const rows = preview.movements.map((mv) => ({ ...mv, investment_id }))
      for (let i = 0; i < rows.length; i += 500) {
        const { error: e } = await supabase.from('finance_movements')
          .upsert(rows.slice(i, i + 500), { onConflict: 'investment_id,date', ignoreDuplicates: false })
        if (e) throw e
      }
      setResult({ upserted: rows.length }); setStatus('done'); onImported()
    } catch (ex) { setErr(ex.message); setStatus('error') }
  }

  return (
    <Modal title="🔄 Sincronizar CSV — Indexa Capital" onClose={onClose}>
      <div className="space-y-4">
        <FF label="Inversión">
          {!createNew ? (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <select className={selectCls} value={invId} onChange={(e) => setInvId(e.target.value)}>
                  {investments.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                <IChevronD className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>
              <button type="button" onClick={() => setCreateNew(true)} className="px-3 py-2 rounded-lg bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-600">+ Nueva</button>
            </div>
          ) : (
            <div className="space-y-2">
              <input className={inputCls} placeholder="Nombre" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Color:</span>
                {DEFAULT_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setNewColor(c)}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${newColor === c ? 'scale-125 border-white' : 'border-transparent'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
              {investments.length > 0 && <button type="button" onClick={() => setCreateNew(false)} className="text-xs text-slate-500 hover:text-slate-300 underline">← Usar existente</button>}
            </div>
          )}
        </FF>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
        <button type="button" disabled={status === 'uploading'} onClick={() => fileRef.current?.click()}
          className="w-full py-4 rounded-xl border-2 border-dashed border-slate-600 hover:border-yellow-500/60 bg-slate-900 hover:bg-yellow-500/5 text-slate-400 hover:text-yellow-300 transition-all flex flex-col items-center gap-2">
          {status === 'parsing' ? <Spinner /> : <IUpload className="w-6 h-6" />}
          <span className="text-sm font-semibold">{status === 'parsing' ? 'Leyendo...' : 'Seleccionar CSV de Indexa Capital'}</span>
          <span className="text-xs text-slate-600">El archivo se procesa en tu navegador — no se sube a ningún servidor</span>
        </button>
        {status === 'preview' && preview && (
          <div className="bg-slate-900 rounded-xl border border-slate-700 p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              {[['Filas totales', preview.totalRows, 'text-white'], ['A importar', preview.movements.length, 'text-emerald-400'], ['Con errores', preview.errors.length, 'text-red-400']].map(([l, v, cls]) => (
                <div key={l} className="bg-slate-800 rounded-lg p-3"><p className={`text-2xl font-black ${cls}`}>{v}</p><p className="text-xs text-slate-500 mt-0.5">{l}</p></div>
              ))}
            </div>
            {preview.movements.length > 0 && (
              <p className="text-xs text-slate-500">Rango: {preview.movements.at(-1).date} → {preview.movements[0].date}</p>
            )}
          </div>
        )}
        {status === 'done' && result && (
          <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-500/10 rounded-xl p-3 border border-emerald-500/20">
            <ICheck className="w-5 h-5" /><span><strong>{result.upserted}</strong> movimientos sincronizados.</span>
          </div>
        )}
        {status === 'uploading' && (
          <div className="flex items-center gap-2 text-slate-400 text-sm bg-slate-900 rounded-xl p-3 border border-slate-700">
            <Spinner /><span>Sincronizando con Supabase…</span>
          </div>
        )}
        <ErrMsg msg={err} />
        <div className="flex gap-3 pt-1">
          <button type="button" className={btnSecondary} onClick={onClose}>{status === 'done' ? 'Cerrar' : 'Cancelar'}</button>
          {status === 'preview' && preview?.movements?.length > 0 && (
            <button type="button" className={`${btnPrimary} flex-1`} onClick={handleUpload}>
              <span className="flex items-center justify-center gap-1.5"><IUpload className="w-4 h-4" />Sincronizar {preview.movements.length} movimientos</span>
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════
// MOVEMENT MODAL (Investments)
// ═══════════════════════════════════════════════════════════════
const EMPTY_MV = { investment_id: '', date: new Date().toISOString().slice(0, 10), type: 'aportacion', amount: '', new_total_value: '', newInvName: '', newInvColor: DEFAULT_COLORS[0], createNew: false }

const MOV_LABELS = {
  aportacion:          { label: 'Aportación',     color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  retiro:              { label: 'Retiro',          color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20' },
  actualizacion_valor: { label: 'Actualiz. Valor', color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/20' },
}

function MovementModal({ movement, investments, userId, onSaved, onClose }) {
  const isEdit = !!movement
  const [form, setForm] = useState(isEdit
    ? { ...EMPTY_MV, investment_id: movement.investment_id, date: movement.date, type: movement.type, amount: String(movement.amount), new_total_value: String(movement.new_total_value) }
    : { ...EMPTY_MV, investment_id: investments[0]?.id ?? '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  async function save() {
    setErr('')
    const amount = form.type === 'actualizacion_valor' ? 0 : parseFloat(form.amount)
    const ntv    = parseFloat(form.new_total_value)
    if (!form.date) return setErr('Fecha requerida.')
    if (form.type !== 'actualizacion_valor' && (isNaN(amount) || amount <= 0)) return setErr('Importe inválido.')
    if (isNaN(ntv) || ntv < 0) return setErr('Valor de mercado inválido.')
    setSaving(true)
    try {
      let investment_id = form.investment_id
      if (form.createNew) {
        if (!form.newInvName.trim()) { setErr('Nombre requerido.'); setSaving(false); return }
        const { data, error: e } = await supabase.from('finance_investments')
          .insert({ user_id: userId, name: form.newInvName.trim(), color: form.newInvColor }).select().single()
        if (e) throw e
        investment_id = data.id
      }
      if (!investment_id) { setErr('Selecciona una inversión.'); setSaving(false); return }
      const payload = { user_id: userId, investment_id, date: form.date, type: form.type, amount: amount || 0, new_total_value: ntv }
      const { error: e } = isEdit
        ? await supabase.from('finance_movements').update(payload).eq('id', movement.id)
        : await supabase.from('finance_movements').insert(payload)
      if (e) throw e
      onSaved()
    } catch (ex) { setErr(ex.message) } finally { setSaving(false) }
  }

  return (
    <Modal title={isEdit ? 'Editar Movimiento' : 'Nuevo Movimiento'} onClose={onClose}>
      <div className="space-y-4">
        <FF label="Inversión">
          {!form.createNew ? (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <select className={selectCls} value={form.investment_id} onChange={(e) => set('investment_id', e.target.value)}>
                  {investments.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                <IChevronD className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>
              <button type="button" onClick={() => set('createNew', true)} className="px-3 py-2 rounded-lg bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-600">+ Nueva</button>
            </div>
          ) : (
            <div className="space-y-2">
              <input className={inputCls} placeholder="Nombre de inversión" value={form.newInvName} onChange={(e) => set('newInvName', e.target.value)} autoFocus />
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Color:</span>
                {DEFAULT_COLORS.map((c) => <button key={c} type="button" onClick={() => set('newInvColor', c)}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${form.newInvColor === c ? 'scale-125 border-white' : 'border-transparent'}`} style={{ backgroundColor: c }} />)}
              </div>
              <button type="button" onClick={() => set('createNew', false)} className="text-xs text-slate-500 hover:text-slate-300 underline">← Usar existente</button>
            </div>
          )}
        </FF>
        <FF label="Fecha"><input className={inputCls} type="date" value={form.date} onChange={(e) => set('date', e.target.value)} /></FF>
        <FF label="Tipo">
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(MOV_LABELS).map(([k, { label }]) => (
              <button key={k} type="button" onClick={() => set('type', k)}
                className={`py-2 rounded-lg text-xs font-bold border transition-all ${form.type === k ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50' : 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600'}`}>
                {label}
              </button>
            ))}
          </div>
        </FF>
        {form.type !== 'actualizacion_valor' && (
          <FF label={form.type === 'aportacion' ? 'Importe aportado (€)' : 'Importe retirado (€)'}>
            <input className={inputCls} type="number" min="0.01" step="0.01" placeholder="500.00" value={form.amount} onChange={(e) => set('amount', e.target.value)} />
          </FF>
        )}
        <FF label="Valor total de mercado (€)">
          <input className={inputCls} type="number" min="0" step="0.01" placeholder="1250.00" value={form.new_total_value} onChange={(e) => set('new_total_value', e.target.value)} />
        </FF>
        <ErrMsg msg={err} />
        <div className="flex gap-3 pt-1">
          <button type="button" className={btnSecondary} onClick={onClose}>Cancelar</button>
          <button type="button" className={`${btnPrimary} flex-1`} onClick={save} disabled={saving}>{saving ? 'Guardando...' : isEdit ? 'Guardar' : 'Añadir'}</button>
        </div>
      </div>
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB: AHORRO E INVERSIONES
// ═══════════════════════════════════════════════════════════════
function InvestmentsTab({ investments, movements, userId, onRefresh }) {
  const [showCsv,    setShowCsv]    = useState(false)
  const [showMov,    setShowMov]    = useState(false)
  const [editMov,    setEditMov]    = useState(null)
  const [filterInv,  setFilterInv]  = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo,   setFilterTo]   = useState('')
  const [showFilter, setShowFilter] = useState(false)

  const currentState = useMemo(() => computeCurrentState(investments, movements), [investments, movements])
  const chartData    = useMemo(() => formatChartData(investments, movements), [investments, movements])

  const totalValue    = investments.reduce((s, i) => s + (currentState[i.id]?.totalValue    ?? 0), 0)
  const totalInvested = investments.reduce((s, i) => s + (currentState[i.id]?.totalInvested ?? 0), 0)
  const benefit       = totalValue - totalInvested
  const benefitPct    = totalInvested > 0 ? (benefit / totalInvested) * 100 : 0

  const invMap = Object.fromEntries(investments.map((i) => [i.id, i]))

  const filteredMovements = useMemo(() => {
    return [...movements]
      .filter((mv) => {
        if (filterInv  && mv.investment_id !== filterInv) return false
        if (filterFrom && mv.date < filterFrom) return false
        if (filterTo   && mv.date > filterTo)   return false
        return true
      })
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [movements, filterInv, filterFrom, filterTo])

  async function deleteMov(id) {
    if (!window.confirm('¿Eliminar movimiento?')) return
    await supabase.from('finance_movements').delete().eq('id', id)
    onRefresh()
  }
  async function deleteInv(id) {
    if (!window.confirm('¿Eliminar inversión y todos sus movimientos?')) return
    await supabase.from('finance_investments').delete().eq('id', id)
    onRefresh()
  }

  const hasFilter = filterInv || filterFrom || filterTo

  return (
    <div className="space-y-6">
      {/* Tarjeta Gold */}
      <div className="p-6 bg-slate-800 rounded-2xl border border-yellow-500/30 shadow-[0_0_35px_rgba(234,179,8,0.07)]">
        <div className="flex items-start justify-between mb-5">
          <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Patrimonio Total</p>
          <button type="button" onClick={() => setShowCsv(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-yellow-500/20 text-slate-400 hover:text-yellow-300 border border-slate-600 hover:border-yellow-500/40 transition-all text-xs font-semibold">
            <IUpload className="w-3.5 h-3.5" /> CSV
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div><p className="text-xs text-slate-500 mb-1">Valor Actual</p><p className="text-3xl font-black text-white">{fmt(totalValue)}</p></div>
          <div><p className="text-xs text-slate-500 mb-1">Total Invertido</p><p className="text-3xl font-black text-slate-300">{fmt(totalInvested)}</p></div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Rentabilidad</p>
            <p className={`text-3xl font-black ${benefit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(benefit)}</p>
            <p className={`text-base font-bold mt-0.5 ${benefit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtPct(benefitPct)}</p>
          </div>
        </div>
      </div>

      {/* Cards por inversión */}
      {investments.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {investments.map((inv, idx) => {
            const color = inv.color || INVESTMENT_PALETTE[idx % INVESTMENT_PALETTE.length]
            const s   = currentState[inv.id] ?? { totalValue: 0, totalInvested: 0 }
            const roi = s.totalInvested > 0 ? ((s.totalValue - s.totalInvested) / s.totalInvested) * 100 : 0
            return (
              <div key={inv.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-start gap-3" style={{ borderLeftColor: color, borderLeftWidth: 3 }}>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white text-sm truncate">{inv.name}</p>
                  <p className="text-xl font-black text-white mt-1">{fmt(s.totalValue)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Invertido: {fmt(s.totalInvested)}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-sm font-black ${roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtPct(roi)}</span>
                  <button type="button" onClick={() => deleteInv(inv.id)} className="text-slate-600 hover:text-red-400 transition-colors"><ITrash className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Gráfica */}
      <ChartCard title="Evolución del Patrimonio">
        {chartData.length < 2 ? <EmptyState text="Importa un CSV o añade movimientos." /> : (
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
              <defs>
                {investments.map((inv, idx) => {
                  const color = inv.color || INVESTMENT_PALETTE[idx % INVESTMENT_PALETTE.length]
                  return (
                    <linearGradient key={inv.id} id={`g_${inv.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={color} stopOpacity={0.7} />
                      <stop offset="95%" stopColor={color} stopOpacity={0.05} />
                    </linearGradient>
                  )
                })}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="month" tickFormatter={fmtMonthLabel} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k€`} width={40} />
              <Tooltip content={<InvTooltip investments={investments} />} cursor={{ stroke: '#334155', strokeWidth: 1 }} />
              <Legend formatter={(v) => { const i = investments.find((x) => x.id === v); return <span style={{ color: '#94a3b8', fontSize: 11 }}>{i?.name ?? (v === '__invested' ? 'Invertido' : v)}</span> }} wrapperStyle={{ paddingTop: 12 }} />
              {investments.map((inv, idx) => {
                const color = inv.color || INVESTMENT_PALETTE[idx % INVESTMENT_PALETTE.length]
                return <Area key={inv.id} type="monotone" dataKey={inv.id} stackId="p" stroke={color} strokeWidth={1.5} fill={`url(#g_${inv.id})`} name={inv.id} />
              })}
              <Line type="monotone" dataKey="__invested" stroke="#eab308" strokeWidth={2} dot={false} strokeDasharray="5 3" name="__invested" legendType="plainline" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Movimientos con filtros */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="text-sm font-bold text-white">Historial de Movimientos</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowFilter(!showFilter)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${hasFilter ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' : 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600'}`}>
              <IFilter className="w-3.5 h-3.5" /> Filtros {hasFilter && '●'}
            </button>
            <button type="button" className={btnPrimary} onClick={() => { setEditMov(null); setShowMov(true) }}>
              <span className="flex items-center gap-1"><IPlus className="w-4 h-4" /> Añadir</span>
            </button>
          </div>
        </div>

        {showFilter && (
          <div className="mb-3 p-4 bg-slate-800 rounded-xl border border-slate-700 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FF label="Inversión">
              <div className="relative">
                <select className={selectCls} value={filterInv} onChange={(e) => setFilterInv(e.target.value)}>
                  <option value="">Todas</option>
                  {investments.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                <IChevronD className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>
            </FF>
            <FF label="Desde"><input className={inputCls} type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} /></FF>
            <FF label="Hasta"><input className={inputCls} type="date" value={filterTo}   onChange={(e) => setFilterTo(e.target.value)} /></FF>
          </div>
        )}

        {filteredMovements.length === 0 ? <EmptyState text={hasFilter ? 'Sin resultados para los filtros.' : 'Sin movimientos todavía.'} /> : (
          <div className="space-y-2">
            {filteredMovements.map((mv) => {
              const inv  = invMap[mv.investment_id]
              const meta = MOV_LABELS[mv.type]
              return (
                <div key={mv.id} className="bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-xl px-4 py-3 flex items-center gap-3 transition-all">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: inv?.color || '#64748b' }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white text-sm">{inv?.name ?? '—'}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${meta.bg} ${meta.color}`}>{meta.label}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                      <span>{mv.date}</span>
                      {mv.type !== 'actualizacion_valor' && <span className={mv.type === 'aportacion' ? 'text-emerald-400' : 'text-red-400'}>{mv.type === 'aportacion' ? '+' : '-'}{fmt(mv.amount)}</span>}
                      <span>→ {fmt(mv.new_total_value)}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => { setEditMov(mv); setShowMov(true) }} className="p-1.5 rounded-lg text-slate-500 hover:text-yellow-400 hover:bg-yellow-500/10 transition-all"><IEdit className="w-4 h-4" /></button>
                    <button type="button" onClick={() => deleteMov(mv.id)} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"><ITrash className="w-4 h-4" /></button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showCsv && <CsvImportModal investments={investments} userId={userId} onImported={() => { setShowCsv(false); onRefresh() }} onClose={() => setShowCsv(false)} />}
      {showMov && <MovementModal movement={editMov} investments={investments} userId={userId} onSaved={() => { setShowMov(false); onRefresh() }} onClose={() => setShowMov(false)} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// PDF / TEXT IMPORT + CATEGORY MANAGEMENT
// ═══════════════════════════════════════════════════════════════
function TransactionsPreviewList({ parsed, categories, updateCat }) {
  return (
    <div className="max-h-52 sm:max-h-72 overflow-y-auto space-y-1.5 pr-1">
      {parsed.map((t, i) => (
        <div key={i} className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 flex items-center gap-3">
          <span className="text-xs text-slate-500 flex-shrink-0 w-20">{t.date}</span>
          <span className="text-xs text-slate-300 flex-1 truncate">{t.description}</span>
          <span className={`text-xs font-bold flex-shrink-0 w-24 text-right ${t.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(t.amount)}</span>
          <div className="relative flex-shrink-0 w-40">
            <select
              className="w-full text-xs px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-white focus:outline-none focus:border-blue-500 appearance-none"
              value={t.category}
              onChange={(e) => updateCat(i, e.target.value)}
            >
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <IChevronD className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>
        </div>
      ))}
    </div>
  )
}

async function uploadParsedTransactions(parsed, userId, existingTransactions = []) {
  const rows = dedupeTransactions(parsed.map((t) => ({
    user_id: userId,
    date: t.date,
    description: t.description,
    amount: t.amount,
    category: t.category,
  })))

  const existingKeys = new Set((existingTransactions ?? []).map(buildTransactionDedupKey))
  const toInsert = rows.filter((row) => !existingKeys.has(buildTransactionDedupKey(row)))

  for (let i = 0; i < toInsert.length; i += 500) {
    const { error } = await supabase.from('finance_transactions')
      .upsert(toInsert.slice(i, i + 500), { onConflict: 'user_id,date,description,amount', ignoreDuplicates: true })
    if (error) throw error
  }

  return { inserted: toInsert.length, skipped: rows.length - toInsert.length, totalParsed: rows.length }
}

function PdfImportModal({ categories, categoryRules, existingTransactions, userId, onImported, onClose }) {
  const fileRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const [parsed, setParsed] = useState([])
  const [rawText, setRawText] = useState('')
  const [err, setErr] = useState('')
  const [result, setResult] = useState(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setStatus('reading'); setParsed([]); setErr(''); setRawText('')
    e.target.value = ''
    try {
      const text = await extractPdfText(file)
      setRawText(text)
      setStatus('parsing')
      const txs = parseBankText(text)
      setParsed(txs.map((t) => ({ ...t, category: applyRules(t.description, categoryRules) })))
      setStatus('preview')
    } catch (ex) {
      setErr(ex.message ?? 'Error al leer el PDF.')
      setStatus('error')
    }
  }

  function updateCat(idx, cat) {
    setParsed((prev) => prev.map((t, i) => i === idx ? { ...t, category: cat } : t))
  }

  async function handleUpload() {
    if (!parsed.length) return
    setStatus('uploading'); setErr('')
    try {
      const summary = await uploadParsedTransactions(parsed, userId, existingTransactions)
      setResult(summary)
      setStatus('done')
      onImported()
    } catch (ex) {
      setErr(ex.message)
      setStatus('error')
    }
  }

  const isReading = status === 'reading' || status === 'parsing'
  const isUploading = status === 'uploading'

  return (
    <Modal title="📄 Importar Extracto PDF" onClose={onClose} wide>
      <div className="space-y-4">
        <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFile} />
        <button type="button" disabled={isReading || isUploading} onClick={() => fileRef.current?.click()}
          className="w-full py-4 rounded-xl border-2 border-dashed border-slate-600 hover:border-blue-500/60 bg-slate-900 hover:bg-blue-500/5 text-slate-400 hover:text-blue-300 transition-all flex flex-col items-center gap-2">
          {isReading ? (
            <>
              <Spinner className="w-7 h-7 text-blue-400" />
              <span className="text-sm font-semibold">{status === 'reading' ? 'Leyendo PDF...' : 'Analizando transacciones...'}</span>
            </>
          ) : (
            <>
              <IUpload className="w-7 h-7" />
              <span className="text-sm font-semibold">Seleccionar extracto PDF (Trade Republic, ING, Revolut…)</span>
              <span className="text-xs text-slate-600">El PDF se procesa en tu navegador — cero datos en el servidor</span>
            </>
          )}
        </button>

        {status === 'preview' && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-white">{parsed.length} transacciones detectadas</p>
              <p className="text-xs text-slate-500">Revisa y ajusta categorías si es necesario</p>
            </div>
            <TransactionsPreviewList parsed={parsed} categories={categories} updateCat={updateCat} />
          </>
        )}

        {status === 'done' && result && (
          <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-500/10 rounded-xl p-3 border border-emerald-500/20">
            <ICheck className="w-5 h-5" />
            <span><strong>{result.inserted}</strong> transacciones nuevas sincronizadas{result.skipped > 0 ? ` · ${result.skipped} duplicadas omitidas` : ''}.</span>
          </div>
        )}
        {isUploading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm bg-slate-900 rounded-xl p-3 border border-slate-700">
            <Spinner /><span>Importando a Supabase…</span>
          </div>
        )}
        <ErrMsg msg={err} />

        {rawText && status === 'preview' && (
          <details className="text-xs">
            <summary className="text-slate-600 cursor-pointer hover:text-slate-400 font-semibold">🔍 Ver texto extraído (debug)</summary>
            <pre className="mt-2 bg-slate-900 rounded-lg p-3 text-slate-500 overflow-auto max-h-40 text-xs leading-relaxed whitespace-pre-wrap">{rawText.slice(0, 3000)}{rawText.length > 3000 ? '\n[truncado…]' : ''}</pre>
          </details>
        )}

        <div className="flex gap-3 pt-1">
          <button type="button" className={btnSecondary} onClick={onClose}>{status === 'done' ? 'Cerrar' : 'Cancelar'}</button>
          {status === 'preview' && parsed.length > 0 && (
            <button type="button" className={`${btnBlue} flex-1`} onClick={handleUpload} disabled={isUploading}>
              <span className="flex items-center justify-center gap-1.5"><IUpload className="w-4 h-4" />Importar {parsed.length} transacciones</span>
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

function TextImportModal({ categories, categoryRules, existingTransactions, userId, onImported, onClose }) {
  const [rawText, setRawText] = useState('')
  const [parsed, setParsed] = useState([])
  const [status, setStatus] = useState('idle')
  const [err, setErr] = useState('')
  const [result, setResult] = useState(null)

  function handleParse() {
    setErr('')
    try {
      const txs = parsePastedTransactions(rawText)
      if (!txs.length) {
        setParsed([])
        setStatus('error')
        setErr('No he podido detectar transacciones con ese formato.')
        return
      }
      setParsed(txs.map((t) => ({ ...t, category: applyRules(t.description, categoryRules) })))
      setStatus('preview')
    } catch (ex) {
      setParsed([])
      setStatus('error')
      setErr(ex.message ?? 'Error al analizar el texto.')
    }
  }

  function updateCat(idx, cat) {
    setParsed((prev) => prev.map((t, i) => i === idx ? { ...t, category: cat } : t))
  }

  async function handleUpload() {
    if (!parsed.length) return
    setStatus('uploading'); setErr('')
    try {
      const summary = await uploadParsedTransactions(parsed, userId, existingTransactions)
      setResult(summary)
      setStatus('done')
      onImported()
    } catch (ex) {
      setErr(ex.message)
      setStatus('error')
    }
  }

  return (
    <Modal title="📝 Pegar transacciones" onClose={onClose} wide>
      <div className="space-y-4">
        <FF label="Texto bruto">
          <textarea
            className={`${inputCls} min-h-[220px] font-mono text-xs leading-relaxed`}
            placeholder={`Pega aquí bloques como:\nCapCut\nCapCut\n12/3\n\n23,99 €\n\nEneko Guinea Guinea\nEneko Guinea Guinea\n12/3 - Bizum\n\n+12,00 €`}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
          />
        </FF>

        <div className="flex gap-3">
          <button type="button" className={btnSecondary} onClick={onClose}>Cancelar</button>
          <button type="button" className={`${btnBlue} flex-1`} onClick={handleParse} disabled={!rawText.trim() || status === 'uploading'}>
            Analizar texto
          </button>
        </div>

        {status === 'preview' && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-white">{parsed.length} transacciones detectadas</p>
              <p className="text-xs text-slate-500">Formato compatible con bloques tipo descripción / fecha / importe</p>
            </div>
            <TransactionsPreviewList parsed={parsed} categories={categories} updateCat={updateCat} />
          </>
        )}

        {status === 'done' && result && (
          <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-500/10 rounded-xl p-3 border border-emerald-500/20">
            <ICheck className="w-5 h-5" />
            <span><strong>{result.inserted}</strong> transacciones nuevas sincronizadas{result.skipped > 0 ? ` · ${result.skipped} duplicadas omitidas` : ''}.</span>
          </div>
        )}

        {status === 'uploading' && (
          <div className="flex items-center gap-2 text-slate-400 text-sm bg-slate-900 rounded-xl p-3 border border-slate-700">
            <Spinner /><span>Importando a Supabase…</span>
          </div>
        )}

        <ErrMsg msg={err} />

        {status === 'preview' && parsed.length > 0 && (
          <button type="button" className={`${btnBlue} w-full`} onClick={handleUpload}>
            <span className="flex items-center justify-center gap-1.5"><IUpload className="w-4 h-4" />Importar {parsed.length} transacciones</span>
          </button>
        )}
      </div>
    </Modal>
  )
}

function CategoriesModal({ categories, onSave, onClose }) {
  const [items, setItems] = useState(categories)
  const [newCategory, setNewCategory] = useState('')
  const [err, setErr] = useState('')

  function addCategory() {
    const next = normalizeCategoryName(newCategory)
    if (!next) return
    if (buildCategories(items).includes(next)) {
      setErr('Esa categoría ya existe.')
      return
    }
    setItems((prev) => [...prev, next].sort((a, b) => a.localeCompare(b, 'es')))
    setNewCategory('')
    setErr('')
  }

  function removeCategory(cat) {
    setItems((prev) => prev.filter((c) => c !== cat))
  }

  return (
    <Modal title="🏷️ Categorías de gasto" onClose={onClose}>
      <div className="space-y-4">
        <FF label="Nueva categoría">
          <div className="flex gap-2">
            <input className={inputCls} placeholder="Ej. Viajes, Mascota, Deporte..." value={newCategory} onChange={(e) => setNewCategory(e.target.value)} autoFocus />
            <button type="button" className={btnPrimary} onClick={addCategory}>Añadir</button>
          </div>
        </FF>

        <ErrMsg msg={err} />

        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {items.length === 0 ? (
            <EmptyState text="Sin categorías de gasto configuradas." />
          ) : (
            items.map((cat) => (
              <div key={cat} className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: getCatColor(cat) }} />
                  <span className="text-sm font-semibold text-white truncate">{cat}</span>
                </div>
                <button type="button" onClick={() => removeCategory(cat)} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"><ITrash className="w-4 h-4" /></button>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-3 pt-1">
          <button type="button" className={btnSecondary} onClick={onClose}>Cancelar</button>
          <button type="button" className={`${btnPrimary} flex-1`} onClick={() => onSave(items)}>Guardar categorías</button>
        </div>
      </div>
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB: CUENTA CORRIENTE
// ═══════════════════════════════════════════════════════════════
function CuentaCorrienteTab({ transactions, categoryRules, categories, onSaveCategories, userId, onRefresh }) {
  const [showPdf, setShowPdf] = useState(false)
  const [showTextImport, setShowTextImport] = useState(false)
  const [showCategories, setShowCategories] = useState(false)
  const [editCatId, setEditCatId] = useState(null)
  const [editCatVal, setEditCatVal] = useState('')
  const [saving, setSaving] = useState(false)

  const availableMonths = useMemo(() => getAvailableMonths(transactions), [transactions])
  const [selMonth, setSelMonth] = useState(() => availableMonths[0] ?? new Date().toISOString().slice(0, 7))

  useEffect(() => {
    if (availableMonths.length && !availableMonths.includes(selMonth)) {
      setSelMonth(availableMonths[0])
    }
  }, [availableMonths, selMonth])

  const monthlyBars = useMemo(() => computeMonthlyBars(transactions), [transactions])
  const donutData = useMemo(() => computeDonut(transactions, selMonth), [transactions, selMonth])
  const dailyData = useMemo(() => computeDailyBalance(transactions, selMonth), [transactions, selMonth])
  const top5 = useMemo(() => computeTop5(transactions, selMonth), [transactions, selMonth])

  const expenseCats = useMemo(() => {
    const s = new Set()
    for (const row of monthlyBars) {
      for (const k of Object.keys(row)) {
        if (!['month', '__income', '__expenses'].includes(k)) s.add(k)
      }
    }
    return [...s]
  }, [monthlyBars])

  const selTransactions = useMemo(() =>
    [...transactions].filter((t) => t.date.slice(0, 7) === selMonth).sort((a, b) => b.date.localeCompare(a.date)),
    [transactions, selMonth]
  )

  const selIncome = selTransactions.reduce((s, t) => s + (Number(t.amount) > 0 ? Number(t.amount) : 0), 0)
  const selExpenses = selTransactions.reduce((s, t) => s + (Number(t.amount) < 0 ? Math.abs(Number(t.amount)) : 0), 0)
  const selBalance = selIncome - selExpenses

  async function saveCategory(transactionId, newCat, description) {
    setSaving(true)
    await supabase.from('finance_transactions').update({ category: newCat }).eq('id', transactionId)
    const kw = extractKeyword(description)
    if (kw) {
      await supabase.from('finance_category_rules')
        .upsert({ user_id: userId, keyword: kw, category: newCat }, { onConflict: 'user_id,keyword' })
    }
    setEditCatId(null)
    setSaving(false)
    onRefresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <select className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500 appearance-none pr-8"
              value={selMonth} onChange={(e) => setSelMonth(e.target.value)}>
              {availableMonths.map((m) => <option key={m} value={m}>{fmtMonthLabel(m)}</option>)}
            </select>
            <IChevronD className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>
          <p className="text-xs text-slate-500">{selTransactions.length} transacciones</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowCategories(true)} className={btnSecondary}>Categorías</button>
          <button type="button" onClick={() => setShowTextImport(true)} className={btnBlue}>Pegar texto</button>
          <button type="button" onClick={() => setShowPdf(true)} className={`${btnBlue} flex items-center gap-1.5`}>
            <IUpload className="w-4 h-4" /> Importar PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Ingresos" value={fmt(selIncome)} valueClass="text-emerald-400" accent="border-emerald-500/20" />
        <StatCard label="Gastos" value={fmt(selExpenses)} valueClass="text-red-400" accent="border-red-500/20" />
        <StatCard label="Balance neto" value={fmt(selBalance)} valueClass={selBalance >= 0 ? 'text-emerald-400' : 'text-red-400'} accent={selBalance >= 0 ? 'border-emerald-500/20' : 'border-red-500/20'} />
      </div>

      {transactions.length === 0 ? (
        <EmptyState text="Importa un extracto PDF o pega movimientos para ver tus gastos." />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Gasto Neto por Categoría (mensual)">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={monthlyBars} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="month" tickFormatter={fmtMonthLabel} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}€`} width={45} />
                  <Tooltip contentStyle={TT_STYLE} labelFormatter={fmtMonthLabel} formatter={(v, n) => [fmt(v), n]} />
                  <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                  {expenseCats.map((cat) => <Bar key={cat} dataKey={cat} stackId="x" fill={getCatColor(cat)} name={cat} />)}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Ingresos vs Gastos">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={monthlyBars} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="month" tickFormatter={fmtMonthLabel} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}€`} width={45} />
                  <Tooltip contentStyle={TT_STYLE} labelFormatter={fmtMonthLabel} formatter={(v, n) => [fmt(v), n === '__income' ? 'Ingresos' : 'Gastos']} />
                  <Legend formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 10 }}>{v === '__income' ? 'Ingresos' : 'Gastos'}</span>} />
                  <Bar dataKey="__income" name="__income" fill="#10b981" radius={[3,3,0,0]} />
                  <Bar dataKey="__netExpenses" name="__expenses" fill="#ef4444" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={`Distribución gasto neto — ${fmtMonthLabel(selMonth)}`}>
              {donutData.length === 0 ? <EmptyState text="Sin gastos este mes." /> : (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={2}>
                      {donutData.map((entry, i) => <Cell key={i} fill={getCatColor(entry.name)} />)}
                    </Pie>
                    <Tooltip contentStyle={TT_STYLE} formatter={(v, n) => [fmt(v), n]} />
                    <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 10 }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title={`Balance diario — ${fmtMonthLabel(selMonth)}`}>
              {dailyData.length === 0 ? <EmptyState text="Sin datos para este mes." /> : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={dailyData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}€`} width={50} />
                    <Tooltip contentStyle={TT_STYLE} formatter={(v) => [fmt(v), 'Flujo neto del día']} />
                    <Bar dataKey="balance" radius={[3,3,0,0]}>
                      {dailyData.map((entry, i) => (
                        <Cell key={i} fill={entry.balance >= 0 ? '#10b981' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          <ChartCard title={`🏆 Top 5 Gastos Netos — ${fmtMonthLabel(selMonth)}`}>
            {top5.length === 0 ? <EmptyState text="Sin gastos este mes." /> : (
              <div className="space-y-2">
                {top5.map((t, i) => {
                  const totalNetTopBase = donutData.reduce((s, x) => s + x.value, 0)
                  const pct = totalNetTopBase > 0 ? (Math.abs(Number(t.amount)) / totalNetTopBase) * 100 : 0
                  return (
                    <div key={t.id ?? i} className="flex items-center gap-3">
                      <span className="text-xs font-black text-slate-500 w-4 flex-shrink-0">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-white truncate">{t.description}</span>
                          <span className="text-xs font-bold text-red-400 ml-2 flex-shrink-0">{fmt(t.amount)}</span>
                        </div>
                        <div className="w-full bg-slate-700 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: getCatColor(t.category) }} />
                        </div>
                      </div>
                      <span className="text-xs text-slate-500 flex-shrink-0 w-12 text-right">{pct.toFixed(1)}%</span>
                    </div>
                  )
                })}
              </div>
            )}
          </ChartCard>

          <div>
            <p className="text-sm font-bold text-white mb-3">Transacciones — {fmtMonthLabel(selMonth)}</p>
            {selTransactions.length === 0 ? <EmptyState text="Sin transacciones este mes." /> : (
              <div className="space-y-1.5">
                {selTransactions.map((t, idx) => {
                  const isEditing = editCatId === t.id
                  return (
                    <div key={t.id ?? idx} className="bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-xl px-4 py-3 flex items-center gap-3 transition-all">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getCatColor(t.category) }} />
                      <span className="text-xs text-slate-500 flex-shrink-0 w-20">{t.date}</span>
                      <span className="text-xs text-white flex-1 truncate">{t.description}</span>
                      {isEditing ? (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="relative">
                            <select
                              className="text-xs px-2 py-1.5 rounded-lg bg-slate-900 border border-blue-500 text-white focus:outline-none appearance-none pr-6"
                              value={editCatVal}
                              onChange={(e) => setEditCatVal(e.target.value)}
                              autoFocus
                            >
                              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <IChevronD className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                          </div>
                          <button type="button" disabled={saving} onClick={() => saveCategory(t.id, editCatVal, t.description)}
                            className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-all disabled:opacity-50">
                            {saving ? <Spinner className="w-3.5 h-3.5" /> : <ICheck className="w-3.5 h-3.5" />}
                          </button>
                          <button type="button" onClick={() => setEditCatId(null)} className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs">✕</button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setEditCatId(t.id); setEditCatVal(t.category) }}
                          className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border font-semibold transition-all hover:opacity-80 flex-shrink-0"
                          style={{ backgroundColor: `${getCatColor(t.category)}20`, color: getCatColor(t.category), borderColor: `${getCatColor(t.category)}40` }}
                          title="Clic para editar categoría"
                        >
                          {t.category}
                          <IEdit className="w-3 h-3" />
                        </button>
                      )}
                      <span className={`text-sm font-bold flex-shrink-0 w-24 text-right ${Number(t.amount) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(t.amount)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {showPdf && (
        <PdfImportModal
          categories={categories}
          categoryRules={categoryRules}
          existingTransactions={transactions}
          userId={userId}
          onImported={() => { setShowPdf(false); onRefresh() }}
          onClose={() => setShowPdf(false)}
        />
      )}

      {showTextImport && (
        <TextImportModal
          categories={categories}
          categoryRules={categoryRules}
          existingTransactions={transactions}
          userId={userId}
          onImported={() => { setShowTextImport(false); onRefresh() }}
          onClose={() => setShowTextImport(false)}
        />
      )}

      {showCategories && (
        <CategoriesModal
          categories={categories.filter((c) => !FIXED_CATEGORIES.includes(c))}
          onSave={async (next) => {
            await onSaveCategories(next)
            setShowCategories(false)
          }}
          onClose={() => setShowCategories(false)}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB: SUSCRIPCIONES
// ═══════════════════════════════════════════════════════════════
const EMPTY_SUB = { name: '', cost: '', cycle: 'monthly' }

function SuscripcionesTab({ subscriptions, userId, onRefresh }) {
  const [showModal, setShowModal] = useState(false)
  const [form,  setForm]  = useState(EMPTY_SUB)
  const [err,   setErr]   = useState('')
  const [saving,setSaving]= useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const monthlyTotal = subscriptions.reduce(
    (s, sub) => s + (sub.cycle === 'yearly' ? Number(sub.cost) / 12 : Number(sub.cost)), 0
  )

  async function add() {
    setErr('')
    const name = form.name.trim(); const cost = parseFloat(form.cost)
    if (!name || isNaN(cost) || cost <= 0) return setErr('Rellena todos los campos.')
    setSaving(true)
    const { error: e } = await supabase.from('finance_subscriptions').insert({ user_id: userId, name, cost, cycle: form.cycle })
    if (e) { setErr(e.message); setSaving(false); return }
    setForm(EMPTY_SUB); setShowModal(false); setSaving(false); onRefresh()
  }

  async function del(id) {
    if (!window.confirm('¿Eliminar?')) return
    await supabase.from('finance_subscriptions').delete().eq('id', id)
    onRefresh()
  }

  return (
    <>
      <StatCard label="Gasto Mensual Fijo Total" value={fmt(monthlyTotal)} sub={`${fmt(monthlyTotal * 12)} / año`} valueClass="text-red-400" accent="border-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.06)]" />
      <div className="flex items-center justify-between mt-6 mb-4">
        <p className="text-sm font-bold text-white">{subscriptions.length} suscripción{subscriptions.length !== 1 ? 'es' : ''}</p>
        <button type="button" onClick={() => { setErr(''); setForm(EMPTY_SUB); setShowModal(true) }}
          className="px-4 py-2.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 font-bold text-sm flex items-center gap-1.5 transition-all">
          <IPlus className="w-4 h-4" /> Nueva
        </button>
      </div>
      {subscriptions.length === 0 ? <EmptyState text="Sin suscripciones registradas." /> : (
        <div className="space-y-2">
          {subscriptions.map((sub) => {
            const monthly = sub.cycle === 'yearly' ? Number(sub.cost) / 12 : Number(sub.cost)
            return (
              <div key={sub.id} className="bg-slate-800 border border-slate-700 hover:border-red-500/20 rounded-xl px-4 py-3 flex items-center justify-between gap-4 transition-all">
                <div>
                  <p className="font-semibold text-white text-sm">{sub.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{sub.cycle === 'yearly' ? `${fmt(sub.cost)}/año → ${fmt(monthly)}/mes` : `${fmt(sub.cost)}/mes`}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${sub.cycle === 'monthly' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}`}>
                    {sub.cycle === 'monthly' ? 'Mensual' : 'Anual'}
                  </span>
                  <button type="button" onClick={() => del(sub.id)} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"><ITrash className="w-4 h-4" /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {showModal && (
        <Modal title="Nueva Suscripción" onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <FF label="Nombre"><input className={inputCls} placeholder="Netflix, AWS..." value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus /></FF>
            <FF label="Coste (€)"><input className={inputCls} type="number" min="0.01" step="0.01" placeholder="9.99" value={form.cost} onChange={(e) => set('cost', e.target.value)} /></FF>
            <FF label="Ciclo">
              <div className="flex gap-3">
                {[{ v: 'monthly', l: '📅 Mensual' }, { v: 'yearly', l: '📆 Anual' }].map(({ v, l }) => (
                  <button key={v} type="button" onClick={() => set('cycle', v)}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-bold border transition-all ${form.cycle === v ? 'bg-red-500/20 text-red-300 border-red-500/50' : 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </FF>
            <ErrMsg msg={err} />
            <div className="flex gap-3 pt-1">
              <button type="button" className={btnSecondary} onClick={() => setShowModal(false)}>Cancelar</button>
              <button type="button" className={`${btnPrimary} flex-1`} onClick={add} disabled={saving}>{saving ? 'Guardando...' : 'Añadir'}</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════
const TABS = [
  { key: 'investments',    label: '📈 Inversiones' },
  { key: 'cuenta',         label: '🏦 Cuenta' },
  { key: 'subscriptions',  label: '💳 Suscripciones' },
]

export default function Finanzas() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [investments, setInvestments] = useState([])
  const [movements, setMovements] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [transactions, setTransactions] = useState([])
  const [categoryRules, setCategoryRules] = useState([])
  const [customCategories, setCustomCategories] = useState([])
  const [tab, setTab] = useState('investments')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
  }, [])

  const fetchAll = useCallback(async (uid) => {
    if (!uid) return
    const [invR, movR, subR, txR, rulesR] = await Promise.all([
      supabase.from('finance_investments').select('*').eq('user_id', uid).order('created_at'),
      supabase.from('finance_movements').select('*').eq('user_id', uid).order('date'),
      supabase.from('finance_subscriptions').select('*').eq('user_id', uid).order('created_at'),
      supabase.from('finance_transactions').select('*').eq('user_id', uid).order('date'),
      supabase.from('finance_category_rules').select('*').eq('user_id', uid),
    ])
    if (!invR.error) setInvestments(invR.data ?? [])
    if (!movR.error) setMovements(movR.data ?? [])
    if (!subR.error) setSubscriptions(subR.data ?? [])
    if (!txR.error) setTransactions(txR.data ?? [])
    if (!rulesR.error) setCategoryRules(rulesR.data ?? [])
  }, [])

  useEffect(() => { if (user) fetchAll(user.id) }, [user, fetchAll])
  useEffect(() => { if (user?.id) setCustomCategories(loadCustomCategories(user.id)) }, [user])

  const categories = useMemo(
    () => buildCategories(customCategories),
    [customCategories]
  )

  const handleSaveCategories = useCallback(async (next) => {
    if (!user?.id) return
    const cleaned = uniqStrings(next.map(normalizeCategoryName)).filter((c) => !FIXED_CATEGORIES.includes(c))
    const prev = uniqStrings(customCategories.map(normalizeCategoryName)).filter((c) => !FIXED_CATEGORIES.includes(c))
    const removed = prev.filter((c) => !cleaned.includes(c))

    if (removed.length) {
      const txToReset = transactions.filter((t) => removed.includes(t.category)).map((t) => t.id).filter(Boolean)
      if (txToReset.length) {
        const { error } = await supabase.from('finance_transactions').update({ category: 'Sin categorizar' }).in('id', txToReset)
        if (error) throw error
      }

      for (const removedCat of removed) {
        const { error } = await supabase
          .from('finance_category_rules')
          .update({ category: 'Sin categorizar' })
          .eq('user_id', user.id)
          .eq('category', removedCat)
        if (error) throw error
      }
    }

    setCustomCategories(cleaned)
    saveCustomCategories(user.id, cleaned)
    await fetchAll(user.id)
  }, [user, customCategories, transactions, fetchAll])

  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <ILoader className="w-10 h-10 text-yellow-400 animate-spin" />
    </div>
  )
  if (!user) { navigate('/'); return null }

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans">
      <div className="max-w-6xl mx-auto px-4 py-6 sm:px-6">

        <header className="flex items-center justify-between mb-4 sm:mb-6 p-3 sm:p-4 bg-slate-800 rounded-2xl border border-slate-700 shadow-lg">
          <button type="button" onClick={() => navigate('/')} className="text-slate-400 hover:text-white transition-colors" aria-label="Volver">
            <IArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg sm:text-2xl font-black bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">
            📊 Finanzas ERP
          </h1>
          <div className="w-8" />
        </header>

        <div className="flex gap-1 mb-6 bg-slate-800 p-1 rounded-xl border border-slate-700">
          {TABS.map(({ key, label }) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              className={`flex-1 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all duration-200 leading-tight ${tab === key ? 'bg-yellow-500 text-slate-900 shadow' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'investments' && (
          <InvestmentsTab investments={investments} movements={movements} userId={user.id} onRefresh={() => fetchAll(user.id)} />
        )}
        {tab === 'cuenta' && (
          <CuentaCorrienteTab transactions={transactions} categoryRules={categoryRules} categories={categories} onSaveCategories={handleSaveCategories} userId={user.id} onRefresh={() => fetchAll(user.id)} />
        )}
        {tab === 'subscriptions' && (
          <SuscripcionesTab subscriptions={subscriptions} userId={user.id} onRefresh={() => fetchAll(user.id)} />
        )}
      </div>
    </div>
  )
}
