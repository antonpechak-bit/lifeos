// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── Body size note ───────────────────────────────────────────────
// Vercel's 4.5 MB request limit is a hard infrastructure ceiling —
// no route-segment config exists in App Router to raise it.
// The real fix is (a) server-side aggregation below so we only keep
// daily aggregates, and (b) setting Data Aggregation → "Days" in
// the Health Auto Export app so it pre-aggregates before sending.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Legacy simple-format allowed fields ──────────────────────────
const LEGACY_FIELDS = [
  'steps', 'sleep_hours', 'sleep_start', 'sleep_end',
  'hrv', 'resting_heart_rate', 'active_calories', 'weight',
  'workout_minutes', 'workout_type', 'workout_calories',
  'vo2max', 'respiratory_rate',
]

// ── Exact columns Health Auto Export may write ───────────────────
const HAE_NUMERIC_FIELDS = [
  'steps', 'sleep_hours', 'hrv', 'resting_heart_rate',
  'active_calories', 'workout_minutes', 'workout_calories',
  'vo2max', 'respiratory_rate',
] as const

const HAE_TEXT_FIELDS = ['workout_type'] as const

function isRealValue(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === '') return false
  if (typeof v === 'number') return !isNaN(v) && v > 0
  if (typeof v === 'string') return v.trim().length > 0
  return false
}

function authenticate(req: NextRequest): boolean {
  const key = req.headers.get('x-api-key')
  return !!key && key === process.env.HEALTH_SYNC_API_KEY
}

function parseDate(dateStr: string): string | null {
  if (!dateStr) return null
  const m = dateStr.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

// ── Per-day accumulators ─────────────────────────────────────────
// HAE sends hundreds of intraday samples (HRV every 5 min, etc).
// We accumulate sums+counts here, then finalise to a single row.

interface DayAcc {
  steps:              number
  sleep_hours:        number
  hrv_sum:            number;  hrv_n:              number
  rhr_sum:            number;  rhr_n:              number  // resting_heart_rate
  active_calories:    number
  vo2max:             number | null                         // max per day
  resp_sum:           number;  resp_n:             number  // respiratory_rate
  workout_minutes:    number
  workout_calories:   number
  workout_type:       string | null
}

function emptyAcc(): DayAcc {
  return {
    steps: 0, sleep_hours: 0,
    hrv_sum: 0, hrv_n: 0,
    rhr_sum: 0, rhr_n: 0,
    active_calories: 0,
    vo2max: null,
    resp_sum: 0, resp_n: 0,
    workout_minutes: 0, workout_calories: 0, workout_type: null,
  }
}

function finalise(acc: DayAcc): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (acc.steps             > 0)  row.steps             = acc.steps
  if (acc.sleep_hours       > 0)  row.sleep_hours       = Math.round(acc.sleep_hours * 100) / 100
  if (acc.hrv_n             > 0)  row.hrv               = Math.round(acc.hrv_sum / acc.hrv_n * 10) / 10
  if (acc.rhr_n             > 0)  row.resting_heart_rate= Math.round(acc.rhr_sum / acc.rhr_n * 10) / 10
  if (acc.active_calories   > 0)  row.active_calories   = Math.round(acc.active_calories)
  if (acc.vo2max            != null) row.vo2max          = acc.vo2max
  if (acc.resp_n            > 0)  row.respiratory_rate  = Math.round(acc.resp_sum / acc.resp_n * 10) / 10
  if (acc.workout_minutes   > 0)  row.workout_minutes   = acc.workout_minutes
  if (acc.workout_calories  > 0)  row.workout_calories  = Math.round(acc.workout_calories)
  if (acc.workout_type)           row.workout_type      = acc.workout_type
  return row
}

