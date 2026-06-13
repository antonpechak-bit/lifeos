// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ── Period helpers ─────────────────────────────────────────────

function monthPeriod(date: Date) {
  const y = date.getFullYear(), m = date.getMonth()
  const start = new Date(y, m, 1)
  const end   = new Date(y, m + 1, 0)
  const label = start.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd:   end.toISOString().slice(0, 10),
    label,
  }
}

function quarterPeriod(date: Date) {
  const y = date.getFullYear()
  const q = Math.floor(date.getMonth() / 3)
  const start = new Date(y, q * 3, 1)
  const end   = new Date(y, q * 3 + 3, 0)
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd:   end.toISOString().slice(0, 10),
    label:       `Q${q + 1} ${y}`,
  }
}

function yearPeriod(date: Date) {
  const y = date.getFullYear()
  return {
    periodStart: `${y}-01-01`,
    periodEnd:   `${y}-12-31`,
    label:       String(y),
  }
}

// ── System prompts per level ──────────────────────────────────

// Shared epistemic rule injected into every prompt
const EPISTEMIC_RULE = `
ПРАВИЛО УВЕРЕННОСТИ (обязательно):
Уверенность в наблюдении пропорциональна числу подтверждений:
— 1 период данных или новый паттерн без предыдущих аналогов → confidence = "hypothesis". Формулировки: "Похоже, что...", "Заметен паттерн, который стоит понаблюдать...", "Это может быть совпадением одной недели/месяца, но...". Заканчивай 1-2 феноменологическими вопросами в духе гештальта (не советы — приглашение посмотреть).
— Паттерн встречается в 2-3 периодах подряд → confidence = "pattern". Можно говорить увереннее: "Уже второй месяц подряд...", "Устойчивая связь между...". Всё равно без директивных советов — только описание закономерности + вопрос к человеку, что он сам об этом думает.
— Паттерн подтверждён 3+ периодами → confidence = "established". Утверждения допустимы, но по-прежнему без "надо делать X".
Если в тексте встречаются несколько паттернов с разной уверенностью — бери наиболее частый/центральный для итогового confidence.`

const MONTH_SYSTEM = `Ты синтезируешь память о прошедшем месяце на основе еженедельных итогов. Твой язык — русский. Стиль: феноменологический, без предписаний.
${EPISTEMIC_RULE}

Найди 2-3 тематические нити, которые шли сквозь несколько недель:
— Что нарастало? Что угасало? Что было стабильным?
— Где был сдвиг — и что ему предшествовало?
— Что говорят спринт-данные о последовательности?

Если предоставлены предыдущие месячные итоги — сверь: встречались ли схожие паттерны раньше? Отметь это и скорректируй confidence.

ФОРМАТ (строго JSON, без markdown):
{
  "summary_text": "2-4 предложения — живая картина месяца, без клише. Тон определяется confidence",
  "key_themes": ["тема 1", "тема 2", "тема 3"],
  "central_obs": "одно предложение — ключевое наблюдение (с маркером уверенности в тоне)",
  "open_questions": ["вопрос 1", "вопрос 2"],
  "confidence": "hypothesis|pattern|established"
}`

const QUARTER_SYSTEM = `Ты синтезируешь память о квартале на основе месячных итогов. Твой язык — русский. Смотри с высоты — ищи арки и траектории.
${EPISTEMIC_RULE}

— Какова была дуга квартала? Что трансформировалось?
— Какие темы красной нитью шли через все месяцы?
— Что завершилось? Что открылось?

Если предоставлены предыдущие квартальные итоги — сверь повторяющиеся темы и обнови confidence.

ФОРМАТ (строго JSON, без markdown):
{
  "summary_text": "2-4 предложения — дуга квартала, с динамикой",
  "key_themes": ["тема 1", "тема 2"],
  "central_obs": "одно предложение — суть квартала",
  "open_questions": ["вопрос 1"],
  "confidence": "hypothesis|pattern|established"
}`

const YEAR_SYSTEM = `Ты синтезируешь память о годе на основе квартальных итогов. Твой язык — русский. Смотри с предельной высоты — ищи трансформацию.
${EPISTEMIC_RULE}

— Кем был этот человек в начале года? Кем стал?
— Что трансформировалось необратимо?
— Одна метафора или образ для года.

Если есть предыдущий годовой итог — обозначь, что изменилось в паттернах между годами.

ФОРМАТ (строго JSON, без markdown):
{
  "summary_text": "3-5 предложений — история года, с образом трансформации",
  "key_themes": ["тема 1", "тема 2", "тема 3"],
  "central_obs": "одна метафора или образ для года",
  "open_questions": ["вопрос 1"],
  "confidence": "hypothesis|pattern|established"
}`

// ── Generators ─────────────────────────────────────────────────

function formatPrevSummary(ps: any): string {
  return `### ${ps.label || ps.period_start}
${ps.summary_text}
Темы: ${(ps.key_themes || []).join(', ')}
Суть: ${ps.central_obs || '—'}
Уверенность: ${ps.metrics?.confidence || '—'}`
}

