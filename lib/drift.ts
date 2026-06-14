// @ts-nocheck

export interface DriftSignal {
  detected: boolean
  severity: 'mild' | 'notable' | null
  performance_trend: number   // normalized 0-100
  alignment_trend: number     // normalized 0-100
  gap: number                 // gap on 0-100 scale
  weakest_values: { value_name: string; score: number }[]
  window_days: number
}

interface DriftInput {
  userValues: { id: string; value_name: string }[]
  valueCheckins: { value_id: string; score: number; date: string }[]
  dailyLogs: { date: string; energy?: number | null; steps?: number | null; workout_minutes?: number | null }[]
  layerStatuses: { layer: number; status: string }[]
  windowDays?: number
}

// Least-squares slope over an ordered series
function linearSlope(values: number[]): number {
  const n = values.length
  if (n < 2) return 0
  const meanX = (n - 1) / 2
  const meanY = values.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY)
    den += (i - meanX) ** 2
  }
  return den === 0 ? 0 : num / den
}

// Pure computation — takes already-fetched data, no DB calls
export function computeDrift({
  userValues,
  valueCheckins,
  dailyLogs,
  layerStatuses,
  windowDays = 21,
}: DriftInput): DriftSignal {
  const EMPTY: DriftSignal = {
    detected: false,
    severity: null,
    performance_trend: 0,
    alignment_trend: 0,
    gap: 0,
    weakest_values: [],
    window_days: windowDays,
  }

  if (userValues.length === 0) return EMPTY

  // Filter to window
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - windowDays)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const windowCheckins = valueCheckins.filter(vc => vc.date >= cutoffStr)
  const windowLogs = dailyLogs.filter(l => l.date >= cutoffStr)

  // Need at least ~7 days of value check-ins to detect meaningful drift
  if (windowCheckins.length < 7) return EMPTY

  // ── Alignment track ────────────────────────────────────────────
  // Group by date → daily average score
  const alignByDate: Record<string, number[]> = {}
  for (const vc of windowCheckins) {
    if (!alignByDate[vc.date]) alignByDate[vc.date] = []
    alignByDate[vc.date].push(vc.score)
  }
  const alignDays = Object.entries(alignByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, scores]) => scores.reduce((a, b) => a + b, 0) / scores.length)

  if (alignDays.length < 4) return EMPTY

  // Scores 1-10 → normalize to 0-100
  const alignNorm = alignDays.map(s => (s / 10) * 100)
  const avgAlignment = alignNorm.reduce((a, b) => a + b, 0) / alignNorm.length
  const alignmentSlope = linearSlope(alignNorm)

  // ── Performance track ──────────────────────────────────────────
  // Components: energy (1-10→0-100), steps (0-10k→0-100), workout (0-60min→0-100)
  const perfPoints: number[] = []
  for (const log of windowLogs) {
    const parts: number[] = []
    if (log.energy != null) parts.push((log.energy / 10) * 100)
    if (log.steps != null) parts.push(Math.min((log.steps / 10000) * 100, 100))
    if (log.workout_minutes != null && log.workout_minutes > 0)
      parts.push(Math.min((log.workout_minutes / 60) * 100, 100))
    if (parts.length > 0)
      perfPoints.push(parts.reduce((a, b) => a + b, 0) / parts.length)
  }

  // Physiological stability bonus (layer 1 = physiology, layer 2 = nervous system)
  const physioStable = layerStatuses.filter(
    ls => (ls.layer === 1 || ls.layer === 2) && ls.status === 'stable'
  ).length
  const physioBonus = physioStable * 8  // up to +16pp if both layers stable

  let avgPerformance: number
  let performanceSlope: number

  if (perfPoints.length >= 3) {
    const boosted = perfPoints.map(p => Math.min(p + physioBonus, 100))
    avgPerformance = boosted.reduce((a, b) => a + b, 0) / boosted.length
    performanceSlope = linearSlope(boosted)
  } else {
    // Not enough daily log data but physio layers are stable → moderate baseline
    avgPerformance = 50 + physioBonus
    performanceSlope = 0
  }

  // ── Drift condition ────────────────────────────────────────────
  const gap = Math.max(0, avgPerformance - avgAlignment)

  // Performance: stable or not declining (slope >= -0.3 per day OR avg >= 50%)
  const perfStable = performanceSlope >= -0.3 || avgPerformance >= 50

  // Alignment: falling (slope < -0.5 per day) OR below 40/100
  const alignLow = alignmentSlope < -0.5 || avgAlignment < 40

  const detected = perfStable && alignLow && gap >= 25

  if (!detected) {
    return {
      detected: false,
      severity: null,
      performance_trend: Math.round(avgPerformance),
      alignment_trend: Math.round(avgAlignment),
      gap: Math.round(gap),
      weakest_values: [],
      window_days: windowDays,
    }
  }

  // notable: large gap AND clearly falling (not just low)
  const severity: 'mild' | 'notable' = (gap >= 35 && alignmentSlope < -0.5) ? 'notable' : 'mild'

  // ── Weakest values ─────────────────────────────────────────────
  const valueScoreMap: Record<string, number[]> = {}
  for (const vc of windowCheckins) {
    if (!valueScoreMap[vc.value_id]) valueScoreMap[vc.value_id] = []
    valueScoreMap[vc.value_id].push(vc.score)
  }
  const weakest = userValues
    .map(v => {
      const scores = valueScoreMap[v.id] || []
      const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null
      return { value_name: v.value_name, score: avg }
    })
    .filter(v => v.score != null)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map(v => ({ value_name: v.value_name, score: Math.round(v.score * 10) / 10 }))

  return {
    detected: true,
    severity,
    performance_trend: Math.round(avgPerformance),
    alignment_trend: Math.round(avgAlignment),
    gap: Math.round(gap),
    weakest_values: weakest,
    window_days: windowDays,
  }
}
