// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
// Numeric health sensor data only — no booleans, no metadata.
const HAE_NUMERIC_FIELDS = [
  'steps', 'sleep_hours', 'hrv', 'resting_heart_rate',
  'active_calories', 'workout_minutes', 'workout_calories',
  'vo2max', 'respiratory_rate',
] as const

const HAE_TEXT_FIELDS = ['workout_type'] as const

// Returns true only for values worth persisting.
// Rejects: null, undefined, false, empty string, NaN, and 0
// (HAE exports 0 for missing sensors — never a meaningful health value).
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

// Extract YYYY-MM-DD from HAE date strings like "2026-06-10 00:00:00 +0800"
function parseDate(dateStr: string): string | null {
  if (!dateStr) return null
  const m = dateStr.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

// Parse Health Auto Export body into per-date partial rows.
// Only sets a field if the raw value passes isRealValue().
function parseHealthAutoExport(
  body: Record<string, unknown>,
  userId: string
): Record<string, Record<string, unknown>> {
  const byDate: Record<string, Record<string, unknown>> = {}

  function get(date: string) {
    if (!byDate[date]) byDate[date] = {}
    return byDate[date]
  }

  const metrics: unknown[] = (body.data as any)?.metrics ?? []
  for (const metric of metrics) {
    const { name, data: entries } = metric as any
    if (!Array.isArray(entries)) continue

    for (const entry of entries) {
      const date = parseDate(entry.date)
      if (!date) continue
      const row = get(date)

      switch (name) {
        case 'step_count': {
          const v = Number(entry.qty)
          if (isRealValue(v)) row.steps = Math.round((Number(row.steps) || 0) + v)
          break
        }
        case 'heart_rate_variability': {
          const v = Number(entry.qty)
          if (isRealValue(v)) row.hrv = v
          break
        }
        case 'resting_heart_rate': {
          const v = Number(entry.qty)
          if (isRealValue(v)) row.resting_heart_rate = v
          break
        }
        case 'sleep_analysis': {
          const v = Number(entry.asleep)
          if (isRealValue(v)) row.sleep_hours = v
          break
        }
        case 'active_energy_burned': {
          const v = Number(entry.qty)
          if (isRealValue(v)) row.active_calories = Math.round((Number(row.active_calories) || 0) + v)
          break
        }
        case 'vo2_max': {
          const v = Number(entry.qty)
          if (isRealValue(v)) row.vo2max = v
          break
        }
        case 'respiratory_rate': {
          const v = Number(entry.qty)
          if (isRealValue(v)) row.respiratory_rate = v
          break
        }
        // body_mass intentionally omitted — not in HAE write set
      }
    }
  }

  const workouts: unknown[] = (body.data as any)?.workouts ?? []
  for (const workout of workouts) {
    const w = workout as any
    const date = parseDate(w.start)
    if (!date) continue
    const row = get(date)

    const mins = Math.round((Number(w.duration) || 0) / 60)
    if (isRealValue(mins)) row.workout_minutes = (Number(row.workout_minutes) || 0) + mins

    const cals = Math.round(Number(w.activeEnergyBurned?.qty ?? w.active_energy_burned?.qty ?? 0))
    if (isRealValue(cals)) row.workout_calories = (Number(row.workout_calories) || 0) + cals

    if (!row.workout_type && isRealValue(w.name)) row.workout_type = w.name
  }

  // Remove dates where nothing real was parsed
  for (const date of Object.keys(byDate)) {
    const fields = [...HAE_NUMERIC_FIELDS, ...HAE_TEXT_FIELDS].filter(f => byDate[date][f] !== undefined)
    if (fields.length === 0) delete byDate[date]
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
  } catch {
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

    // Fetch existing rows so we never overwrite good data with empty values
    const { data: existingRows } = await supabase
      .from('daily_logs')
      .select([...HAE_NUMERIC_FIELDS, ...HAE_TEXT_FIELDS, 'date'].join(', '))
      .eq('user_id', userId)
      .in('date', dates)

    const existingByDate: Record<string, Record<string, unknown>> = {}
    for (const row of existingRows ?? []) {
      existingByDate[row.date] = row
    }

    // Merge: existing row base + new real values on top
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