async function generateMonth(userId: string, periodStart: string, periodEnd: string) {
  const [weekliesRes, checkinsRes, insightsRes, prevMonthsRes] = await Promise.all([
    supabaseAdmin
      .from('weekly_summaries')
      .select('week_start, week_end, summary_text, top_correlation, biggest_barrier, avg_energy, avg_mood, avg_meaning, avg_connection, sprint_completion_rate')
      .eq('user_id', userId)
      .gte('week_start', periodStart)
      .lte('week_end', periodEnd)
      .order('week_start'),
    supabaseAdmin
      .from('checkins')
      .select('date, completed, energy, mood, meaning, connection')
      .eq('user_id', userId)
      .gte('date', periodStart)
      .lte('date', periodEnd),
    supabaseAdmin
      .from('client_insights')
      .select('layer, category, content, created_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gte('created_at', `${periodStart}T00:00:00`)
      .lte('created_at', `${periodEnd}T23:59:59`)
      .order('created_at', { ascending: false })
      .limit(10),
    // 2 previous month summaries for pattern comparison
    supabaseAdmin
      .from('period_summaries')
      .select('period_start, label, summary_text, key_themes, central_obs, metrics')
      .eq('user_id', userId)
      .eq('period_type', 'month')
      .lt('period_start', periodStart)
      .order('period_start', { ascending: false })
      .limit(2),
  ])

  const weeklies   = weekliesRes.data || []
  const checkins   = checkinsRes.data || []
  const insights   = insightsRes.data || []
  const prevMonths = (prevMonthsRes.data || []).reverse() // chronological

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
  const doneCount  = checkins.filter(c => c.completed).length
  const totalCount = checkins.length

  const metrics = {
    weeks_with_data: weeklies.length,
    sprint_completion: totalCount > 0 ? Math.round(doneCount / totalCount * 100) : null,
    avg_energy:     avg(checkins.filter(c => c.energy).map(c => c.energy)),
    avg_mood:       avg(checkins.filter(c => c.mood).map(c => c.mood)),
    avg_meaning:    avg(checkins.filter(c => c.meaning).map(c => c.meaning)),
    avg_connection: avg(checkins.filter(c => c.connection).map(c => c.connection)),
  }

  const prevSection = prevMonths.length > 0
    ? `\nПРЕДЫДУЩИЕ МЕСЯЧНЫЕ ИТОГИ (для сравнения паттернов):\n${prevMonths.map(formatPrevSummary).join('\n\n')}`
    : '\nПРЕДЫДУЩИЕ МЕСЯЧНЫЕ ИТОГИ: нет (первое наблюдение — все паттерны считать гипотезами).'

  const content = `Период: ${periodStart} — ${periodEnd}
Спринт-завершения: ${doneCount}/${totalCount} (${metrics.sprint_completion ?? '—'}%)
Средние: энергия ${metrics.avg_energy?.toFixed(1) ?? '—'}, настроение ${metrics.avg_mood?.toFixed(1) ?? '—'}, смысл ${metrics.avg_meaning?.toFixed(1) ?? '—'}, связь ${metrics.avg_connection?.toFixed(1) ?? '—'}

ЕЖЕНЕДЕЛЬНЫЕ ИТОГИ (${weeklies.length} нед.):
${weeklies.map(w => `[${w.week_start}] ${w.summary_text || ''} | Корреляция: ${w.top_correlation || '—'} | Барьер: ${w.biggest_barrier || '—'}`).join('\n') || 'Нет еженедельных итогов.'}

НАБЛЮДЕНИЯ ЗА МЕСЯЦ:
${insights.map(i => `- [слой ${i.layer}] ${i.content}`).join('\n') || 'Нет сохранённых наблюдений.'}
${prevSection}`

  return { content, metrics }
}

async function generateQuarter(userId: string, periodStart: string, periodEnd: string) {
  const [monthsRes, prevQuartersRes] = await Promise.all([
    supabaseAdmin
      .from('period_summaries')
      .select('period_start, period_end, label, summary_text, key_themes, central_obs, metrics')
      .eq('user_id', userId)
      .eq('period_type', 'month')
      .gte('period_start', periodStart)
      .lte('period_end', periodEnd)
      .order('period_start'),
    // 2 previous quarters for comparison
    supabaseAdmin
      .from('period_summaries')
      .select('period_start, label, summary_text, key_themes, central_obs, metrics')
      .eq('user_id', userId)
      .eq('period_type', 'quarter')
      .lt('period_start', periodStart)
      .order('period_start', { ascending: false })
      .limit(2),
  ])

  const months      = monthsRes.data || []
  const prevQuarters = (prevQuartersRes.data || []).reverse()

  const prevSection = prevQuarters.length > 0
    ? `\nПРЕДЫДУЩИЕ КВАРТАЛЬНЫЕ ИТОГИ (для сравнения):\n${prevQuarters.map(formatPrevSummary).join('\n\n')}`
    : '\nПРЕДЫДУЩИЕ КВАРТАЛЬНЫЕ ИТОГИ: нет.'

  const content = `Период: ${periodStart} — ${periodEnd}

МЕСЯЧНЫЕ ИТОГИ:
${months.map(formatPrevSummary).join('\n\n') || 'Нет месячных итогов.'}
${prevSection}`

  return { content, metrics: { months_available: months.length } }
}

async function generateYear(userId: string, periodStart: string, periodEnd: string) {
  const [quartersRes, prevYearRes] = await Promise.all([
    supabaseAdmin
      .from('period_summaries')
      .select('period_start, period_end, label, summary_text, key_themes, central_obs, metrics')
      .eq('user_id', userId)
      .eq('period_type', 'quarter')
      .gte('period_start', periodStart)
      .lte('period_end', periodEnd)
      .order('period_start'),
    // Previous year for comparison
    supabaseAdmin
      .from('period_summaries')
      .select('period_start, label, summary_text, key_themes, central_obs, metrics')
      .eq('user_id', userId)
      .eq('period_type', 'year')
      .lt('period_start', periodStart)
      .order('period_start', { ascending: false })
      .limit(1),
  ])

  const quarters = quartersRes.data || []
  const prevYear = prevYearRes.data?.[0]

  const prevSection = prevYear
    ? `\nПРЕДЫДУЩИЙ ГОДОВОЙ ИТОГ (для сравнения):\n${formatPrevSummary(prevYear)}`
    : '\nПРЕДЫДУЩИЙ ГОДОВОЙ ИТОГ: нет.'

  const content = `Год: ${periodStart.slice(0, 4)}

КВАРТАЛЬНЫЕ ИТОГИ:
${quarters.map(formatPrevSummary).join('\n\n') || 'Нет квартальных итогов.'}
${prevSection}`

  return { content, metrics: { quarters_available: quarters.length } }
}

// ── Route ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { userId, periodType, date: dateStr } = await req.json()

    if (!userId || !periodType) {
      return NextResponse.json({ error: 'userId and periodType required' }, { status: 400 })
    }
    if (!['month', 'quarter', 'year'].includes(periodType)) {
      return NextResponse.json({ error: 'periodType must be month|quarter|year' }, { status: 400 })
    }

    // Auth
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authUser || authUser.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const refDate = dateStr ? new Date(dateStr) : new Date()
    const period =
      periodType === 'month'   ? monthPeriod(refDate) :
      periodType === 'quarter' ? quarterPeriod(refDate) :
                                 yearPeriod(refDate)

    const { periodStart, periodEnd, label } = period

    // Build source content
    const { content, metrics } =
      periodType === 'month'   ? await generateMonth(userId, periodStart, periodEnd) :
      periodType === 'quarter' ? await generateQuarter(userId, periodStart, periodEnd) :
                                 await generateYear(userId, periodStart, periodEnd)

    const systemPrompt =
      periodType === 'month'   ? MONTH_SYSTEM :
      periodType === 'quarter' ? QUARTER_SYSTEM :
                                 YEAR_SYSTEM

    // Call Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 700,
      system: systemPrompt,
      messages: [{ role: 'user', content }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : '{}'
    let parsed: {
      summary_text: string
      key_themes: string[]
      central_obs: string
      open_questions?: string[]
      confidence?: 'hypothesis' | 'pattern' | 'established'
    }
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
    } catch {
      parsed = { summary_text: raw.trim(), key_themes: [], central_obs: '', confidence: 'hypothesis' }
    }

    // Merge confidence into metrics so it's stored without schema change
    const fullMetrics = {
      ...metrics,
      confidence: parsed.confidence || 'hypothesis',
      open_questions: parsed.open_questions || [],
    }

    // Upsert into period_summaries
    const { data: saved } = await supabaseAdmin
      .from('period_summaries')
      .upsert(
        {
          user_id:      userId,
          period_type:  periodType,
          period_start: periodStart,
          period_end:   periodEnd,
          label,
          summary_text: parsed.summary_text,
          key_themes:   parsed.key_themes || [],
          central_obs:  parsed.central_obs || null,
          metrics:      fullMetrics,
          updated_at:   new Date().toISOString(),
        },
        { onConflict: 'user_id,period_type,period_start' }
      )
      .select()
      .single()

    return NextResponse.json({
      period: { periodType, periodStart, periodEnd, label },
      summary: parsed,
      metrics: fullMetrics,
      id: saved?.id,
    })
  } catch (error) {
    console.error('Period summary error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET — fetch existing summaries for a user
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  const periodType = searchParams.get('periodType')

  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !authUser || authUser.id !== userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let query = supabaseAdmin
    .from('period_summaries')
    .select('*')
    .eq('user_id', userId)
    .order('period_start', { ascending: false })
    .limit(12)

  if (periodType) query = query.eq('period_type', periodType)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ summaries: data || [] })
}
