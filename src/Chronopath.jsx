// ═══════════════════════════════════════════════════════════════
// pedrOS · Chronopath
// Diario de viajes — react-leaflet + OpenStreetMap (sin token)
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, CircleMarker, Tooltip, GeoJSON, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from './supabaseClient'

// ─── Constants ────────────────────────────────────────────────
const GEOJSON_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson'

const UN_MEMBERS = ["AFG","ALB","DZA","AND","AGO","ATG","ARG","ARM","AUS","AUT","AZE","BHS","BHR","BGD","BRB","BLR","BEL","BLZ","BEN","BTN","BOL","BIH","BWA","BRA","BRN","BGR","BFA","BDI","CPV","KHM","CMR","CAN","CAF","TCD","CHL","CHN","COL","COM","COG","COD","CRI","CIV","HRV","CUB","CYP","CZE","PRK","DNK","DJI","DMA","DOM","ECU","EGY","SLV","GNQ","ERI","EST","SWZ","ETH","FJI","FIN","FRA","GAB","GMB","GEO","DEU","GHA","GRC","GDN","GTM","GIN","GNB","GUY","HTI","HND","HUN","ISL","IND","IDN","IRN","IRQ","IRL","ISR","ITA","JAM","JPN","JOR","KAZ","KEN","KIR","KWT","KGZ","LAO","LVA","LBN","LSO","LBR","LBY","LIE","LTU","LUX","MDG","MWI","MYS","MDV","MLI","MLT","MHL","MRT","MUS","MEX","FSM","MCO","MNG","MNE","MAR","MOZ","MMR","NAM","NRU","NPL","NLD","NZL","NIC","NER","NGA","MKD","NOR","OMN","PAK","PLW","PAN","PNG","PRY","PER","PHL","POL","PRT","QAT","KOR","MDA","ROU","RUS","RWA","KNA","LCA","VCT","WSM","SMR","STP","SAU","SEN","SRB","SYC","SLE","SGP","SVK","SVN","SLB","SOM","ZAF","SSD","ESP","LKA","SDN","SUR","SWE","CHE","SYR","TJK","THA","TLS","TGO","TON","TTO","TUN","TUR","TKM","TUV","UGA","UKR","ARE","GBR","TZA","USA","URY","UZB","VUT","VEN","VNM","YEM","ZMB","ZWE"]

