// @ts-nocheck
import { createClient } from '@supabase/supabase-js'
import { analyzeActivity, ActivityAnalysis, WorkoutRow } from './activity-analysis'

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

export interface HealthTrends {
  avg_sleep_7d: number | null
  avg_sleep_30d: number | null
  avg_hrv_7d: number | null
  avg_hrv_30d: number | null
  hrv_trend: 'rising' | 'falling' | 'stable' | 'insufficient_data'
  avg_steps_7d: number | null
  workouts_7d: number
  workouts_7d_types: string[]
  recent_days: { date: string; sleep_hours: number | null; hrv: number | null; steps: number | null; resting_heart_rate: number | null }[]
}

export interface ClientInsight {
  id: string
  created_at: string
  source: string | null
  layer: number | null
  category: string | null
  content: string
  related_sprint_id: string | null
  status: string
}

export interface LayerStatus {
  layer: number
  status: string
  last_checked: string | null
  notes: string | null
}

export interface UserContext {
  state_map: string | null
  active_sprints: any[]
  recent_checkins: any[]
  weekly_summary: string | null
  latest_biomarkers: Record<string, number>
  biomarker_trends: BiomarkerTrend[]
  active_recommendations: any[]
  health_trends: HealthTrends
  activity_analysis: ActivityAnalysis
  client_insights: ClientInsight[]
  layer_statuses: LayerStatus[]
}

// ─── Оценка статуса биомаркера по ref_min/ref_max из данных ──

