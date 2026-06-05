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

export async function GET() {
  return NextResponse.json({ status: 'ok' })
}

export async function POST(req: NextRequest) {
  if (!authenticate(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { user_id, date } = body
  if (!user_id || !date) {
    return NextResponse.json({ error: 'user_id and date are required' }, { status: 400 })
  }

  // Only pick the known health fields that were actually provided
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
