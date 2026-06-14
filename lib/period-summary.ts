// @ts-nocheck
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ── Period date helpers ────────────────────────────────────────

export function monthPeriod(date: Date) {
  const y = date.getFullYear(), m = date.getMonth()
  const start = new Date(y, m, 1)
  const end   = new Date(y, m + 1, 0)
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd:   end.toISOString().slice(0, 10),
    label: start.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
  }
}

export function quarterPeriod(date: Date) {
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

export function yearPeriod(date: Date) {
  const y = date.getFullYear()
  return {
    periodStart: `${y}-01-01`,
    periodEnd:   `${y}-12-31`,
    label:       String(y),
  }
}

// Cron helpers — compute the period that just ended at cron run time (UTC)

export function prevMonthPeriod() {
  const now = new Date()
  const y = now.getUTCFullYear(), m = now.getUTCMonth()
  const pm = m === 0 ? 11 : m - 1
  const py = m === 0 ? y - 1 : y
  const start = new Date(Date.UTC(py, pm, 1))
  const end   = new Date(Date.UTC(py, pm + 1, 0))
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd:   end.toISOString().slice(0, 10),
    label: start.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  }
}

export function prevQuarterPeriod() {
  const now = new Date()
  const y = now.getUTCFullYear(), m = now.getUTCMonth()
  const q = Math.floor(m / 3)
  const pq = q === 0 ? 3 : q - 1
  const py = q === 0 ? y - 1 : y
  const start = new Date(Date.UTC(py, pq * 3, 1))
  const end   = new Date(Date.UTC(py, pq * 3 + 3, 0))
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd:   end.toISOString().slice(0, 10),
    label: `Q${pq + 1} ${py}`,
  }
}

export function prevYearPeriod() {
  const y = new Date().getUTCFullYear() - 1
  return { periodStart: `${y}-01-01`, periodEnd: `${y}-12-31`, label: String(y) }
}

// Sun–Sat week that ended yesterday (called at 4am UTC on Sunday)
export function cronWeekPeriod() {
  const yesterday = new Date()
  yesterday.setUTCDate(yesterday.getUTCDate() - 1) // Saturday
  const weekEnd = yesterday.toISOString().slice(0, 10)
  const weekStartDate = new Date(yesterday)
  weekStartDate.setUTCDate(yesterday.getUTCDate() - 6) // Sunday before
  return { weekStart: weekStartDate.toISOString().slice(0, 10), weekEnd }
}

// ── Prompts ────────────────────────────────────────────────────

export const EPISTEMIC_RULE = `
ПРАВИЛО УВЕРЕННОСТИ (обязательно):
Уверенность в наблюдении пропорциональна числу подтверждений:
— 1 период данных или новый паттерн без предыдущих аналогов → confidence = "hypothesis". Формулировки: "Похоже, что...", "Заметен паттерн, который стоит понаблюдать...", "Это может быть совпадением одной недели/месяца, но...". Заканчивай 1-2 феноменологическими вопросами в духе гештальта (не советы — приглашение посмотреть).
— Паттерн встречается в 2-3 периодах подряд → confidence = "pattern". Можно говорить увереннее: "Уже второй месяц подряд...", "Устойчивая связь между...". Всё равно без директивных советов — только описание закономерности + вопрос к человеку, что он сам об этом думает.
— Паттерн подтверждён 3+ периодами → confidence = "established". Утверждения допустимы, но по-прежнему без "надо делать X".
Если в тексте встречаются несколько паттернов с разной уверенностью — бери наиболее частый/центральный для итогового confidence.`

export const WEEK_SYSTEM = `Ты аналитик данных благополучия. Анализируй данные недели и находи конкретные, полезные паттерны.

Твоя задача: найти 2-3 реальные корреляции и сформулировать actionable инсайты.

ПРАВИЛА:
— Конкретные цифры, не абстракции
— Если корреляция слабая или данных мало — честно скажи
— Тон: дружелюбный, прямой, без пафоса
— Не повторяй данные которые уже видны в графиках

ФОРМАТ ОТВЕТА (строго JSON):
{
  "top_correlation": "краткое главное наблюдение (1 предложение)",
  "biggest_barrier": "главное что мешало на этой неделе (1 предложение)",
  "next_focus": "один конкретный следующий шаг (1 предложение)",
  "insights": [
    {"title": "...", "body": "...", "type": "positive|neutral|warning"},
    {"title": "...", "body": "...", "type": "positive|neutral|warning"},
    {"title": "...", "body": "...", "type": "positive|neutral|warning"}
  ],
  "summary_text": "2-3 предложения общей картины недели"
}`

