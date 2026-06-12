// @ts-nocheck

// ── Workout type classifiers ──────────────────────────────────────
// Health Auto Export sends Apple Fitness workout names verbatim.

function isStrength(t: string): boolean {
  return /strength|functional|weight|lifting|powerlifting|bodybuilding|resistance|core training/i.test(t)
}

function isCardio(t: string): boolean {
  return /running|walking|cycling|elliptical|rowing/i.test(t)
}

function isHIIT(t: string): boolean {
  return /hiit|interval|high intensity/i.test(t)
}

function isMobility(t: string): boolean {
  return /yoga|stretch|flexib|pilates|mobility/i.test(t)
}

// ── Types ─────────────────────────────────────────────────────────

export interface WorkoutRow {
  date: string
  workout_type: string
  minutes?: number | null
}

export interface ActivityWeekly {
  strength_sessions: number
  cardio_sessions: number
  zone2_minutes: number        // estimated from cardio session duration — no HR zone data available
  hiit_sessions: number
  mobility_sessions: number
  total_workout_minutes: number
  avg_steps: number
}

export interface ActivityGap {
  zone: 'strength' | 'zone2' | 'mobility' | 'hiit' | 'steps'
  severity: 'low' | 'medium' | 'high'
  message: string
  knowledge_topic: string
}

export interface ActivityAnalysis {
  weekly: ActivityWeekly
  vo2max: { latest: number | null; trend: 'rising' | 'falling' | 'stable' | 'insufficient_data' }
  gaps: ActivityGap[]
}

// ── Main function ─────────────────────────────────────────────────

export function analyzeActivity(dailyLogs: any[], workouts: WorkoutRow[] = []): ActivityAnalysis {
  const sorted = [...dailyLogs].sort((a, b) => a.date.localeCompare(b.date))
  const last7  = sorted.slice(-7)
  const last7Dates = new Set(last7.map((r: any) => r.date))

  // ── Weekly aggregates (last 7 days) ──────────────────────────
  let strength_sessions     = 0
  let cardio_sessions       = 0
  let zone2_minutes         = 0  // sum of cardio session minutes — proxy only, no HR zone data
  let hiit_sessions         = 0
  let mobility_sessions     = 0
  let total_workout_minutes = 0
  const stepValues: number[] = []

  // Steps and total minutes always come from daily_logs aggregate
  for (const row of last7) {
    const steps = Number(row.steps) || 0
    const mins  = Number(row.workout_minutes) || 0
    if (steps > 0) stepValues.push(steps)
    if (mins  > 0) total_workout_minutes += mins
  }

  if (workouts.length > 0) {
    // Classify from individual workout rows (accurate per-session data)
    for (const w of workouts.filter(w => last7Dates.has(w.date))) {
      const t    = w.workout_type || ''
      const mins = Number(w.minutes) || 0
      if (isHIIT(t))       { hiit_sessions++;     }
      else if (isStrength(t))  { strength_sessions++;  }
      else if (isMobility(t))  { mobility_sessions++;  }
      else if (isCardio(t))    { cardio_sessions++; zone2_minutes += mins }
    }
  } else {
    // Fallback for old data: parse comma-separated workout_type from daily_logs
    for (const row of last7) {
      const types = (row.workout_type || '')
        .split(',')
        .map((t: string) => t.trim())
        .filter(Boolean)
      const mins  = Number(row.workout_minutes) || 0

      if (types.length === 0) continue
      const minsPerType = Math.round(mins / types.length)

      for (const t of types) {
        if (isHIIT(t))       { hiit_sessions++;     }
        else if (isStrength(t))  { strength_sessions++;  }
        else if (isMobility(t))  { mobility_sessions++;  }
        else if (isCardio(t))    { cardio_sessions++; zone2_minutes += minsPerType }
      }
    }
  }

  const avg_steps = stepValues.length > 0
    ? Math.round(stepValues.reduce((a, b) => a + b, 0) / stepValues.length)
    : 0

  // ── VO2max trend (all available data, oldest vs latest) ───────
  const vo2Rows = sorted.filter(r => r.vo2max != null && Number(r.vo2max) > 0)
  let vo2Latest: number | null = null
  let vo2Trend: ActivityAnalysis['vo2max']['trend'] = 'insufficient_data'

  if (vo2Rows.length >= 1) {
    vo2Latest = Number(vo2Rows[vo2Rows.length - 1].vo2max)
    if (vo2Rows.length >= 2) {
      const first  = Number(vo2Rows[0].vo2max)
      const change = (vo2Latest - first) / first
      vo2Trend = change > 0.02 ? 'rising' : change < -0.02 ? 'falling' : 'stable'
    }
  }

  // ── Gap detection (last 7 days) ───────────────────────────────
  const gaps: ActivityGap[] = []

  if (strength_sessions < 2) {
    gaps.push({
      zone: 'strength',
      severity: strength_sessions === 0 ? 'high' : 'medium',
      message: `За неделю ${strength_sessions} силовых тренировок. Мышечная масса — один из ключевых факторов метаболического здоровья и долголетия.`,
      knowledge_topic: 'layer1_movement',
    })
  }

  if (zone2_minutes < 90) {
    gaps.push({
      zone: 'zone2',
      severity: 'medium',
      message: `Низкоинтенсивного кардио (Zone 2) набралось ${zone2_minutes} минут за неделю. Это база митохондриального здоровья и VO2max.`,
      knowledge_topic: 'layer1_movement',
    })
  }

  if (mobility_sessions === 0) {
    gaps.push({
      zone: 'mobility',
      severity: 'low',
      message: 'На этой неделе не было практик мобильности. Подвижность суставов влияет на качество движения и риск травм.',
      knowledge_topic: 'layer1_movement',
    })
  }

  if (hiit_sessions === 0) {
    gaps.push({
      zone: 'hiit',
      severity: 'low',
      message: 'Интервальных тренировок не было. Они дополняют Zone 2 для роста VO2max.',
      knowledge_topic: 'layer1_movement',
    })
  }

  if (stepValues.length > 0 && avg_steps < 7000) {
    gaps.push({
      zone: 'steps',
      severity: 'medium',
      message: `Среднее количество шагов за неделю — ${avg_steps.toLocaleString()}. Базовая активность вне тренировок тоже влияет на метаболическое здоровье.`,
      knowledge_topic: 'layer1_movement',
    })
  }

  return {
    weekly: {
      strength_sessions,
      cardio_sessions,
      zone2_minutes,
      hiit_sessions,
      mobility_sessions,
      total_workout_minutes,
      avg_steps,
    },
    vo2max: { latest: vo2Latest, trend: vo2Trend },
    gaps,
  }
}
