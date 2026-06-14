// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  monthPeriod,
  quarterPeriod,
  yearPeriod,
  generateMonthSummary,
  generateQuarterSummary,
  generateYearSummary,
  supabaseAdmin,
} from '@/lib/period-summary'

// Anon client — used only for user auth verification
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ── POST — generate a period summary ──────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { userId, periodType, date: dateStr } = await req.json()

    if (!userId || !periodType) {
      return NextResponse.json({ error: 'userId and periodType required' }, { status: 400 })
    }
    if (!['month', 'quarter', 'year'].includes(periodType)) {
      return NextResponse.json({ error: 'periodType must be month|quarter|year' }, { status: 400 })
    }

    // Auth — verify the caller owns this userId
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authUser || authUser.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const refDate = dateStr ? new Date(dateStr) : new Date()
    const period =
      periodType === 'month'   ? monthPeriod(refDate) :
      periodType === 'quarter' ? quarterPeriod(refDate) :
                                 yearPeriod(refDate)

    const { periodStart, periodEnd, label } = period

    const result =
      periodType === 'month'   ? await generateMonthSummary(userId, periodStart, periodEnd, label) :
      periodType === 'quarter' ? await generateQuarterSummary(userId, periodStart, periodEnd, label) :
                                 await generateYearSummary(userId, periodStart, periodEnd, label)

    return NextResponse.json({
      period: result.period,
      summary: result.summary,
      metrics: result.metrics,
      id: result.id,
    })
  } catch (error) {
    console.error('Period summary error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── GET — fetch existing summaries ────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId     = searchParams.get('userId')
  const periodType = searchParams.get('periodType')

  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !authUser || authUser.id !== userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let query = supabaseAdmin
    .from('period_summaries')
    .select('*')
    .eq('user_id', userId)
    .order('period_start', { ascending: false })
    .limit(12)

  if (periodType) query = query.eq('period_type', periodType)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ summaries: data || [] })
}
