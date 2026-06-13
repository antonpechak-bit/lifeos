// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

type Bucket = { label: string; start: string; end: string }

function buildBuckets(range: string): Bucket[] {
  const now = new Date()

  if (range === 'week') {
    const DAY = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(now, -(6 - i))
      return { label: DAY[d.getDay()], start: isoDate(d), end: isoDate(d) }
    })
  }

  if (range === 'month') {
    const M = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек']
    return Array.from({ length: 30 }, (_, i) => {
      const d = addDays(now, -(29 - i))
      const label = (i % 7 === 0 || i === 29) ? `${d.getDate()} ${M[d.getMonth()]}` : ''
      return { label, start: isoDate(d), end: isoDate(d) }
    })
  }

  if (range === 'quarter') {
    // 13 weekly buckets
    const base = addDays(now, -90)
    return Array.from({ length: 13 }, (_, i) => {
      const start = addDays(base, i * 7)
      const end   = addDays(start, 6)
      return { label: `Н${i + 1}`, start: isoDate(start), end: isoDate(end) }
    })
  }

  if (range === 'year') {
    const M = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']
    return Array.from({ length: 12 }, (_, i) => {
      const d     = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
      const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0)
      return { label: M[d.getMonth()], start: isoDate(d), end: isoDate(end) }
    })
  }

  return []
}

function avgOf(nums: (number | null)[]): number | null {
  const valid = nums.filter(n => n != null) as number[]
  return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  const range  = searchParams.get('range') || 'month'

  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
  if (!['week', 'month', 'quarter', 'year'].includes(range)) {
    return NextResponse.json({ error: 'invalid range' }, { status: 400 })
  }

  // Auth
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !authUser || authUser.id !== userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const buckets  = buildBuckets(range)
  const rangeStart = buckets[0].start
  const rangeEnd   = buckets[buckets.length - 1].end

  // Fetch all raw data for the range in parallel
  const [dailyRes, checkinsRes, valuesRes, valueCheckinsRes] = await Promise.all([
    supabaseAdmin
      .from('daily_logs')
      .select('date, wellbeing_index, energy, mood, meaning, connection, steps, workout')
      .eq('user_id', userId)
      .gte('date', rangeStart)
      .lte('date', rangeEnd),
    supabaseAdmin
      .from('checkins')
      .select('date, completed')
      .eq('user_id', userId)
      .gte('date', rangeStart)
      .lte('date', rangeEnd),
    supabaseAdmin
      .from('user_values')
      .select('id, value_name')
      .eq('user_id', userId)
      .order('created_at'),
    supabaseAdmin
      .from('value_checkins')
      .select('value_id, date, score')
      .eq('user_id', userId)
      .gte('date', rangeStart)
      .lte('date', rangeEnd),
  ])

  const dailyLogs    = dailyRes.data || []
  const checkins     = checkinsRes.data || []
  const userValues   = valuesRes.data || []
  const vcheckins    = valueCheckinsRes.data || []

  // Aggregate per bucket
  const wellbeing:  (number|null)[] = []
  const energy:     (number|null)[] = []
  const mood:       (number|null)[] = []
  const meaning:    (number|null)[] = []
  const connection: (number|null)[] = []
  const steps:      (number|null)[] = []
  const workouts:   number[]        = []
  const sprintDone: number[]        = []
  const sprintTotal:number[]        = []
  // value_scores[valueIndex][bucketIndex]
  const valueScores: (number|null)[][] = userValues.map(() => [])

  for (const bucket of buckets) {
    const dlInBucket    = dailyLogs.filter(r => r.date >= bucket.start && r.date <= bucket.end)
    const chInBucket    = checkins.filter(r => r.date >= bucket.start && r.date <= bucket.end)
    const vcInBucket    = vcheckins.filter(r => r.date >= bucket.start && r.date <= bucket.end)

    wellbeing.push(avgOf(dlInBucket.map(r => r.wellbeing_index ? parseFloat(r.wellbeing_index) : null)))
    energy.push(   avgOf(dlInBucket.map(r => r.energy ?? null)))
    mood.push(     avgOf(dlInBucket.map(r => r.mood ?? null)))
    meaning.push(  avgOf(dlInBucket.map(r => r.meaning ?? null)))
    connection.push(avgOf(dlInBucket.map(r => r.connection ?? null)))
    steps.push(    avgOf(dlInBucket.map(r => r.steps ? r.steps : null)))
    workouts.push( dlInBucket.filter(r => r.workout === true).length)
    sprintDone.push( chInBucket.filter(r => r.completed).length)
    sprintTotal.push(chInBucket.length)

    for (let vi = 0; vi < userValues.length; vi++) {
      const vc = vcInBucket.filter(r => r.value_id === userValues[vi].id)
      valueScores[vi].push(avgOf(vc.map(r => r.score)))
    }
  }

  return NextResponse.json({
    buckets,
    wellbeing,
    energy,
    mood,
    meaning,
    connection,
    steps,
    workouts,
    sprint_done:  sprintDone,
    sprint_total: sprintTotal,
    value_names:  userValues.map(v => v.value_name),
    value_scores: valueScores,
  })
}
