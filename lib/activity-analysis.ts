// @ts-nocheck

// ── Workout type classifiers ──────────────────────────────────────
// Health Auto Export sends Apple Fitness workout names verbatim.

function isStrength(t: string): boolean {
  return /strength|functional|weight|lifting|powerlifting|bodybuilding|resistance|core training/i.test(t)
}

function isCardio(t: string): boolean {
  return /running|cycling|walking|swimming|rowing|elliptical|stair|treadmill|hiking|cycling|bike|outdoor walk|outdoor run|indoor run|indoor walk|indoor cycling/i.test(t)
}

function isHIIT(t: string): boolean {
  return /hiit|interval|circuit|crossfit|tabata/i.test(t)
}

function isMobility(t: string): boolean {
  return /yoga|stretch|flexib|pilates|barre|mobility/i.test(t)
}

// ── Types ─────────────────────────────────────────────────────────

export interface ActivityWeekly {
  strength_sessions: number
  cardio_sessions: number
  zone2_minutes: number        // estimated from low-intensity cardio — not HR-zone verified
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
  vo2max: { latest: number | null; trend: 'rising' | 'falling' | 'stable' }
  gaps: ActivityGap[]
}

// ── Main function ─────────────────────────────────────────────────

export function analyzeActivity(dailyLogs: any[]): ActivityAnalysis {
  const sorted = [...dailyLogs].sort((a, b) => a.date.localeCompare(b.date))
  const last7  = sorted.slice(-7)

  // ── Weekly aggregates (last 7 days) ──────────────────────────
  let strength_sessions    = 0
  let cardio_sessions      = 0
  let zone2_minutes        = 0
  let hiit_sessions        = 0
  let mobility_sessions    = 0
  let total_workout_minutes = 0
  const stepValues: number[] = []

  for (const row of last7) {
    const type = (row.workout_type || '').trim()
    const mins = Number(row.workout_minutes) || 0
    const steps = Number(row.steps) || 0

    if (steps > 0) stepValues.push(steps)
    if (mins > 0) total_workout_minutes += mins

    if (!type) continue

    if (isHIIT(type)) {
      hiit_sessions++
    } else if (isStrength(type)) {
      strength_sessions++
    } else if (isMobility(type)) {
      mobility_sessions++
    } else if (isCardio(type)) {
      cardio_sessions++
      // Zone 2 estimate: attribute all non-HIIT cardio minutes as zone-2 proxy
      zone2_minutes += mins
    }
  }

  const avg_steps = stepValues.length > 0
    ? Math.round(stepValues.reduce((a, b) => a + b, 0) / stepValues.length)
    : 0

  // ── VO2max trend (all available data) ─────────────────────────
  const vo2Rows = sorted.filter(r => r.vo2max != null && Number(r.vo2max) > 0)
  let vo2Latest: number | null = null
  let vo2Trend: 'rising' | 'falling' | 'stable' = 'stable'

  if (vo2Rows.length > 0) {
    vo2Latest = Number(vo2Rows[vo2Rows.length - 1].vo2max)
    if (vo2Rows.length >= 2) {
      const first  = Number(vo2Rows[0].vo2max)
      const change = (vo2Latest - first) / first
      vo2Trend = change > 0.03 ? 'rising' : change < -0.03 ? 'falling' : 'stable'
    }
  }

  // ── Gap detection ─────────────────────────────────────────────
  const gaps: ActivityGap[] = []

  // Strength
  if (strength_sessions < 2) {
    gaps.push({
      zone: 'strength',
      severity: strength_sessions === 0 ? 'high' : 'medium',
      message: `За неделю ${strength_sessions} силовых. Мышечная масса — ключевой фактор метаболизма и долголетия.`,
      knowledge_topic: 'layer1_movement',
    })
  }

  // Zone 2
  if (zone2_minutes < 90) {
    gaps.push({
      zone: 'zone2',
      severity: zone2_minutes === 0 ? 'high' : zone2_minutes < 45 ? 'medium' : 'low',
      message: 'Мало низкоинтенсивного кардио (Zone 2). Это база митохондриального здоровья и VO2max.',
      knowledge_topic: 'layer1_movement',
    })
  }

  // Mobility
  const hasMobility = last7.some(r => r.workout_type && isMobility(r.workout_type))
  if (!hasMobility) {
    gaps.push({
      zone: 'mobility',
      severity: 'medium',
      message: 'Не вижу практик мобильности. Подвижность суставов влияет на качество движения и снижает риск травм.',
      knowledge_topic: 'layer1_movement',
    })
  }

  // HIIT — only a gentle note, severity always low
  if (hiit_sessions === 0) {
    gaps.push({
      zone: 'hiit',
      severity: 'low',
      message: 'Нет высокоинтенсивных интервалов. Короткие HIIT-сессии эффективно поднимают VO2max.',
      knowledge_topic: 'layer1_movement',
    })
  }

  // Steps — only flag if we actually have step data
  if (stepValues.length > 0 && avg_steps < 7000) {
    gaps.push({
      zone: 'steps',
      severity: avg_steps < 4000 ? 'high' : 'medium',
      message: `Среднее ${avg_steps.toLocaleString()} шагов/день. Базовая двигательная активность влияет на метаболизм и настроение.`,
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