// ── Parse Health Auto Export body ────────────────────────────────
function parseHealthAutoExport(
  body: Record<string, unknown>,
  userId: string
): Record<string, Record<string, unknown>> {
  const accs: Record<string, DayAcc> = {}

  function acc(date: string): DayAcc {
    if (!accs[date]) accs[date] = emptyAcc()
    return accs[date]
  }

  const metrics: unknown[] = (body.data as any)?.metrics ?? []
  for (const metric of metrics) {
    const { name, data: entries } = metric as any
    if (!Array.isArray(entries)) continue

    for (const entry of entries) {
      const date = parseDate(entry.date)
      if (!date) continue
      const a = acc(date)

      switch (name) {
        case 'step_count': {
          const v = Number(entry.qty)
          if (isRealValue(v)) a.steps += v
          break
        }
        case 'heart_rate_variability': {
          const v = Number(entry.qty)
          if (isRealValue(v)) { a.hrv_sum += v; a.hrv_n++ }
          break
        }
        case 'resting_heart_rate': {
          const v = Number(entry.qty)
          if (isRealValue(v)) { a.rhr_sum += v; a.rhr_n++ }
          break
        }
        case 'sleep_analysis': {
          // 'asleep' is total hours in the sample; sum across samples for daily total
          const v = Number(entry.asleep)
          if (isRealValue(v)) a.sleep_hours += v
          break
        }
        case 'active_energy_burned': {
          const v = Number(entry.qty)
          if (isRealValue(v)) a.active_calories += v
          break
        }
        case 'vo2_max': {
          const v = Number(entry.qty)
          if (isRealValue(v)) a.vo2max = a.vo2max === null ? v : Math.max(a.vo2max, v)
          break
        }
        case 'respiratory_rate': {
          const v = Number(entry.qty)
          if (isRealValue(v)) { a.resp_sum += v; a.resp_n++ }
          break
        }
      }
    }
  }

  const workouts: unknown[] = (body.data as any)?.workouts ?? []
  for (const workout of workouts) {
    const w = workout as any
    const date = parseDate(w.start)
    if (!date) continue
    const a = acc(date)

    const mins = Math.round((Number(w.duration) || 0) / 60)
    if (isRealValue(mins)) a.workout_minutes += mins

    const cals = Math.round(Number(w.activeEnergyBurned?.qty ?? w.active_energy_burned?.qty ?? 0))
    if (isRealValue(cals)) a.workout_calories += cals

    if (!a.workout_type && isRealValue(w.name)) a.workout_type = w.name
  }

  // Finalise accumulators → per-date rows; drop empty dates
  const byDate: Record<string, Record<string, unknown>> = {}
  for (const [date, a] of Object.entries(accs)) {
    const row = finalise(a)
    const hasData = [...HAE_NUMERIC_FIELDS, ...HAE_TEXT_FIELDS].some(f => row[f] != null)
    if (hasData) byDate[date] = row
  }

  return byDate
}

export async function GET() {
  return NextResponse.json({ status: 'ok' })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch (e: any) {
    const msg = e?.message || ''
    if (msg.includes('too large') || msg.includes('413')) {
      return NextResponse.json(
        { error: 'Payload too large. Set Data Aggregation → Days in Health Auto Export settings.' },
        { status: 413 }
      )
    }
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // ── Health Auto Export path ──────────────────────────────────────
  const isHealthAutoExport =
    body.data != null &&
    (Array.isArray((body.data as any)?.metrics) || Array.isArray((body.data as any)?.workouts))

  if (isHealthAutoExport) {
    const userId = req.nextUrl.searchParams.get('user_id')
    if (!userId) {
      return NextResponse.json({ error: 'user_id query param required' }, { status: 400 })
    }

    const newByDate = parseHealthAutoExport(body, userId)
    const dates = Object.keys(newByDate)

    if (dates.length === 0) {
      return NextResponse.json({ success: true, dates_processed: [], fields_saved: {} })
    }

    // Fetch existing rows to avoid overwriting good data with empty values
    const { data: existingRows } = await supabase
      .from('daily_logs')
      .select([...HAE_NUMERIC_FIELDS, ...HAE_TEXT_FIELDS, 'date'].join(', '))
      .eq('user_id', userId)
      .in('date', dates)

    const existingByDate: Record<string, Record<string, unknown>> = {}
    for (const row of existingRows ?? []) {
      existingByDate[row.date] = row
    }

    // Merge: existing base + new real values on top
    const upsertRows: Record<string, unknown>[] = []
    const fieldsSaved: Record<string, string[]> = {}

    for (const date of dates) {
      const existing = existingByDate[date] ?? {}
      const incoming = newByDate[date]

      const merged: Record<string, unknown> = { user_id: userId, date }
      const written: string[] = []

      for (const field of HAE_NUMERIC_FIELDS) {
        if (isRealValue(incoming[field])) {
          merged[field] = incoming[field]
          written.push(field)
        } else if (isRealValue(existing[field])) {
          merged[field] = existing[field]
        }
      }
      for (const field of HAE_TEXT_FIELDS) {
        if (isRealValue(incoming[field])) {
          merged[field] = incoming[field]
          written.push(field)
        } else if (isRealValue(existing[field])) {
          merged[field] = existing[field]
        }
      }

      upsertRows.push(merged)
      fieldsSaved[date] = written
      console.log(`[health-sync] ${date} → writing: [${written.join(', ')}]`)
    }

    const { error } = await supabase
      .from('daily_logs')
      .upsert(upsertRows, { onConflict: 'user_id,date' })

    if (error) {
      console.error('[health-sync] upsert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      dates_processed: dates.sort(),
      fields_saved: fieldsSaved,
    })
  }

  // ── Legacy simple format ─────────────────────────────────────────
  if (!authenticate(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { user_id, date } = body
  if (!user_id || !date) {
    return NextResponse.json({ error: 'user_id and date are required' }, { status: 400 })
  }

  const payload: Record<string, unknown> = { user_id, date }
  const fields_saved: string[] = []

  for (const field of LEGACY_FIELDS) {
    if (body[field] !== undefined && body[field] !== null) {
      payload[field] = body[field]
      fields_saved.push(field)
    }
  }

  if (fields_saved.length === 0) {
    return NextResponse.json({ error: 'No valid health fields provided' }, { status: 400 })
  }

  const { error } = await supabase
    .from('daily_logs')
    .upsert(payload, { onConflict: 'user_id,date' })

  if (error) {
    console.error('[health-sync] legacy upsert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, date, fields_saved })
}