function getBiomarkerStatusFromRef(
  value: number,
  ref_min: number | null,
  ref_max: number | null,
): 'optimal' | 'warning' | 'danger' | 'unknown' {
  if (ref_min == null && ref_max == null) return 'unknown'
  if (ref_min != null && ref_max != null) {
    if (value >= ref_min && value <= ref_max) return 'optimal'
    if (value < ref_min * 0.7 || value > ref_max * 1.5) return 'danger'
    return 'warning'
  }
  if (ref_max != null) {
    if (value <= ref_max) return 'optimal'
    if (value <= ref_max * 1.5) return 'warning'
    return 'danger'
  }
  // ref_min only
  if (value >= ref_min!) return 'optimal'
  if (value >= ref_min! * 0.7) return 'warning'
  return 'danger'
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

function avg(nums: number[]): number | null {
  const valid = nums.filter(n => n != null && !isNaN(n))
  return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null
}

function calcHealthTrends(rows: any[]): HealthTrends {
  // rows are ordered desc by date; sort asc for slicing
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  const last30 = sorted.slice(-30)
  const last7  = sorted.slice(-7)

  const sleep30 = last30.map(r => r.sleep_hours).filter(v => v != null)
  const sleep7  = last7.map(r => r.sleep_hours).filter(v => v != null)
  const hrv30   = last30.map(r => r.hrv).filter(v => v != null)
  const hrv7    = last7.map(r => r.hrv).filter(v => v != null)
  const steps7  = last7.map(r => r.steps).filter(v => v != null)

  // HRV trend: last 3 days vs preceding 3 days (days 4-6 of the 7-day window)
  const hrvRecent   = last7.slice(-3).map(r => r.hrv).filter(v => v != null)
  const hrvPrevious = last7.slice(-7, -3).map(r => r.hrv).filter(v => v != null)
  let hrv_trend: HealthTrends['hrv_trend'] = 'insufficient_data'
  if (hrvRecent.length >= 1 && hrvPrevious.length >= 1) {
    const recentAvg   = avg(hrvRecent)!
    const previousAvg = avg(hrvPrevious)!
    const change = (recentAvg - previousAvg) / previousAvg
    hrv_trend = change > 0.1 ? 'rising' : change < -0.1 ? 'falling' : 'stable'
  }

  const workoutDays = last7.filter(r => r.workout_minutes != null && r.workout_minutes > 0)
  const workoutTypes = [...new Set(
    workoutDays.map(r => r.workout_type).filter(Boolean)
  )] as string[]

  const recent_days = last7.map(r => ({
    date: r.date,
    sleep_hours: r.sleep_hours ?? null,
    hrv: r.hrv ?? null,
    steps: r.steps ?? null,
    resting_heart_rate: r.resting_heart_rate ?? null,
  }))

  return {
    avg_sleep_7d:    avg(sleep7),
    avg_sleep_30d:   avg(sleep30),
    avg_hrv_7d:      avg(hrv7),
    avg_hrv_30d:     avg(hrv30),
    hrv_trend,
    avg_steps_7d:    avg(steps7),
    workouts_7d:     workoutDays.length,
    workouts_7d_types: workoutTypes,
    recent_days,
  }
}

// ─── Главная функция ──────────────────────────────────────────

export async function getUserContext(userId: string): Promise<UserContext> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10)

  const [
    sessionRes,
    sprintsRes,
    checkinsRes,
    weeklyRes,
    healthRes,
    recommendationsRes,
    dailyLogsRes,
    workoutsRes,
    clientInsightsRes,
    layerStatusRes,
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

    // Все биомаркеры для динамики
    supabaseAdmin
      .from('health_biomarkers')
      .select('key, name, value, unit, ref_min, ref_max, is_flagged, date')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(200),

    // Активные рекомендации
    supabaseAdmin
      .from('recommendations')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(10),

    // Данные с носимых устройств — последние 30 дней
    supabaseAdmin
      .from('daily_logs')
      .select('user_id, date, sleep_hours, hrv, steps, resting_heart_rate, workout_minutes, workout_type, vo2max')
      .eq('user_id', userId)
      .gte('date', thirtyDaysAgoStr)
      .order('date', { ascending: false }),

    // Individual workouts — last 30 days
    supabaseAdmin
      .from('workouts')
      .select('date, workout_type, minutes')
      .eq('user_id', userId)
      .gte('date', thirtyDaysAgoStr)
      .order('date', { ascending: false }),

    // Active client insights — last 20
    supabaseAdmin
      .from('client_insights')
      .select('id, created_at, source, layer, category, content, related_sprint_id, status')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(20),

    // Layer statuses
    supabaseAdmin
      .from('layer_status')
      .select('layer, status, last_checked, notes')
      .eq('user_id', userId),
  ])

  const healthRows = healthRes.data || []

  // Group rows by biomarker key; each row has key/name/value/unit/ref_min/ref_max/is_flagged/date
  const grouped: Record<string, any[]> = {}
  for (const row of healthRows) {
    if (row.key == null || row.value == null) continue
    if (!grouped[row.key]) grouped[row.key] = []
    grouped[row.key].push(row)
  }

  const biomarkerTrends: BiomarkerTrend[] = []
  const latestBiomarkers: Record<string, number> = {}

  for (const [key, rows] of Object.entries(grouped)) {
    const points = rows
      .map(r => ({ date: r.date as string, value: r.value as number }))
      .sort((a, b) => a.date.localeCompare(b.date))

    if (points.length === 0) continue

    const latestRow = rows.reduce((a, b) => (a.date > b.date ? a : b))
    const latest = latestRow.value as number
    latestBiomarkers[key] = latest

    biomarkerTrends.push({
      key,
      label: (latestRow.name as string) || key,
      values: points,
      trend: calcTrend(points),
      latest,
      status: getBiomarkerStatusFromRef(latest, latestRow.ref_min ?? null, latestRow.ref_max ?? null),
    })
  }

  const dailyLogs = dailyLogsRes.data || []
  const workouts  = (workoutsRes.data || []) as WorkoutRow[]

  return {
    state_map: sessionRes.data?.state_map || null,
    active_sprints: sprintsRes.data || [],
    recent_checkins: checkinsRes.data || [],
    weekly_summary: weeklyRes.data?.summary || null,
    latest_biomarkers: latestBiomarkers,
    biomarker_trends: biomarkerTrends,
    active_recommendations: recommendationsRes.data || [],
    health_trends: calcHealthTrends(dailyLogs),
    activity_analysis: analyzeActivity(dailyLogs, workouts),
    client_insights: (clientInsightsRes.data || []) as ClientInsight[],
    layer_statuses: (layerStatusRes.data || []) as LayerStatus[],
  }
}

// ─── Форматирование контекста в текст для промпта ─────────────

