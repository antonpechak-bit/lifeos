// @ts-nocheck
import { createClient } from '@supabase/supabase-js'
import { analyzeActivity, ActivityAnalysis, WorkoutRow } from './activity-analysis'
import { computeDrift, DriftSignal } from './drift'

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

export interface PeriodSummary {
  id: string
  period_type: 'month' | 'quarter' | 'year'
  period_start: string
  period_end: string
  label: string | null
  summary_text: string
  key_themes: string[]
  central_obs: string | null
  metrics: Record<string, any>
}

export interface UserValue {
  id: string
  value_name: string
  layer: number | null
  operationalization: string | null
  alignment_score: number | null
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
  period_summaries: PeriodSummary[]
  user_values: UserValue[]
  drift_signal: DriftSignal
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

  const twentyOneDaysAgo = new Date()
  twentyOneDaysAgo.setDate(twentyOneDaysAgo.getDate() - 21)
  const twentyOneDaysAgoStr = twentyOneDaysAgo.toISOString().slice(0, 10)

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
    periodSummariesRes,
    userValuesRes,
    valueCheckinsRes,
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

    // Данные с носимых устройств + wellbeing — последние 30 дней
    supabaseAdmin
      .from('daily_logs')
      .select('user_id, date, sleep_hours, hrv, steps, resting_heart_rate, workout_minutes, workout_type, vo2max, energy, mood, meaning, connection')
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

    // Period summaries — most recent month, quarter, year
    supabaseAdmin
      .from('period_summaries')
      .select('id, period_type, period_start, period_end, label, summary_text, key_themes, central_obs, metrics')
      .eq('user_id', userId)
      .in('period_type', ['month', 'quarter', 'year'])
      .order('period_start', { ascending: false })
      .limit(6),

    // User values
    supabaseAdmin
      .from('user_values')
      .select('id, value_name, layer, operationalization, alignment_score')
      .eq('user_id', userId)
      .order('created_at'),

    // Value checkins — last 21 days for alignment + drift computation
    supabaseAdmin
      .from('value_checkins')
      .select('value_id, score, date')
      .eq('user_id', userId)
      .gte('date', twentyOneDaysAgoStr)
      .order('date'),
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

  // Lookup daily_logs by date for merging wellbeing into checkins
  const dailyLogsByDate: Record<string, any> = {}
  for (const d of dailyLogs) {
    dailyLogsByDate[d.date] = d
  }

  // Compute alignment scores from recent value_checkins
  const rawValues = (userValuesRes.data || []) as UserValue[]
  const valueCheckins = valueCheckinsRes.data || []
  const userValues: UserValue[] = rawValues.map(v => {
    const vc = valueCheckins.filter((c: any) => c.value_id === v.id)
    const alignmentScore = vc.length > 0
      ? Math.round(vc.reduce((sum: number, c: any) => sum + c.score, 0) / vc.length * 10)
      : v.alignment_score
    return { ...v, alignment_score: alignmentScore }
  })

  const layerStatuses = (layerStatusRes.data || []) as LayerStatus[]

  const drift_signal = computeDrift({
    userValues: rawValues,
    valueCheckins,
    dailyLogs,
    layerStatuses,
    windowDays: 21,
  })

  return {
    state_map: sessionRes.data?.state_map || null,
    active_sprints: sprintsRes.data || [],
    recent_checkins: (checkinsRes.data || []).map((c: any) => {
      const dl = dailyLogsByDate[c.date]
      return {
        ...c,
        energy:     dl?.energy     ?? null,
        mood:       dl?.mood       ?? null,
        meaning:    dl?.meaning    ?? null,
        connection: dl?.connection ?? null,
      }
    }),
    weekly_summary: weeklyRes.data?.summary || null,
    latest_biomarkers: latestBiomarkers,
    biomarker_trends: biomarkerTrends,
    active_recommendations: recommendationsRes.data || [],
    health_trends: calcHealthTrends(dailyLogs),
    activity_analysis: analyzeActivity(dailyLogs, workouts),
    client_insights: (clientInsightsRes.data || []) as ClientInsight[],
    layer_statuses: layerStatuses,
    period_summaries: (periodSummariesRes.data || []) as PeriodSummary[],
    user_values: userValues,
    drift_signal,
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

  if (ctx.user_values && ctx.user_values.length > 0) {
    const valueLines = ctx.user_values.map(v => {
      const score = v.alignment_score != null ? ` · alignment ${v.alignment_score}%` : ''
      const layer = v.layer != null ? ` [слой ${v.layer}]` : ''
      const op = v.operationalization ? ` — ${v.operationalization.replace(/\n/g, '; ')}` : ''
      return `- ${v.value_name}${layer}${score}${op}`
    })
    parts.push(`## Ценности и alignment (21 день)\n${valueLines.join('\n')}`)
  }

  if (ctx.drift_signal?.detected) {
    const d = ctx.drift_signal
    const valStr = d.weakest_values.map(v => `${v.value_name} (${v.score}/10)`).join(', ')
    parts.push(
      `## Сигнал дрейфа (21 день)\n` +
      `Performance стабилен (→ ${d.performance_trend}/100), alignment падает (${d.alignment_trend}/100). Разрыв: ${d.gap} пп. ` +
      `Слабее всего: ${valStr || '—'}.\n` +
      `Поднять мягко как наблюдение + феноменологический вопрос, если уместно по ходу разговора — не как диагноз.`
    )
  }

  if (ctx.period_summaries.length > 0) {
    // Show one of each type, most recent first
    const byType: Record<string, PeriodSummary> = {}
    for (const ps of ctx.period_summaries) {
      if (!byType[ps.period_type]) byType[ps.period_type] = ps
    }
    const order: Array<'month' | 'quarter' | 'year'> = ['month', 'quarter', 'year']
    const lines: string[] = []
    for (const type of order) {
      const ps = byType[type]
      if (!ps) continue
      const typeLabel = type === 'month' ? 'Месяц' : type === 'quarter' ? 'Квартал' : 'Год'
      lines.push(`### ${typeLabel}${ps.label ? ` · ${ps.label}` : ''}`)
      lines.push(ps.summary_text)
      if (ps.key_themes?.length) lines.push(`Темы: ${ps.key_themes.join(', ')}`)
      if (ps.central_obs) lines.push(`Суть: ${ps.central_obs}`)
    }
    if (lines.length > 0) {
      parts.push(`## Долгосрочная память (телескоп)\n${lines.join('\n')}`)
    }
  }

  return parts.join('\n\n')
}