export const MONTH_SYSTEM = `Ты синтезируешь память о прошедшем месяце на основе еженедельных итогов. Твой язык — русский. Стиль: феноменологический, без предписаний.
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

export const QUARTER_SYSTEM = `Ты синтезируешь память о квартале на основе месячных итогов. Твой язык — русский. Смотри с высоты — ищи арки и траектории.
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

export const YEAR_SYSTEM = `Ты синтезируешь память о годе на основе квартальных итогов. Твой язык — русский. Смотри с предельной высоты — ищи трансформацию.
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

// ── Helpers ────────────────────────────────────────────────────

export function formatPrevSummary(ps: any): string {
  return `### ${ps.label || ps.period_start}
${ps.summary_text}
Темы: ${(ps.key_themes || []).join(', ')}
Суть: ${ps.central_obs || '—'}
Уверенность: ${ps.metrics?.confidence || '—'}`
}

// ── Idempotency checks ─────────────────────────────────────────

export async function periodSummaryExists(
  userId: string,
  periodType: string,
  periodStart: string,
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('period_summaries')
    .select('id')
    .eq('user_id', userId)
    .eq('period_type', periodType)
    .eq('period_start', periodStart)
    .maybeSingle()
  return !!data
}

export async function weekSummaryExists(userId: string, weekStart: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('weekly_summaries')
    .select('user_id')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle()
  return !!data
}

// ── Data fetchers ──────────────────────────────────────────────

async function fetchMonthContent(userId: string, periodStart: string, periodEnd: string) {
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
  const prevMonths = (prevMonthsRes.data || []).reverse()

  const avgFn = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
  const doneCount  = checkins.filter(c => c.completed).length
  const totalCount = checkins.length

  const metrics = {
    weeks_with_data:  weeklies.length,
    sprint_completion: totalCount > 0 ? Math.round(doneCount / totalCount * 100) : null,
    avg_energy:     avgFn(checkins.filter(c => c.energy).map(c => c.energy)),
    avg_mood:       avgFn(checkins.filter(c => c.mood).map(c => c.mood)),
    avg_meaning:    avgFn(checkins.filter(c => c.meaning).map(c => c.meaning)),
    avg_connection: avgFn(checkins.filter(c => c.connection).map(c => c.connection)),
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

async function fetchQuarterContent(userId: string, periodStart: string, periodEnd: string) {
  const [monthsRes, prevQuartersRes] = await Promise.all([
    supabaseAdmin
      .from('period_summaries')
      .select('period_start, period_end, label, summary_text, key_themes, central_obs, metrics')
      .eq('user_id', userId)
      .eq('period_type', 'month')
      .gte('period_start', periodStart)
      .lte('period_end', periodEnd)
      .order('period_start'),
    supabaseAdmin
      .from('period_summaries')
      .select('period_start, label, summary_text, key_themes, central_obs, metrics')
      .eq('user_id', userId)
      .eq('period_type', 'quarter')
      .lt('period_start', periodStart)
      .order('period_start', { ascending: false })
      .limit(2),
  ])

  const months       = monthsRes.data || []
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

async function fetchYearContent(userId: string, periodStart: string, periodEnd: string) {
  const [quartersRes, prevYearRes] = await Promise.all([
    supabaseAdmin
      .from('period_summaries')
      .select('period_start, period_end, label, summary_text, key_themes, central_obs, metrics')
      .eq('user_id', userId)
      .eq('period_type', 'quarter')
      .gte('period_start', periodStart)
      .lte('period_end', periodEnd)
      .order('period_start'),
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

// ── Claude call + period_summaries upsert ──────────────────────

async function callClaudeAndSavePeriod(
  userId: string,
  periodType: 'month' | 'quarter' | 'year',
  periodStart: string,
  periodEnd: string,
  label: string,
  content: string,
  metrics: Record<string, any>,
  systemPrompt: string,
) {
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

  const fullMetrics = {
    ...metrics,
    confidence: parsed.confidence || 'hypothesis',
    open_questions: parsed.open_questions || [],
  }

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

  return {
    generated: true,
    id: saved?.id,
    period: { periodType, periodStart, periodEnd, label },
    summary: parsed,
    metrics: fullMetrics,
  }
}

// ── Public generators ──────────────────────────────────────────

export async function generateMonthSummary(
  userId: string,
  periodStart: string,
  periodEnd: string,
  label: string,
) {
  const { content, metrics } = await fetchMonthContent(userId, periodStart, periodEnd)
  return callClaudeAndSavePeriod(userId, 'month', periodStart, periodEnd, label, content, metrics, MONTH_SYSTEM)
}

export async function generateQuarterSummary(
  userId: string,
  periodStart: string,
  periodEnd: string,
  label: string,
) {
  const { content, metrics } = await fetchQuarterContent(userId, periodStart, periodEnd)
  return callClaudeAndSavePeriod(userId, 'quarter', periodStart, periodEnd, label, content, metrics, QUARTER_SYSTEM)
}

export async function generateYearSummary(
  userId: string,
  periodStart: string,
  periodEnd: string,
  label: string,
) {
  const { content, metrics } = await fetchYearContent(userId, periodStart, periodEnd)
  return callClaudeAndSavePeriod(userId, 'year', periodStart, periodEnd, label, content, metrics, YEAR_SYSTEM)
}

export async function generateWeekSummary(userId: string, weekStart: string, weekEnd: string) {
  const [logsRes, checkinsRes, stateRes] = await Promise.all([
    supabaseAdmin
      .from('daily_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('date', weekStart)
      .lte('date', weekEnd)
      .order('date'),
    supabaseAdmin
      .from('checkins')
      .select('*, sprints(behavior_name, layer)')
      .eq('user_id', userId)
      .gte('date', weekStart)
      .lte('date', weekEnd),
    supabaseAdmin
      .from('sessions')
      .select('state_map')
      .eq('user_id', userId)
      .eq('completed', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
  ])

  const logs = logsRes.data || []
  if (logs.length === 0) return { generated: false, reason: 'no_data' }

  const checkins = checkinsRes.data || []
  const avgFn = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null

  const sprintDone  = checkins.filter(c => c.completed).length
  const sprintTotal = checkins.length

  const dataSummary = {
    period: `${weekStart} — ${weekEnd}`,
    days_logged: logs.length,
    sprint_completion: `${sprintDone}/${sprintTotal}`,
    avg_wellbeing:  avgFn(logs.filter(l => l.wellbeing_index).map(l => parseFloat(l.wellbeing_index)))?.toFixed(1),
    avg_energy:     avgFn(logs.filter(l => l.energy).map(l => l.energy))?.toFixed(1),
    avg_mood:       avgFn(logs.filter(l => l.mood).map(l => l.mood))?.toFixed(1),
    avg_meaning:    avgFn(logs.filter(l => l.meaning).map(l => l.meaning))?.toFixed(1),
    avg_connection: avgFn(logs.filter(l => l.connection).map(l => l.connection))?.toFixed(1),
    avg_anxiety:    avgFn(logs.filter(l => l.anxiety_level).map(l => l.anxiety_level))?.toFixed(1),
    days_with_workout:    logs.filter(l => l.workout).length,
    days_with_regulation: logs.filter(l => l.regulation_practice).length,
    daily: logs.map(l => ({
      date: l.date, energy: l.energy, mood: l.mood, meaning: l.meaning,
      connection: l.connection, anxiety: l.anxiety_level,
      workout: l.workout, regulation: l.regulation_practice,
      sleep: l.sleep_quality, wellbeing: l.wellbeing_index,
    })),
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 800,
    system: WEEK_SYSTEM,
    messages: [{
      role: 'user',
      content: `Данные недели:\n${JSON.stringify(dataSummary, null, 2)}\n\nState Map:\n${stateRes.data?.state_map || 'Не указана'}`,
    }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : '{}'
  let parsed
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
  } catch {
    parsed = { summary_text: raw, insights: [], top_correlation: '', biggest_barrier: '', next_focus: '' }
  }

  const avgForSave = (field: string) =>
    avgFn(logs.filter(l => l[field] != null).map(l => l[field]))

  await supabaseAdmin.from('weekly_summaries').upsert(
    {
      user_id:              userId,
      week_start:           weekStart,
      week_end:             weekEnd,
      sprint_completion_rate: sprintTotal > 0 ? sprintDone / sprintTotal : null,
      avg_energy:           avgForSave('energy'),
      avg_mood:             avgForSave('mood'),
      avg_meaning:          avgForSave('meaning'),
      avg_connection:       avgForSave('connection'),
      avg_wellbeing:        avgFn(logs.filter(l => l.wellbeing_index).map(l => parseFloat(l.wellbeing_index))),
      avg_anxiety:          avgForSave('anxiety_level'),
      top_correlation:      parsed.top_correlation,
      biggest_barrier:      parsed.biggest_barrier,
      next_focus:           parsed.next_focus,
      summary_text:         parsed.summary_text,
    },
    { onConflict: 'user_id,week_start' },
  )

  return { generated: true }
}
