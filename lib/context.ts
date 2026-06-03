// @ts-nocheck
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── Типы ────────────────────────────────────────────────────

export interface BiomarkerTrend {
  key: string
  label: string
  values: { date: string; value: number }[]
  trend: 'rising' | 'falling' | 'stable' | 'insufficient_data'
  latest: number | null
  status: 'optimal' | 'warning' | 'danger' | 'unknown'
}

export interface UserContext {
  state_map: string | null
  active_sprints: any[]
  recent_checkins: any[]
  weekly_summary: string | null
  latest_biomarkers: Record<string, number>
  biomarker_trends: BiomarkerTrend[]
  active_recommendations: any[]
}

// ─── Оценка статуса биомаркера ────────────────────────────────

const BIOMARKER_RANGES: Record<string, { optimal: [number, number] | null; low?: number; high?: number }> = {
  glucose:            { optimal: [4.0, 5.5] },
  hba1c:              { optimal: null, high: 5.7 },
  insulin:            { optimal: [3, 25] },
  cholesterol_ldl:    { optimal: null, high: 2.5 },
  cholesterol_hdl:    { optimal: [1.2, 99] },
  cholesterol_total:  { optimal: null, high: 5.0 },
  triglycerides:      { optimal: null, high: 1.7 },
  crp:                { optimal: null, high: 1.0 },
  homocysteine:       { optimal: null, high: 9 },
  testosterone_total: { optimal: [15, 35] },
  testosterone_free:  { optimal: [0.2, 0.6] },
  cortisol:           { optimal: [300, 500] },
  tsh:                { optimal: [1.0, 2.5] },
  vitamin_d:          { optimal: [75, 999] },
  vitamin_b12:        { optimal: [300, 999] },
  ferritin:           { optimal: [70, 150] },
  iron:               { optimal: [10, 30] },
  magnesium:          { optimal: [0.85, 1.1] },
  omega3_index:       { optimal: [8, 999] },
  hemoglobin:         { optimal: [130, 170] },
  wbc:                { optimal: [4, 9] },
  platelets:          { optimal: [150, 400] },
}

const BIOMARKER_LABELS: Record<string, string> = {
  glucose: 'Глюкоза', hba1c: 'HbA1c', insulin: 'Инсулин',
  cholesterol_ldl: 'LDL', cholesterol_hdl: 'HDL', cholesterol_total: 'Холестерин',
  triglycerides: 'Триглицериды', crp: 'СРБ', homocysteine: 'Гомоцистеин',
  testosterone_total: 'Тестостерон общий', testosterone_free: 'Тестостерон свободный',
  cortisol: 'Кортизол', tsh: 'ТТГ', vitamin_d: 'Витамин D',
  vitamin_b12: 'Витамин B12', ferritin: 'Ферритин', iron: 'Железо',
  magnesium: 'Магний', omega3_index: 'Омега-3', hemoglobin: 'Гемоглобин',
  wbc: 'Лейкоциты', platelets: 'Тромбоциты',
}

function getBiomarkerStatus(key: string, value: number): 'optimal' | 'warning' | 'danger' | 'unknown' {
  const range = BIOMARKER_RANGES[key]
  if (!range) return 'unknown'
  if (range.optimal) {
    const [lo, hi] = range.optimal
    if (value >= lo && value <= hi) return 'optimal'
    if (value < lo * 0.7 || value > hi * 1.5) return 'danger'
    return 'warning'
  }
  if (range.high !== undefined) {
    if (value < range.high) return 'optimal'
    if (value < range.high * 1.5) return 'warning'
    return 'danger'
  }
  if (range.low !== undefined) {
    if (value > range.low) return 'optimal'
    if (value > range.low * 0.7) return 'warning'
    return 'danger'
  }
  return 'unknown'
}

function calcTrend(values: { date: string; value: number }[]): 'rising' | 'falling' | 'stable' | 'insufficient_data' {
  if (values.length < 2) return 'insufficient_data'
  const sorted = [...values].sort((a, b) => a.date.localeCompare(b.date))
  const first = sorted[0].value
  const last = sorted[sorted.length - 1].value
  const change = (last - first) / first
  if (change > 0.1) return 'rising'
  if (change < -0.1) return 'falling'
  return 'stable'
}

// ─── Главная функция ──────────────────────────────────────────

