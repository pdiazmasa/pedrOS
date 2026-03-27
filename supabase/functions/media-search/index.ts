// supabase/functions/media-search/index.ts
// Deploy: supabase functions deploy media-search --no-verify-jwt
// O desactiva "Enforce JWT Verification" en el Dashboard de la función.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

function normalizeType(type: string | undefined): 'movie' | 'tv' {
  return type === 'series' ? 'tv' : 'movie'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ── Variables de entorno ──────────────────────────────────────
  const supabaseUrl     = Deno.env.get('SUPABASE_URL')     ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

  // TMDB_READ_TOKEN  → Bearer token largo (eyJ…) — RECOMENDADO
  //   Lo obtienes en themoviedb.org → Settings → API → "API Read Access Token (v4 auth)"
  //   Es el mismo que usas en tu curl con --header 'Authorization: Bearer eyJ…'
  // TMDB_API_KEY     → API key v3 (32 chars hex) — fallback
  const tmdbToken = Deno.env.get('TMDB_READ_TOKEN') ?? Deno.env.get('TMDB_API_KEY') ?? ''

  console.log('[media-search] env check:', {
    hasSupabaseUrl:     !!supabaseUrl,
    hasSupabaseAnonKey: !!supabaseAnonKey,
    hasTmdbToken:       !!tmdbToken,
    tmdbTokenLength:    tmdbToken.length,
    tmdbTokenPrefix:    tmdbToken.slice(0, 8) || '(empty)',
  })

  if (!tmdbToken) {
    return jsonResponse({
      error: 'Falta TMDB_READ_TOKEN en las variables de entorno de la Edge Function.',
      hint:  'Ve a Supabase Dashboard → Functions → media-search → Environment variables y añade TMDB_READ_TOKEN con tu Bearer token de TMDb.',
    }, 500)
  }

  // ── Parsear body ──────────────────────────────────────────────
  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Body inválido o vacío.' }, 400)
  }

  const query     = String(body?.query     ?? '').trim()
  const mediaType = String(body?.mediaType ?? 'movie').trim()

  if (!query) {
    return jsonResponse({ error: 'El campo query es obligatorio.' }, 400)
  }

  const endpoint = normalizeType(mediaType)

  // ── Construir request a TMDb ──────────────────────────────────
  // Detectar si es Bearer token (empieza por eyJ) o API key v3 (hex corto)
  const isBearerToken = tmdbToken.startsWith('eyJ')

  const tmdbUrl = new URL(`https://api.themoviedb.org/3/search/${endpoint}`)
  tmdbUrl.searchParams.set('language',        'es-ES')
  tmdbUrl.searchParams.set('query',           query)
  tmdbUrl.searchParams.set('include_adult',   'false')
  tmdbUrl.searchParams.set('page',            '1')

  const tmdbHeaders: Record<string, string> = { accept: 'application/json' }

  if (isBearerToken) {
    // Modo recomendado: Bearer token (v4 auth, funciona en endpoints v3)
    tmdbHeaders['Authorization'] = `Bearer ${tmdbToken}`
    console.log('[media-search] TMDb auth: Bearer token')
  } else {
    // Fallback: API key v3 como query param
    tmdbUrl.searchParams.set('api_key', tmdbToken)
    console.log('[media-search] TMDb auth: api_key param (v3)')
  }

  console.log('[media-search] TMDb request:', {
    endpoint,
    query,
    url: tmdbUrl.toString().replace(tmdbToken, '***'),
  })

  // ── Llamar a TMDb ─────────────────────────────────────────────
  let tmdbResponse: Response
  try {
    tmdbResponse = await fetch(tmdbUrl.toString(), {
      method:  'GET',
      headers: tmdbHeaders,
    })
  } catch (fetchErr) {
    console.error('[media-search] fetch to TMDb failed:', fetchErr)
    return jsonResponse({ error: 'No se pudo conectar con TMDb.', details: String(fetchErr) }, 502)
  }

  const rawText = await tmdbResponse.text()

  console.log('[media-search] TMDb response:', {
    status:      tmdbResponse.status,
    statusText:  tmdbResponse.statusText,
    bodyPreview: rawText.slice(0, 400),
  })

  if (!tmdbResponse.ok) {
    return jsonResponse({
      error:   `TMDb devolvió ${tmdbResponse.status}: ${tmdbResponse.statusText}`,
      details: rawText.slice(0, 300),
      hint:    tmdbResponse.status === 401
        ? 'El token de TMDb es inválido o ha expirado. Comprueba TMDB_READ_TOKEN en las variables de entorno.'
        : undefined,
    }, 502)
  }

  let data: { results?: Record<string, unknown>[]; total_results?: number }
  try {
    data = JSON.parse(rawText)
  } catch {
    return jsonResponse({ error: 'Respuesta de TMDb no es JSON válido.', raw: rawText.slice(0, 200) }, 502)
  }

  const first = data?.results?.[0]

  if (!first) {
    return jsonResponse({
      found:         false,
      query,
      mediaType,
      total_results: data?.total_results ?? 0,
    })
  }

  const release = (first.release_date as string) || (first.first_air_date as string) || null

  return jsonResponse({
    found:          true,
    query,
    mediaType,
    external_source: 'tmdb',
    tmdb_id:        first.id,
    title:          first.title || first.name || query,
    original_title: first.original_title || first.original_name || null,
    overview:       first.overview || null,
    poster_url:     first.poster_path
      ? `https://image.tmdb.org/t/p/w500${first.poster_path}`
      : null,
    release_year:   release ? Number(String(release).slice(0, 4)) : null,
    raw_type:       endpoint,
  })
})
