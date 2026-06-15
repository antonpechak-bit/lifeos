// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { userId, weekStart, weekEnd } = await req.json()

    const authHeader = req.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authUser || authUser.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Load week data
    const { data: logs } = await supabase
      .from('daily_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('date', weekStart)
      .lte('date', weekEnd)
      .order('date')

    const { data: checkins } = await supabase
      .from('checkins')
      .select('*, sprints(behavior_name, layer)')
      .eq('user_id', userId)
      .gte('date', weekStart)
      .lte('date', weekEnd)

    const { data: stateMapData } = await supabase
      .from('sessions')
      .select('state_map')
      .eq('user_id', userId)
      .eq('completed', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!logs || logs.length === 0) {
      return NextResponse.json({ error: 'No data for this week' }, { status: 400 })
    }

    // Compute aggregates
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
    const energyVals = logs.filter(l => l.energy).map(l => l.energy)
    const moodVals = logs.filter(l => l.mood).map(l => l.mood)
    const meaningVals = logs.filter(l => l.meaning).map(l => l.meaning)
    const connectionVals = logs.filter(l => l.connection).map(l => l.connection)
    const anxietyVals = logs.filter(l => l.anxiety_level).map(l => l.anxiety_level)
    const wellbeingVals = logs.filter(l => l.wellbeing_index).map(l => parseFloat(l.wellbeing_index))

    const sprintDone = checkins?.filter(c => c.completed).length || 0
    const sprintTotal = checkins?.length || 0

    // Build data summary for AI (compact, ~300 tokens)
    const dataSummary = {
      period: `${weekStart} — ${weekEnd}`,
      days_logged: logs.length,
      sprint_completion: `${sprintDone}/${sprintTotal}`,
      avg_wellbeing: avg(wellbeingVals)?.toFixed(1),
      avg_energy: avg(energyVals)?.toFixed(1),
      avg_mood: avg(moodVals)?.toFixed(1),
      avg_meaning: avg(meaningVals)?.toFixed(1),
      avg_connection: avg(connectionVals)?.toFixed(1),
      avg_anxiety: avg(anxietyVals)?.toFixed(1),
      days_with_workout: logs.filter(l => l.workout).length,
      days_with_regulation: logs.filter(l => l.regulation_practice).length,
      daily: logs.map(l => ({
        date: l.date,
        energy: l.energy,
        mood: l.mood,
        meaning: l.meaning,
        connection: l.connection,
        anxiety: l.anxiety_level,
        workout: l.workout,
        regulation: l.regulation_practice,
        sleep: l.sleep_quality,
        wellbeing: l.wellbeing_index,
      }))
    }

    let response
    try {
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 800,
        system: `Ты аналитик данных благополучия. Анализируй данные недели и находи конкретные, полезные паттерны.

Твоя задача: найти 2-3 реальные корреляции и сформулировать actionable инсайты.

ПРАВИЛА:
— Конкретные цифры, не абстракции
— Если корреляция слабая или данных мало — честно скажи
— Тон: дружелюбный, прямой, без пафоса
— Не повторяй данные которые уже видны в графиках

ФОРМАТ ОТВЕТА (строго JSON):
{
  "top_correlation": "краткое главное наблюдение (1 предложение)",
  "biggest_barrier": "главное что мешало на этой неделе (1 предложение)",
  "next_focus": "один конкретный следующий шаг (1 предложение)",
  "insights": [
    {"title": "...", "body": "...", "type": "positive|neutral|warning"},
    {"title": "...", "body": "...", "type": "positive|neutral|warning"},
    {"title": "...", "body": "...", "type": "positive|neutral|warning"}
  ],
  "summary_text": "2-3 предложения общей картины недели"
}`,
        messages: [{
          role: 'user',
          content: `Данные недели:\n${JSON.stringify(dataSummary, null, 2)}\n\nState Map пользователя:\n${stateMapData?.state_map || 'Не указана'}`
        }]
      })
    } catch (aiError) {
      console.error('Anthropic API error:', aiError)
      return NextResponse.json(
        { error: 'ai_error', message: 'Не удалось получить инсайты от ИИ. Попробуйте снова.' },
        { status: 500 }
      )
    }

    const raw = response.content[0].type === 'text' ? response.content[0].text : '{}'
    let parsed
    try {
      const clean = raw.replace(/```json|```/g, '').trim()
      parsed = JSON.parse(clean)
    } catch {
      parsed = { summary_text: raw, insights: [], top_correlation: '', biggest_barrier: '', next_focus: '' }
    }

    // Save to weekly_summaries
    await supabase.from('weekly_summaries').upsert({
      user_id: userId,
      week_start: weekStart,
      week_end: weekEnd,
      sprint_completion_rate: sprintTotal > 0 ? sprintDone / sprintTotal : null,
      avg_energy: avg(energyVals),
      avg_mood: avg(moodVals),
      avg_meaning: avg(meaningVals),
      avg_connection: avg(connectionVals),
      avg_wellbeing: avg(wellbeingVals),
      avg_anxiety: avg(anxietyVals),
      top_correlation: parsed.top_correlation,
      biggest_barrier: parsed.biggest_barrier,
      next_focus: parsed.next_focus,
      summary_text: parsed.summary_text,
    }, { onConflict: 'user_id,week_start' })

    return NextResponse.json({
      aggregates: {
        avg_wellbeing: avg(wellbeingVals),
        avg_energy: avg(energyVals),
        avg_mood: avg(moodVals),
        avg_meaning: avg(meaningVals),
        avg_connection: avg(connectionVals),
        avg_anxiety: avg(anxietyVals),
        sprint_completion: sprintTotal > 0 ? sprintDone / sprintTotal : null,
        days_logged: logs.length,
      },
      insights: parsed,
      logs,
    })
  } catch (error) {
    console.error('Insights API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: 'Произошла ошибка при загрузке инсайтов. Попробуйте снова.' },
      { status: 500 }
    )
  }
}