export async function getUserContext(userId: string): Promise<UserContext> {
  const BIOMARKER_KEYS = Object.keys(BIOMARKER_LABELS)

  const [
    sessionRes,
    sprintsRes,
    checkinsRes,
    weeklyRes,
    healthRes,
    recommendationsRes,
  ] = await Promise.all([
    // Последняя завершённая сессия с State Map
    supabaseAdmin
      .from('sessions')
      .select('state_map, created_at')
      .eq('user_id', userId)
      .eq('completed', true)
      .not('state_map', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),

    // Активные спринты
    supabaseAdmin
      .from('sprints')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active'),

    // Последние 14 чекинов
    supabaseAdmin
      .from('checkins')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(14),

    // Последний weekly summary
    supabaseAdmin
      .from('weekly_summaries')
      .select('summary, week_start')
      .eq('user_id', userId)
      .order('week_start', { ascending: false })
      .limit(1)
      .single(),

    // Все чекапы для динамики
    supabaseAdmin
      .from('health_metrics')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(50),

    // Активные рекомендации
    supabaseAdmin
      .from('recommendations')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const healthRows = healthRes.data || []

  // Собираем тренды по каждому биомаркеру
  const biomarkerTrends: BiomarkerTrend[] = []
  const latestBiomarkers: Record<string, number> = {}

  for (const key of BIOMARKER_KEYS) {
    const points = healthRows
      .filter(row => row[key] != null)
      .map(row => ({ date: row.date, value: row[key] as number }))
      .sort((a, b) => a.date.localeCompare(b.date))

    if (points.length === 0) continue

    const latest = points[points.length - 1].value
    latestBiomarkers[key] = latest

    biomarkerTrends.push({
      key,
      label: BIOMARKER_LABELS[key],
      values: points,
      trend: calcTrend(points),
      latest,
      status: getBiomarkerStatus(key, latest),
    })
  }

  return {
    state_map: sessionRes.data?.state_map || null,
    active_sprints: sprintsRes.data || [],
    recent_checkins: checkinsRes.data || [],
    weekly_summary: weeklyRes.data?.summary || null,
    latest_biomarkers: latestBiomarkers,
    biomarker_trends: biomarkerTrends,
    active_recommendations: recommendationsRes.data || [],
  }
}

// ─── Форматирование контекста в текст для промпта ─────────────

export function formatContextForPrompt(ctx: UserContext): string {
  const parts: string[] = []

  if (ctx.state_map) {
    parts.push(`## Карта состояния (State Map)\n${ctx.state_map}`)
  }

  if (ctx.active_sprints.length > 0) {
    const sprintLines = ctx.active_sprints.map(s =>
      `- ${s.behavior_name} (${s.layer_name}, уровень ${s.level})`
    )
    parts.push(`## Активные спринты\n${sprintLines.join('\n')}`)
  }

  if (ctx.weekly_summary) {
    parts.push(`## Итог последней недели\n${ctx.weekly_summary}`)
  }

  if (ctx.recent_checkins.length > 0) {
    const last7 = ctx.recent_checkins.slice(0, 7)
    const checkinLines = last7.map(c =>
      `- ${c.date}: спринт ${c.completed ? '✓' : '✗'}, энергия ${c.energy ?? '—'}, настроение ${c.mood ?? '—'}, смысл ${c.meaning ?? '—'}, связь ${c.connection ?? '—'}`
    )
    parts.push(`## Чекины (последние 7 дней)\n${checkinLines.join('\n')}`)
  }

  if (ctx.biomarker_trends.length > 0) {
    const danger = ctx.biomarker_trends.filter(b => b.status === 'danger')
    const warning = ctx.biomarker_trends.filter(b => b.status === 'warning')
    const optimal = ctx.biomarker_trends.filter(b => b.status === 'optimal')

    const bioLines: string[] = []

    if (danger.length > 0) {
      bioLines.push('Требуют внимания: ' + danger.map(b =>
        `${b.label} = ${b.latest} (тренд: ${b.trend})`
      ).join(', '))
    }
    if (warning.length > 0) {
      bioLines.push('Пограничные: ' + warning.map(b =>
        `${b.label} = ${b.latest} (тренд: ${b.trend})`
      ).join(', '))
    }
    if (optimal.length > 0) {
      bioLines.push('В норме: ' + optimal.map(b => `${b.label} = ${b.latest}`).join(', '))
    }

    parts.push(`## Биомаркеры\n${bioLines.join('\n')}`)
  }

  if (ctx.active_recommendations.length > 0) {
    const recLines = ctx.active_recommendations.map(r =>
      `- [${r.priority}] ${r.title}`
    )
    parts.push(`## Активные рекомендации\n${recLines.join('\n')}`)
  }

  return parts.join('\n\n')
}
