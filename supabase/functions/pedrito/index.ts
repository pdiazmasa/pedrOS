// supabase/functions/pedrito/index.ts
// Pedrito — asistente de IA para pedrOS
// Runtime: Deno (Supabase Edge Functions)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL        = 'llama-3.3-70b-versatile'  // Best Groq model with tool-calling support

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ─── Tool definitions (OpenAI-compatible format) ───────────────
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'add_note',
      description: 'Crea una nueva nota en pedrOS.',
      parameters: {
        type: 'object',
        properties: {
          title:   { type: 'string', description: 'Título de la nota' },
          content: { type: 'string', description: 'Contenido de la nota' },
        },
        required: ['title', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_trello_card',
      description: 'Añade una tarjeta a un tablero Trello de pedrOS. Si no se especifica tablero, usa el primero disponible.',
      parameters: {
        type: 'object',
        properties: {
          board_name: { type: 'string', description: 'Nombre del tablero (parcial o completo). Puede ser vacío.' },
          title:      { type: 'string', description: 'Título de la tarjeta' },
          content:    { type: 'string', description: 'Descripción de la tarjeta' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_calendar_event',
      description: 'Añade un evento al calendario.',
      parameters: {
        type: 'object',
        properties: {
          title:    { type: 'string', description: 'Título del evento' },
          date:     { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
          time:     { type: 'string', description: 'Hora de inicio en formato HH:MM (24h). Si no se especifica, usa 09:00.' },
          duration: { type: 'number', description: 'Duración en minutos. Por defecto 60.' },
        },
        required: ['title', 'date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_todays_agenda',
      description: 'Obtiene el resumen del día: eventos del calendario y tarjetas Trello pendientes para hoy.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Fecha en formato YYYY-MM-DD (hoy)' },
        },
        required: ['date'],
      },
    },
  },
]

// ─── System prompt ─────────────────────────────────────────────
const SYSTEM_PROMPT = `Eres Pedrito, el asistente personal de pedrOS.
Reglas de oro:
- Responde SIEMPRE en español.
- Sé extremadamente conciso. Máximo 1-2 frases.
- Sin saludos, sin formalismos, sin emojis decorativos.
- Cuando ejecutes una acción: confirma con una frase corta (ej. "Nota guardada.", "Evento creado para el martes a las 10:00.").
- Cuando respondas algo informativo: directo al grano.
- Si el usuario pide la agenda: formatea como lista breve.
- Si no entiendes o no puedes hacer algo: di "No puedo hacer eso." sin más.`

// ─── Tool execution ────────────────────────────────────────────
async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<string> {

  switch (toolName) {

    // ── add_note ──────────────────────────────────────────────
    case 'add_note': {
      const { title, content } = args as { title: string; content: string }

      // Get the min position to prepend at top
      const { data: existing } = await supabase
        .from('notes')
        .select('position')
        .eq('user_id', userId)
        .order('position', { ascending: true })
        .limit(1)
        .single()

      const position = existing ? (existing.position as number) - 1 : 0

      const { error } = await supabase.from('notes').insert({
        user_id:    userId,
        title:      title || 'Sin título',
        content:    content || '',
        position,
        is_trashed: false,
      })
      if (error) return `Error al guardar la nota: ${error.message}`
      return `Nota guardada: "${title}".`
    }

    // ── add_trello_card ───────────────────────────────────────
    case 'add_trello_card': {
      const { board_name, title, content } = args as {
        board_name?: string; title: string; content?: string
      }

      // Find board
      let boardQuery = supabase
        .from('trellos_boards')
        .select('id, title')
        .eq('user_id', userId)
        .eq('is_trashed', false)

      if (board_name) {
        boardQuery = boardQuery.ilike('title', `%${board_name}%`)
      }

      const { data: boards } = await boardQuery.order('position').limit(1)
      if (!boards?.length) return 'No encontré ningún tablero. Crea uno primero en Trellos.'

      const board = boards[0]

      // Get first column
      const { data: columns } = await supabase
        .from('trellos_columns')
        .select('id')
        .eq('board_id', board.id)
        .eq('is_trashed', false)
        .order('position')
        .limit(1)

      if (!columns?.length) return `El tablero "${board.title}" no tiene columnas. Añade una primero.`

      const columnId = columns[0].id

      // Get max position in that column
      const { data: lastCard } = await supabase
        .from('trellos_cards')
        .select('position')
        .eq('column_id', columnId)
        .eq('is_trashed', false)
        .order('position', { ascending: false })
        .limit(1)
        .single()

      const position = lastCard ? (lastCard.position as number) + 1 : 0

      const { error } = await supabase.from('trellos_cards').insert({
        user_id:     userId,
        board_id:    board.id,
        column_id:   columnId,
        title,
        description: content || '',
        position,
        is_trashed:  false,
      })

      if (error) return `Error al crear la tarjeta: ${error.message}`
      return `Tarjeta "${title}" añadida a "${board.title}".`
    }

    // ── add_calendar_event ────────────────────────────────────
    case 'add_calendar_event': {
      const { title, date, time = '09:00', duration = 60 } = args as {
        title: string; date: string; time?: string; duration?: number
      }

      // Get first calendar
      const { data: calendars } = await supabase
        .from('calendars')
        .select('id, name')
        .eq('user_id', userId)
        .order('created_at')
        .limit(1)

      if (!calendars?.length) {
        return 'No tienes ningún calendario. Crea uno primero en Calendarios.'
      }

      const calendarId = calendars[0].id

      // Build timestamps
      const startISO = new Date(`${date}T${time}:00`).toISOString()
      const endDate  = new Date(`${date}T${time}:00`)
      endDate.setMinutes(endDate.getMinutes() + duration)
      const endISO   = endDate.toISOString()

      const { error } = await supabase.from('events').insert({
        user_id:     userId,
        calendar_id: calendarId,
        title,
        description: '',
        start_time:  startISO,
        end_time:    endISO,
        is_all_day:  false,
        is_trashed:  false,
      })

      if (error) return `Error al crear el evento: ${error.message}`

      // Human-friendly confirmation
      const dayNames = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado']
      const d = new Date(`${date}T${time}:00`)
      const dayName = dayNames[d.getDay()]
      return `Evento "${title}" creado para el ${dayName} ${date} a las ${time}.`
    }

    // ── get_todays_agenda ─────────────────────────────────────
    case 'get_todays_agenda': {
      const { date } = args as { date: string }

      const dayStart = `${date}T00:00:00.000Z`
      const dayEnd   = `${date}T23:59:59.999Z`

      // Events today
      const { data: events } = await supabase
        .from('events')
        .select('title, start_time')
        .eq('user_id', userId)
        .eq('is_trashed', false)
        .gte('start_time', dayStart)
        .lte('start_time', dayEnd)
        .order('start_time')

      // Pending trello cards (no date filter — just the "today" concept is pending tasks)
      const { data: cards } = await supabase
        .from('trellos_cards')
        .select('title, trellos_boards(title)')
        .eq('user_id', userId)
        .eq('is_completed', false)
        .eq('is_trashed', false)
        .limit(10)

      const lines: string[] = []

      if (events?.length) {
        lines.push('Eventos:')
        events.forEach(e => {
          const t = new Date(e.start_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
          lines.push(`  ${t} — ${e.title}`)
        })
      } else {
        lines.push('Sin eventos hoy.')
      }

      if (cards?.length) {
        lines.push('Pendientes:')
        cards.forEach(c => {
          const boardTitle = (c.trellos_boards as { title?: string })?.title ?? '?'
          lines.push(`  [${boardTitle}] ${c.title}`)
        })
      }

      return lines.join('\n') || 'Sin eventos ni pendientes para hoy.'
    }

    default:
      return 'Herramienta desconocida.'
  }
}

// ─── Main handler ──────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // ── 1. Authenticate user ──────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    // Service role client for DB operations (bypasses RLS using user_id filter manually)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Token inválido.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 2. Parse request ──────────────────────────────────────
    const { prompt, context } = await req.json() as {
      prompt: string
      context?: string  // optional: current page name for context
    }

    if (!prompt?.trim()) {
      return new Response(JSON.stringify({ error: 'Prompt vacío.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')
    if (!GROQ_API_KEY) {
      return new Response(JSON.stringify({ error: 'GROQ_API_KEY no configurada.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 3. Build messages ─────────────────────────────────────
    const todayStr = new Date().toISOString().slice(0, 10)
    const timeStr  = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

    const systemMessage = {
      role:    'system',
      content: `${SYSTEM_PROMPT}\n\nFecha actual: ${todayStr}. Hora actual: ${timeStr}.${
        context ? `\nEl usuario está en: ${context}.` : ''
      }`,
    }

    const userMessage = { role: 'user', content: prompt }
    const messages: unknown[] = [systemMessage, userMessage]

    // ── 4. First Groq call ────────────────────────────────────
    const groqRes = await fetch(GROQ_API_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model:       MODEL,
        messages,
        tools:       TOOLS,
        tool_choice: 'auto',
        temperature: 0.2,
        max_tokens:  512,
      }),
    })

    if (!groqRes.ok) {
      const err = await groqRes.text()
      console.error('Groq error:', err)
      return new Response(JSON.stringify({ error: 'Error en la IA. Inténtalo de nuevo.' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const groqData = await groqRes.json()
    const choice   = groqData.choices?.[0]
    const message  = choice?.message

    // ── 5. If no tool call → return text directly ─────────────
    if (!message?.tool_calls?.length) {
      return new Response(
        JSON.stringify({ reply: message?.content ?? 'Sin respuesta.', action: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── 6. Execute tool calls ─────────────────────────────────
    messages.push(message)  // assistant message with tool_calls

    const toolResults: { name: string; result: string }[] = []

    for (const toolCall of message.tool_calls) {
      const toolName = toolCall.function.name
      let toolArgs: Record<string, unknown> = {}

      try {
        toolArgs = JSON.parse(toolCall.function.arguments)
      } catch {
        toolArgs = {}
      }

      const result = await executeTool(toolName, toolArgs, supabaseAdmin, user.id)
      toolResults.push({ name: toolName, result })

      // Add tool result to messages for follow-up
      messages.push({
        role:         'tool',
        tool_call_id: toolCall.id,
        content:      result,
      })
    }

    // ── 7. Second Groq call to get final reply ─────────────────
    const groqRes2 = await fetch(GROQ_API_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model:       MODEL,
        messages,
        temperature: 0.2,
        max_tokens:  256,
      }),
    })

    let finalReply = toolResults.map(t => t.result).join('\n')

    if (groqRes2.ok) {
      const groqData2 = await groqRes2.json()
      finalReply = groqData2.choices?.[0]?.message?.content ?? finalReply
    }

    // ── 8. Determine which module to refresh ──────────────────
    const actionMap: Record<string, string> = {
      add_note:             'notes',
      add_trello_card:      'trellos',
      add_calendar_event:   'calendars',
      get_todays_agenda:    null as unknown as string,
    }
    const executedTools  = toolResults.map(t => t.name)
    const refreshModules = [...new Set(
      executedTools.map(t => actionMap[t]).filter(Boolean)
    )]

    return new Response(
      JSON.stringify({
        reply:   finalReply,
        action:  executedTools[0] ?? null,
        refresh: refreshModules,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )

  } catch (err) {
    console.error('Pedrito error:', err)
    return new Response(
      JSON.stringify({ error: 'Error interno.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