const LAYER_NAMES: Record<number, string> = {
  1: 'Телесная основа',
  2: 'Безопасность / ВНС',
  3: 'Связь',
  4: 'Внимание',
  5: 'Ценности',
  6: 'Смысл',
  7: 'Трансценденция',
}

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

  const aa = ctx.activity_analysis
  const hasActivityData = aa.weekly.total_workout_minutes > 0 || aa.weekly.avg_steps > 0
  if (hasActivityData || aa.gaps.length > 0) {
    const w = aa.weekly
    const lines: string[] = [
      `- Силовые: ${w.strength_sessions}/нед, Кардио: ${w.cardio_sessions}/нед, Мобильность: ${w.mobility_sessions}/нед, HIIT: ${w.hiit_sessions}/нед`,
      `- Zone 2 (оценка): ${w.zone2_minutes} мин/нед, Всего активности: ${w.total_workout_minutes} мин`,
      w.avg_steps > 0 ? `- Шаги: среднее ${w.avg_steps.toLocaleString()}/день` : null,
      aa.vo2max.latest != null ? `- VO2max: ${aa.vo2max.latest.toFixed(1)} (тренд: ${aa.vo2max.trend})` : null,
    ].filter(Boolean)

    if (aa.gaps.length > 0) {
      lines.push('- Слабые зоны: ' + aa.gaps.map(g => `[${g.severity}] ${g.message}`).join(' | '))
    }

    parts.push(`## Анализ активности\n${lines.join('\n')}`)
  }

  const ht = ctx.health_trends
  const hasWearableData = ht.recent_days.some(
    d => d.sleep_hours != null || d.hrv != null || d.steps != null || d.resting_heart_rate != null
  )
  if (hasWearableData) {
    const fmt1 = (v: number | null, unit = '') => v != null ? `${Math.round(v)}${unit}` : '—'
    const fmtF = (v: number | null, unit = '') => v != null ? `${v.toFixed(1)}${unit}` : '—'
    const wLines: string[] = [
      `- Сон: среднее ${fmtF(ht.avg_sleep_7d, ' ч')} (30 дней: ${fmtF(ht.avg_sleep_30d, ' ч')})`,
      `- HRV: среднее ${fmt1(ht.avg_hrv_7d, ' мс')}, тренд: ${ht.hrv_trend}`,
      `- Шаги: среднее ${fmt1(ht.avg_steps_7d)}`,
      `- Тренировки за неделю: ${ht.workouts_7d}${ht.workouts_7d_types.length > 0 ? ` (типы: ${ht.workouts_7d_types.join(', ')})` : ''}`,
    ]
    parts.push(`## Данные с носимых устройств (последние 7 дней)\n${wLines.join('\n')}`)
  }

  if (ctx.client_insights.length > 0) {
    const byLayer: Record<string, ClientInsight[]> = {}
    for (const insight of ctx.client_insights) {
      const key = insight.layer != null ? String(insight.layer) : 'other'
      if (!byLayer[key]) byLayer[key] = []
      byLayer[key].push(insight)
    }
    const insightLines: string[] = []
    for (const [layerKey, insights] of Object.entries(byLayer).sort()) {
      const layerNum = parseInt(layerKey)
      const layerLabel = !isNaN(layerNum)
        ? `Слой ${layerNum}${LAYER_NAMES[layerNum] ? ` (${LAYER_NAMES[layerNum]})` : ''}`
        : 'Без слоя'
      insightLines.push(`### ${layerLabel}`)
      for (const ins of insights) {
        insightLines.push(`- ${ins.content}`)
      }
    }
    parts.push(`## Накопленные наблюдения\n${insightLines.join('\n')}`)
  }

  if (ctx.layer_statuses.length > 0) {
    const now = new Date()
    const statusLines = [...ctx.layer_statuses]
      .sort((a, b) => a.layer - b.layer)
      .map(ls => {
        const name = LAYER_NAMES[ls.layer] ? ` (${LAYER_NAMES[ls.layer]})` : ''
        let daysAgo = '—'
        if (ls.last_checked) {
          const days = Math.round((now.getTime() - new Date(ls.last_checked).getTime()) / 86400000)
          daysAgo = `${days} дн. назад`
        }
        const notes = ls.notes ? `, заметки: ${ls.notes}` : ''
        return `- Слой ${ls.layer}${name}: ${ls.status}, последняя проверка: ${daysAgo}${notes}`
      })
    parts.push(`## Состояние по слоям\n${statusLines.join('\n')}`)
  }

  return parts.join('\n\n')
}