const MONTH_NAMES  = ["En","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
const MONTHS_FULL  = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
const CONTINENT_TRANS = { "Europe":"Europa","Africa":"África","Asia":"Asia","North America":"N. América","South America":"S. América","Oceania":"Oceanía","Antarctica":"Antártida" }
const EMPTY_STATE  = { countries: {}, cities: [], trips: [], history: [], pointSize: 5 }

function norm(s) { return s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase() }
function randomColor() { return `hsl(${Math.floor(Math.random()*300)+30},70%,60%)` }

// ─── Icons ─────────────────────────────────────────────────────
const Ic = ({ d, className }) => (
  <svg className={className ?? 'w-5 h-5'} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
)
const IArrow  = (p) => <Ic {...p} d="M15 19l-7-7 7-7" />
const ICloud  = (p) => <Ic {...p} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999A5 5 0 003 15z" />
const IUndo   = (p) => <Ic {...p} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
const IUpload = (p) => <Ic {...p} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
const ILoader = (p) => <Ic {...p} d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
const IChevD  = (p) => <Ic {...p} d="M19 9l-7 7-7-7" />
const IStats  = (p) => <Ic {...p} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
const IClock  = (p) => <Ic {...p} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />

// ─── FlyTo helper (inside MapContainer context) ────────────────
function FlyTo({ target }) {
  const map = useMap()
  useEffect(() => {
    if (!target) return
    map.flyTo([target.lat, target.lng], 7, { duration: 1.2 })
  }, [target, map])
  return null
}

// ─── Modal wrapper ─────────────────────────────────────────────
function Modal({ title, onClose, dark, children }) {
  return (
    <div className={`fixed inset-0 z-[3000] flex flex-col ${dark ? 'bg-[rgba(0,0,0,0.92)]' : 'bg-[rgba(240,242,245,0.97)]'}`} style={{ overflowY: 'auto' }}>
      <div className={`flex items-center justify-between px-5 py-4 sticky top-0 z-10 ${dark ? 'bg-[#1e1e1e] text-gray-200 border-b border-gray-700' : 'bg-white text-gray-800 border-b border-gray-200'}`}>
        <div className="w-20" />
        <h2 className="text-lg font-bold">{title}</h2>
        <button onClick={onClose} className={`text-2xl leading-none px-2 ${dark ? 'text-blue-400 hover:text-white' : 'text-gray-400 hover:text-gray-900'} transition-colors`}>✕</button>
      </div>
      <div className="flex-1 p-5 max-w-2xl mx-auto w-full">{children}</div>
    </div>
  )
}

// ─── Stats panel ───────────────────────────────────────────────
function StatsContent({ appState, geoMeta }) {
  const { countries, cities, trips } = appState
  const years = {}
  trips.forEach((t) => { years[t.year] = (years[t.year] || 0) + 1 })
  const sortedYears = Object.keys(years).sort()
  const maxY = Math.max(...Object.values(years), 1)

  const conts = {}
  Object.keys(countries).forEach((id) => {
    let c = geoMeta.continents[id] || 'Desconocido'
    c = CONTINENT_TRANS[c] || c
    conts[c] = (conts[c] || 0) + 1
  })
  const totalConts = Object.values(conts).reduce((a, b) => a + b, 0)

  const cityCounts = {}
  cities.forEach((c) => { cityCounts[c.country || '?'] = (cityCounts[c.country || '?'] || 0) + 1 })
  const sortedCC = Object.entries(cityCounts).sort((a, b) => b[1] - a[1])

  const PIE_COLORS = ['#4bc0c0','#ff6384','#36a2eb','#ffce56','#9966ff','#ff9f40','#c9cbcf','#e74c3c']

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl p-5 shadow-sm">
        <h3 className="font-bold text-gray-700 mb-4">Viajes por Año</h3>
        <div className="flex items-end gap-2 h-32">
          {sortedYears.map((y) => (
            <div key={y} className="flex flex-col items-center gap-1 flex-1">
              <span className="text-xs text-gray-500 font-semibold">{years[y]}</span>
              <div className="w-full rounded-t bg-blue-500" style={{ height: `${(years[y]/maxY)*96}px` }} />
              <span className="text-xs text-gray-400">{y}</span>
            </div>
          ))}
          {!sortedYears.length && <p className="text-gray-400 text-sm w-full text-center py-8">Sin datos</p>}
        </div>
      </div>

      <div className="bg-white rounded-xl p-5 shadow-sm">
        <h3 className="font-bold text-gray-700 mb-3">Países por Continente</h3>
        <div className="space-y-2">
          {Object.entries(conts).map(([name, count], i) => (
            <div key={name} className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-24 text-right">{name}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(count/totalConts)*100}%`, backgroundColor: PIE_COLORS[i%PIE_COLORS.length] }} />
              </div>
              <span className="text-xs font-bold text-gray-600 w-4">{count}</span>
            </div>
          ))}
          {!Object.keys(conts).length && <p className="text-gray-400 text-sm text-center py-2">Sin datos</p>}
        </div>
      </div>

      <div className="bg-white rounded-xl p-5 shadow-sm">
        <h3 className="font-bold text-gray-700 mb-3">Ciudades por País</h3>
        <table className="w-full text-sm text-gray-600">
          <thead><tr><th className="text-left py-1 border-b font-semibold">País</th><th className="text-right py-1 border-b font-semibold">Ciudades</th></tr></thead>
          <tbody>
            {sortedCC.length ? sortedCC.map(([c,n]) => (
              <tr key={c} className="border-b border-gray-50">
                <td className="py-1.5">{c}</td>
                <td className="py-1.5 text-right font-bold">{n}</td>
              </tr>
            )) : <tr><td colSpan={2} className="text-center text-gray-400 py-4">Sin ciudades</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl p-5 shadow-sm">
        <h3 className="font-bold text-gray-700 mb-3">Resumen General</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          {[['Países', Object.keys(countries).length, 'text-blue-600'], ['Ciudades', cities.length, 'text-red-500'], ['Viajes', trips.length, 'text-green-600']].map(([l,v,cls]) => (
            <div key={l}><p className={`text-4xl font-black ${cls}`}>{v}</p><p className="text-xs text-gray-500 mt-1">{l}</p></div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Timeline panel ────────────────────────────────────────────
function TimelineContent({ appState, iso3to2, onDelete }) {
  const { trips } = appState
  if (!trips.length) return <p className="text-center text-gray-400 mt-16">Sin viajes registrados.</p>

  const chronoTrips = [...trips].sort((a,b) => a.year!==b.year ? a.year-b.year : a.month-b.month)
  const visitCounts = {}
  chronoTrips.forEach((t) => { visitCounts[t.id]=(visitCounts[t.id]||0)+1; t.visitOrder=visitCounts[t.id] })

  const display = [...trips].sort((a,b) => b.year!==a.year ? b.year-a.year : b.month!==a.month ? b.month-a.month : (a.customOrder||0)-(b.customOrder||0))
  const byYear = {}
  display.forEach((t) => { if(!byYear[t.year]) byYear[t.year]=[]; byYear[t.year].push(t) })

  return (
    <div className="relative pl-8 pb-20">
      <div className="absolute top-4 bottom-0 left-[6px] w-0.5 bg-gray-700" />
      {Object.keys(byYear).sort((a,b)=>b-a).map((year) => (
        <div key={year} className="mb-8">
          <p className="text-2xl font-bold text-gray-500 mb-4 -ml-4">{year}</p>
          {byYear[year].map((t) => {
            const flag = `https://flagcdn.com/24x18/${iso3to2[t.id]||'xx'}.png`
            return (
              <div key={t.tripId} className="relative mb-6 pl-6">
                <div className="absolute left-[-26px] top-1.5 w-3 h-3 bg-yellow-400 rounded-full border-2 border-gray-900 z-10" />
                <div className="text-yellow-400 font-semibold text-lg flex items-center gap-2 flex-wrap">
                  <img src={flag} alt="" className="w-6 rounded-sm" crossOrigin="anonymous" onError={(e)=>e.target.style.display='none'} />
                  {t.name}
                  {t.visitOrder > 1 && <span className="text-gray-500 text-sm font-normal">({t.visitOrder}ª vez)</span>}
                </div>
                <p className="text-gray-400 text-sm mt-1">✈ {MONTH_NAMES[t.month-1]}, {t.year}</p>
                <button onClick={() => onDelete(t.tripId)} className="mt-1 text-xs text-gray-600 border border-gray-600 px-2 py-0.5 rounded hover:text-red-400 hover:border-red-400 transition-colors uppercase">
                  Eliminar
                </button>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function Chronopath() {
  const navigate = useNavigate()

  const [user,          setUser]          = useState(null)
  const [authLoading,   setAuthLoading]   = useState(true)
  const [appState,      setAppState]      = useState(EMPTY_STATE)
  const [saveStatus,    setSaveStatus]    = useState('')
  const [geoData,       setGeoData]       = useState(null)
  const [geoMeta,       setGeoMeta]       = useState({ iso3to2:{}, countryNames:{}, continents:{} })
  const [countryOptions,setCountryOptions]= useState([])
  const [geoLoading,    setGeoLoading]    = useState(true)

  // UI
  const [panelOpen,     setPanelOpen]     = useState(true)
  const [activeTab,     setActiveTab]     = useState('add')
  const [modal,         setModal]         = useState(null)
  const [flyTarget,     setFlyTarget]     = useState(null)

  // City search
  const [cityInput,     setCityInput]     = useState('')
  const [cityResults,   setCityResults]   = useState([])
  const [citySearching, setCitySearching] = useState(false)
  const [selectedCity,  setSelectedCity]  = useState(null)
  const [cityFilter,    setCityFilter]    = useState('')
  const searchTimer = useRef(null)

  // Trip form
  const [tripCountry,   setTripCountry]   = useState('')
  const [tripMonth,     setTripMonth]     = useState(new Date().getMonth()+1)
  const [tripYear,      setTripYear]      = useState(new Date().getFullYear())

  // Manual country
  const [manualAdd,     setManualAdd]     = useState('')
  const [manualDel,     setManualDel]     = useState('')

  // JSON import
  const jsonRef = useRef(null)
  const [importStatus,  setImportStatus]  = useState('')

  // ── Auth ──────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })
  }, [])

  // ── Load GeoJSON ───────────────────────────────────────────────
  useEffect(() => {
    fetch(GEOJSON_URL).then(r => r.json()).then(data => {
      const iso3to2 = {}, countryNames = {}, continents = {}
      const regionNames = new Intl.DisplayNames(['es'], { type: 'region' })
      data.features.forEach(f => {
        const i3 = f.properties.ADM0_A3 || f.properties.ISO_A3
        const i2 = f.properties.ISO_A2
        if (i3 && i2) iso3to2[i3] = i2.toLowerCase()
        if (i3 && f.properties.CONTINENT) continents[i3] = f.properties.CONTINENT
        if (i3 && i2 && i2 !== '-99') { try { countryNames[i3] = regionNames.of(i2) } catch { countryNames[i3] = f.properties.NAME } }
      })
      iso3to2['FRA']='fr'; iso3to2['NOR']='no'
      continents['FRA']='Europe'; continents['NOR']='Europe'
      if (countryNames['FRA']) countryNames['FRA']='Francia'

      const seen = new Set()
      const options = []
      data.features.forEach(f => {
        const id = f.properties.ADM0_A3 || f.properties.ISO_A3
        const name = countryNames[id] || f.properties.NAME
        if (id && UN_MEMBERS.includes(id) && !seen.has(id)) { seen.add(id); options.push({ id, name }) }
      })
      options.sort((a,b) => a.name.localeCompare(b.name))

      setGeoMeta({ iso3to2, countryNames, continents })
      setCountryOptions(options)
      setGeoData(data)
      setGeoLoading(false)
    }).catch(console.error)
  }, [])

  // ── Load from Supabase ─────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    supabase.from('chronopath_data').select('data').eq('user_id', user.id).single()
      .then(({ data }) => {
        if (data?.data) {
          const s = { ...EMPTY_STATE, ...data.data }
          s.countries = s.countries || {}
          s.cities    = s.cities    || []
          s.trips     = s.trips     || []
          s.history   = s.history   || []
          s.pointSize = s.pointSize || 5
          s.trips.forEach((t,i) => { if(!t.tripId) t.tripId=Date.now()+i; if(t.customOrder===undefined) t.customOrder=i })
          setAppState(s)
        }
      })
  }, [user])

  // ── Save ───────────────────────────────────────────────────────
  const saveToCloud = useCallback(async (state) => {
    if (!user) return
    setSaveStatus('saving')
    const { error } = await supabase.from('chronopath_data')
      .upsert(
        { user_id: user.id, data: state, updated_at: new Date().toISOString() },
        { onConflict: 'user_id', ignoreDuplicates: false }
      )
    setSaveStatus(error ? 'error' : 'saved')
    setTimeout(() => setSaveStatus(''), 2000)
  }, [user])

  // ── City search ────────────────────────────────────────────────
  function handleCityInput(val) {
    setCityInput(val); setSelectedCity(null)
    if (val.length < 3) { setCityResults([]); return }
    clearTimeout(searchTimer.current)
    setCitySearching(true)
    searchTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=10&accept-language=en&q=${encodeURIComponent(val)}`)
        const data = await r.json()
        setCityResults(
          data.filter(i => ['administrative','place','city','town'].includes(i.type) || i.class==='place')
              .map(i => {
                let label = i.name
                const r = i.address?.state || i.address?.region || ''
                const c = i.address?.country || ''
                if (r) label += `, ${r}`; if (c) label += `, ${c}`
                return { label, name: i.name, lat: parseFloat(i.lat), lng: parseFloat(i.lon), country: c }
              })
        )
      } finally { setCitySearching(false) }
    }, 600)
  }

  function addCity() {
    if (!selectedCity) return
    const newState = {
      ...appState,
      cities: [...appState.cities, { name: selectedCity.name, lat: selectedCity.lat, lng: selectedCity.lng, country: selectedCity.country }],
      history: [...appState.history, { type: 'city', index: appState.cities.length }],
    }
    setAppState(newState); saveToCloud(newState)
    setCityInput(''); setCityResults([]); setSelectedCity(null)
  }

  function deleteCity(index) {
    if (!window.confirm(`¿Eliminar ${appState.cities[index].name}?`)) return
    const newState = { ...appState, cities: appState.cities.filter((_,i) => i!==index) }
    setAppState(newState); saveToCloud(newState)
  }

  // ── Add trip ───────────────────────────────────────────────────
  function addFullTrip() {
    const found = countryOptions.find(o => norm(o.name)===norm(tripCountry))
    if (!found) { alert('País no encontrado en la lista.'); return }
    const maxOrder = appState.trips.reduce((m,t) => Math.max(m, t.customOrder||0), 0)
    const tripObj  = { id: found.id, name: found.name, month: tripMonth, year: tripYear, tripId: Date.now(), customOrder: maxOrder+1 }
    const newCountries = { ...appState.countries }
    let createdCountry = false
    if (!newCountries[found.id]) { newCountries[found.id] = randomColor(); createdCountry = true }
    const newState = { ...appState, trips: [...appState.trips, tripObj], countries: newCountries, history: [...appState.history, { type:'trip', tripObj, createdCountry }] }
    setAppState(newState); saveToCloud(newState); setTripCountry('')
  }

  function delTrip(tripId) {
    if (!window.confirm('¿Borrar este viaje?')) return
    const newState = { ...appState, trips: appState.trips.filter(t => t.tripId!==tripId) }
    setAppState(newState); saveToCloud(newState)
  }

  // ── Undo ───────────────────────────────────────────────────────
  function undoAction() {
    const history = [...appState.history]
    const last = history.pop(); if (!last) return
    let s = { ...appState, history }
    if (last.type==='city')    s.cities = s.cities.slice(0,-1)
    else if (last.type==='country') { const c={...s.countries}; delete c[last.id]; s.countries=c }
    else if (last.type==='trip') {
      s.trips = s.trips.filter(t => t.tripId!==last.tripObj.tripId)
      if (last.createdCountry) { const c={...s.countries}; delete c[last.tripObj.id]; s.countries=c }
    }
    setAppState(s); saveToCloud(s)
  }

  // ── Manual country ─────────────────────────────────────────────
  function manualAddCountry() {
    const found = countryOptions.find(o => norm(o.name)===norm(manualAdd))
    if (!found) { alert('País no encontrado.'); return }
    if (appState.countries[found.id]) { setManualAdd(''); return }
    const s = { ...appState, countries: { ...appState.countries, [found.id]: randomColor() }, history: [...appState.history, { type:'country', id: found.id }] }
    setAppState(s); saveToCloud(s); setManualAdd('')
  }

  function manualDeleteCountry() {
    if (!manualDel || !window.confirm('¿Eliminar este país?')) return
    const countries = { ...appState.countries }; delete countries[manualDel]
    const name = geoMeta.countryNames[manualDel] || manualDel
    const cities = appState.cities.filter(c => !c.country?.includes(name))
    const trips  = appState.trips.filter(t => t.id!==manualDel)
    const s = { ...appState, countries, cities, trips }
    setAppState(s); saveToCloud(s); setManualDel('')
  }

  function factoryReset() {
    if (!window.confirm('¡ATENCIÓN! ¿Borrar TODOS los datos?')) return
    setAppState(EMPTY_STATE); saveToCloud(EMPTY_STATE)
  }

  // ── JSON import ────────────────────────────────────────────────
  function handleJsonImport(e) {
    const file = e.target.files?.[0]; if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result)
        const raw    = parsed.countries !== undefined ? parsed : parsed.data || parsed
        const s = {
          countries: raw.countries || {}, cities: raw.cities || [],
          trips: raw.trips || [], history: raw.history || [], pointSize: raw.pointSize || 5,
        }
        s.trips.forEach((t,i) => { if(!t.tripId) t.tripId=Date.now()+i; if(t.customOrder===undefined) t.customOrder=i })
        setAppState(s); saveToCloud(s)
        setImportStatus('✅ Datos importados correctamente')
      } catch { setImportStatus('❌ Error: JSON inválido') }
      setTimeout(() => setImportStatus(''), 4000)
    }
    reader.readAsText(file)
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(appState,null,2)], { type:'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href=url; a.download='travel_data_backup.json'
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  // ── GeoJSON style ──────────────────────────────────────────────
  const geoJsonStyle = useCallback((feature) => {
    const id = feature.properties.ADM0_A3 || feature.properties.ISO_A3
    const color = appState.countries[id]
    return { fillColor: color || '#fff', weight: 1, opacity: 1, color: '#999', fillOpacity: color ? 0.7 : 0 }
  }, [appState.countries])

  // Re-key forces GeoJSON to re-render when countries change
  const geoKey = useMemo(() => JSON.stringify(Object.keys(appState.countries).sort()), [appState.countries])

  // ── Derived ────────────────────────────────────────────────────
  const visitedCountries = useMemo(
    () => Object.keys(appState.countries).map(id => ({ id, name: geoMeta.countryNames[id]||id })).sort((a,b)=>a.name.localeCompare(b.name)),
    [appState.countries, geoMeta.countryNames]
  )
  const filteredCities = useMemo(
    () => appState.cities.filter(c => c.name.toLowerCase().includes(cityFilter.toLowerCase())),
    [appState.cities, cityFilter]
  )

  // ── Guards ─────────────────────────────────────────────────────
  if (!authLoading && !user) { navigate('/'); return null }

  if (authLoading || geoLoading) {
    return (
      <div className="fixed inset-0 bg-slate-900 flex flex-col items-center justify-center gap-4 text-white">
        <ILoader className="w-10 h-10 text-blue-400 animate-spin" />
        <p className="text-slate-400 text-sm animate-pulse">
          {authLoading ? 'Autenticando...' : 'Cargando mapa del mundo...'}
        </p>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 overflow-hidden font-sans">

      {/* ── MAPA ──────────────────────────────────────────────── */}
      <MapContainer
        center={[40, -3]}
        zoom={2}
        zoomControl={false}
        style={{ height: '100%', width: '100%', zIndex: 1 }}
        preferCanvas
      >
        {/* CartoDB tiles — same as original HTML */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          subdomains="abcd"
          maxZoom={19}
        />
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={19}
          zIndex={1000}
        />

        {/* Country fills */}
        {geoData && (
          <GeoJSON
            key={geoKey}
            data={geoData}
            style={geoJsonStyle}
            onEachFeature={(feature, layer) => {
              const name = feature.properties.NAME || ''
              layer.bindTooltip(name, { sticky: true, direction: 'center', className: 'country-tooltip' })
            }}
          />
        )}

        {/* City markers */}
        {appState.cities.map((city, i) => (
          <CircleMarker
            key={i}
            center={[city.lat, city.lng]}
            radius={appState.pointSize}
            pathOptions={{ color: 'red', fillColor: '#f00', fillOpacity: 1, weight: 1 }}
            eventHandlers={{ click: () => setFlyTarget({ lat: city.lat, lng: city.lng }) }}
          >
            <Tooltip direction="top" offset={[0, -5]}>{city.name}</Tooltip>
          </CircleMarker>
        ))}

        <FlyTo target={flyTarget} />
      </MapContainer>

      {/* ── TOP-RIGHT TOOLS ───────────────────────────────────── */}
      <div className="absolute bottom-4 right-4 sm:top-4 sm:bottom-auto z-[1000] flex gap-1.5 sm:gap-2">
        {[
          { label: 'Deshacer', icon: <IUndo className="w-4 h-4" />, onClick: undoAction },
          {
            label: saveStatus==='saving' ? '...' : saveStatus==='saved' ? '✓ Guardado' : saveStatus==='error' ? '✗ Error' : 'Guardar',
            icon: <ICloud className="w-4 h-4" />,
            onClick: () => saveToCloud(appState),
            extra: saveStatus==='saved' ? 'text-green-600 border-green-400' : saveStatus==='error' ? 'text-red-600 border-red-400' : ''
          },
        ].map(({ label, icon, onClick, extra='' }) => (
          <button key={label} onClick={onClick}
            className={`flex items-center gap-1 sm:gap-1.5 bg-white/95 border border-gray-300 rounded-lg px-2.5 sm:px-3 py-2 text-sm font-semibold text-gray-600 shadow hover:shadow-md hover:-translate-y-0.5 transition-all ${extra}`}>
            {icon} <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* ── PANEL IZQUIERDO ───────────────────────────────────── */}
      <div
        className="absolute top-2 left-2 right-2 sm:top-4 sm:left-4 sm:right-auto z-[1000] bg-white text-gray-900 shadow-[0_4px_20px_rgba(0,0,0,0.25)] rounded-xl flex flex-col transition-all duration-300 overflow-hidden"
        style={{ maxHeight: panelOpen ? '70vh' : 48 }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-3 bg-gray-50 border-b border-gray-100 select-none flex-shrink-0">
          {/* Back to pedrOS */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); navigate('/') }}
            className="flex items-center gap-1 text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0 px-1 py-1 rounded-lg hover:bg-gray-200"
            aria-label="Volver a pedrOS"
            title="Volver a pedrOS"
          >
            <IArrow className="w-4 h-4" />
          </button>
          {/* Title — clickable to toggle panel */}
          <div className="flex items-center justify-between flex-1 cursor-pointer" onClick={() => setPanelOpen(!panelOpen)}>
            <h1 className="text-base font-bold text-gray-800">🌍 Diario de Viajes 🌍</h1>
            <IChevD className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 ${panelOpen ? '' : '-rotate-90'}`} />
          </div>
        </div>

        {/* Scrollable content */}
        {panelOpen && (
          <div className="p-3 overflow-y-auto flex flex-col gap-3">

            {/* Tabs */}
            <div className="flex gap-1.5">
              {[
                { k:'add',   l:'Añadir Viaje',  a:'bg-blue-500 text-white' },
                { k:'stats', l:'Estadísticas',  a:'bg-yellow-400 text-gray-800' },
                { k:'time',  l:'Cronología',    a:'bg-green-500 text-white' },
              ].map(({ k,l,a }) => (
                <button key={k} onClick={() => setActiveTab(k)}
                  className={`flex-1 py-2 rounded-md text-xs font-semibold transition-all ${activeTab===k ? a : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {l}
                </button>
              ))}
            </div>

            {/* Tab: Añadir Viaje */}
            {activeTab==='add' && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">País</label>
                <input className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:border-blue-400"
                  list="country-dl" placeholder="Selecciona país..." value={tripCountry} onChange={e => setTripCountry(e.target.value)} />
                <datalist id="country-dl">{countryOptions.map(o => <option key={o.id} value={o.name} />)}</datalist>
                <div className="flex gap-2">
                  <select className="flex-1 border border-gray-300 rounded-md px-2 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:border-blue-400"
                    value={tripMonth} onChange={e => setTripMonth(Number(e.target.value))}>
                    {MONTHS_FULL.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
                  </select>
                  <input type="number" className="w-20 border border-gray-300 rounded-md px-2 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:border-blue-400"
                    value={tripYear} onChange={e => setTripYear(Number(e.target.value))} />
                </div>
                <button onClick={addFullTrip}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2.5 rounded-lg text-sm uppercase transition-all active:scale-[0.98]">
                  Registrar Viaje
                </button>
              </div>
            )}

            {activeTab==='stats' && (
              <button onClick={() => setModal('stats')}
                className="w-full bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-bold py-3 rounded-lg text-sm uppercase flex items-center justify-center gap-2 transition-all">
                <IStats className="w-4 h-4" /> Ver Estadísticas
              </button>
            )}

            {activeTab==='time' && (
              <button onClick={() => setModal('timeline')}
                className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-lg text-sm uppercase flex items-center justify-center gap-2 transition-all">
                <IClock className="w-4 h-4" /> Abrir Línea de Tiempo
              </button>
            )}

            <hr className="border-gray-100" />

            {/* Gestionar Ubicaciones */}
            <details className="bg-gray-50 rounded-lg border border-gray-100">
              <summary className="px-3 py-2 cursor-pointer font-semibold text-sm text-gray-600 list-none flex justify-between">
                📍 Gestionar Ubicaciones <span className="text-gray-400 text-xs mt-0.5">▼</span>
              </summary>
              <div className="px-3 pb-3 pt-2 space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Añadir Ciudad</label>
                  <div className="relative mt-1 flex gap-2">
                    <div className="relative flex-1">
                      <input className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:border-blue-400"
                        placeholder="Ej: Florence, Munich" value={cityInput} onChange={e => handleCityInput(e.target.value)} />
                      {citySearching && <ILoader className="absolute right-2 top-2.5 w-4 h-4 text-blue-400 animate-spin" />}
                      {cityResults.length > 0 && (
                        <div className="absolute z-50 top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-0.5 max-h-44 overflow-y-auto">
                          {cityResults.map((c,i) => (
                            <button key={i} onClick={() => { setSelectedCity(c); setCityInput(c.label); setCityResults([]) }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0">
                              {c.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={addCity} disabled={!selectedCity}
                      className="bg-blue-500 hover:bg-blue-600 text-white px-3 rounded-md font-bold text-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                      +
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Eliminar Ciudad</label>
                  <input className="w-full mt-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:border-blue-400"
                    placeholder="Filtrar nombre..." value={cityFilter} onChange={e => setCityFilter(e.target.value)} />
                  <ul className="mt-1 max-h-36 overflow-y-auto">
                    {filteredCities.map((c,i) => (
                      <li key={i} className="flex justify-between items-center py-1.5 border-b border-gray-50 text-sm text-gray-700">
                        <span className="cursor-pointer hover:text-blue-500 transition-colors" onClick={() => setFlyTarget({ lat:c.lat, lng:c.lng })}>{c.name}</span>
                        <button onClick={() => deleteCity(appState.cities.indexOf(c))}
                          className="text-xs bg-red-50 text-red-500 border border-red-100 px-1.5 py-0.5 rounded hover:bg-red-100 transition-all">🗑️</button>
                      </li>
                    ))}
                    {!filteredCities.length && <li className="text-xs text-gray-400 text-center py-2">Sin ciudades</li>}
                  </ul>
                </div>
              </div>
            </details>

            {/* Opciones */}
            <details className="bg-gray-50 rounded-lg border border-gray-100">
              <summary className="px-3 py-2 cursor-pointer font-semibold text-sm text-gray-600 list-none flex justify-between">
                ⚙️ Opciones <span className="text-gray-400 text-xs mt-0.5">▼</span>
              </summary>
              <div className="px-3 pb-3 pt-2 space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tamaño Puntos: {appState.pointSize}</label>
                  <input type="range" min="2" max="15" className="w-full mt-1 accent-blue-500"
                    value={appState.pointSize} onChange={e => setAppState(s => ({ ...s, pointSize: Number(e.target.value) }))} />
                </div>
                <hr className="border-gray-200" />
                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">Gestión Manual de Países</label>
                  <div className="flex gap-2 mt-1.5">
                    <input className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:border-blue-400"
                      list="country-dl" placeholder="Añadir País..." value={manualAdd} onChange={e => setManualAdd(e.target.value)} />
                    <button onClick={manualAddCountry} className="bg-green-500 hover:bg-green-600 text-white px-3 rounded-md font-bold transition-all">+</button>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <select className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-900 bg-white focus:outline-none"
                      value={manualDel} onChange={e => setManualDel(e.target.value)}>
                      <option value="">Eliminar País...</option>
                      {visitedCountries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button onClick={manualDeleteCountry}
                      className="bg-red-50 text-red-500 border border-red-200 px-3 rounded-md text-sm font-semibold hover:bg-red-100 transition-all">🗑️</button>
                  </div>
                </div>
                <hr className="border-gray-200" />
                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">Importar datos (JSON)</label>
                  <p className="text-xs text-gray-400 mt-0.5 mb-2">Carga tu backup del Chronopath original para continuar donde lo dejaste.</p>
                  <input ref={jsonRef} type="file" accept=".json" className="hidden" onChange={handleJsonImport} />
                  <button onClick={() => jsonRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 font-semibold text-sm py-2 rounded-lg transition-all">
                    <IUpload className="w-4 h-4" /> Cargar JSON de Chronopath
                  </button>
                  {importStatus && <p className="text-xs mt-1.5 text-center font-semibold text-gray-600">{importStatus}</p>}
                </div>
                <hr className="border-gray-200" />
                <button onClick={exportJSON}
                  className="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold text-sm py-2 rounded-lg transition-all">
                  ⬇ Copia de Seguridad (JSON)
                </button>
                <button onClick={factoryReset}
                  className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-2.5 rounded-lg text-sm transition-all">
                  ⚠ Reiniciar de Fábrica
                </button>
              </div>
            </details>

          </div>
        )}
      </div>

      {/* ── MODALES ───────────────────────────────────────────── */}
      {modal==='stats' && (
        <Modal title="Estadísticas" onClose={() => setModal(null)}>
          <StatsContent appState={appState} geoMeta={geoMeta} />
        </Modal>
      )}
      {modal==='timeline' && (
        <Modal title="Cronología" onClose={() => setModal(null)} dark>
          <TimelineContent appState={appState} iso3to2={geoMeta.iso3to2} onDelete={delTrip} />
        </Modal>
      )}

    </div>
  )
}
