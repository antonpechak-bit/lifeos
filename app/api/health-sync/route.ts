// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ALLOWED_FIELDS = [
  'steps',
  'sleep_hours',
  'sleep_start',
  'sleep_end',
  'hrv',
  'resting_heart_rate',
  'active_calories',
  'weight',
  'workout_minutes',
  'workout_type',
  'workout_calories',
]

function authenticate(req: NextRequest): boolean {
  const key = req.headers.get('x-api-key')
  return !!key && key === process.env.HEALTH_SYNC_API_KEY
}

// Extract YYYY-MM-DD from Health Auto Export date strings like "2026-06-10 00:00:00 +0800"
function parseDate(dateStr: string): string | null {
  if (!dateStr) return null
  const m = dateStr.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

// Parse Health Auto Export body into per-date records for daily_logs
function parseHealthAutoExport(
  body: Record<string, unknown>,
  userId: string
): { rows: Record<string, unknown>[]; fieldsSaved: Record<string, string[]> } {
  // date -> partial daily_logs row
  const byDate: Record<string, Record<string, unknown>> = {}

  function getOrCreate(date: string) {
    if (!byDate[date]) byDate[date] = { user_id: userId, date }
    return byDate[date]
  }

  const metrics: unknown[] = (body.data as any)?.metrics ?? []
  for (const metric of metrics) {
    const { name, data: entries } = metric as any
    if (!Array.isArray(entries)) continue

    for (const entry of entries) {
      const date = parseDate(entry.date)
      if (!date) continue
      const row = getOrCreate(date)

      switch (name) {
        case 'step_count':
          // accumulate across multiple entries on same date
          row.steps = Math.round((Number(row.steps) || 0) + (Number(entry.qty) || 0))
          break
        case 'heart_rate_variability':
          // last value wins (or average if needed — use last for simplicity)
          if (entry.qty != null) row.hrv = Number(entry.qty)
          break
        case 'resting_heart_rate':
          if (entry.qty != null) row.resting_heart_rate = Number(entry.qty)
          break
        case 'sleep_analysis':
          if (entry.asleep != null) row.sleep_hours = Number(entry.asleep)
          if (entry.sleepStart) row.sleep_start = entry.sleepStart
          if (entry.sleepEnd)   row.sleep_end   = entry.sleepEnd
          break
        case 'active_energy_burned':
          row.active_calories = Math.round((Number(row.active_calories) || 0) + (Number(entry.qty) || 0))
          break
        case 'body_mass':
          if (entry.qty != null) row.weight = Number(entry.qty)
          break
      }
    }
  }

  const workouts: unknown[] = (body.data as any)?.workouts ?? []
  for (const workout of workouts) {
    const w = workout as any
    const date = parseDate(w.start)
    if (!date) continue
    const row = getOrCreate(date)

    const durationMins = Math.round((Number(w.duration) || 0) / 60)
    row.workout_minutes = (Number(row.workout_minutes) || 0) + durationMins

    const cals = Number(w.activeEnergyBurned?.qty ?? w.active_energy_burned?.qty ?? 0)
    row.workout_calories = Math.round((Number(row.workout_calories) || 0) + cals)

    // First workout name for the date wins
    if (!row.workout_type && w.name) row.workout_type = w.name
  }

  // Build field manifest per date
  const fieldsSaved: Record<string, string[]> = {}
  for (const [date, row] of Object.entries(byDate)) {
    fieldsSaved[date] = ALLOWED_FIELDS.filter(f => row[f] != null)
  }

  return { rows: Object.values(byDate), fieldsSaved }
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

  // ── Health Auto Export path ─────────────────────────────────────
  // Detected by: has data.metrics or data.workouts, user_id from query param
  const isHealthAutoExport =
    body.data != null &&
    (Array.isArray((body.data as any)?.metrics) || Array.isArray((body.data as any)?.workouts))

  if (isHealthAutoExport) {
    const userId = req.nextUrl.searchParams.get('user_id')
    if (!userId) {
      return NextResponse.json({ error: 'user_id query param required' }, { status: 400 })
    }

    const { rows, fieldsSaved } = parseHealthAutoExport(body, userId)

    if (rows.length === 0) {
      return NextResponse.json({ success: true, dates_processed: [], fields_saved: {} })
    }

    const { error } = await supabase
      .from('daily_logs')
      .upsert(rows, { onConflict: 'user_id,date' })

    if (error) {
      console.error('health-sync (HAE) upsert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const datesProcessed = rows.map(r => r.date as string).sort()
    return NextResponse.json({ success: true, dates_processed: datesProcessed, fields_saved: fieldsSaved })
  }

  // ── Legacy simple format ────────────────────────────────────────
  if (!authenticate(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { user_id, date } = body
  if (!user_id || !date) {
    return NextResponse.json({ error: 'user_id and date are required' }, { status: 400 })
  }

  const payload: Record<string, unknown> = { user_id, date }
  const fields_saved: string[] = []

  for (const field of ALLOWED_FIELDS) {
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
    console.error('health-sync upsert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, date, fields_saved })
}
