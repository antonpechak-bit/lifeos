// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { getUserContext } from '@/lib/context'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function generateDriftText(
  weakestValues: { value_name: string; score: number }[],
  gap: number,
  windowDays: number,
): Promise<{ observation: string; question: string }> {
  const names = weakestValues.map(v => v.value_name).join(', ')

  // Fallback templates in case Claude call fails
  const fallbackObs = `Тело и активность держатся. Но последние ${windowDays} дней дрейфуют от того, что важно${names ? ` — особенно ${names}` : ''}.`
  const fallbackQ = names
    ? `Что сейчас происходит с ${weakestValues[0].value_name}? Что ты замечаешь?`
    : 'Что сейчас забирает пространство у того, что важно?'

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: `Ты — феноменологический наблюдатель. Замечаешь паттерны — не ставишь диагнозы, не даёшь советов. Пишешь по-русски. Тон мягкий, не тревожный, не директивный. Строго: первая строка — наблюдение (1-2 предложения), вторая строка — один открытый вопрос в гештальт-духе. Никакого «ты должен», «тебе нужно», «у тебя выгорание». Только — замечаю и спрашиваю.`,
      messages: [{
        role: 'user',
        content: `Физическое состояние и активность стабильны (${100 - gap}/100). Но ценностный alignment последние ${windowDays} дней проседает (разрыв ${gap} пп). Слабее всего: ${names || 'связь и смысл'}. Напиши наблюдение + вопрос.`,
      }],
    })

    const text = msg.content[0]?.text?.trim() || ''
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

    return {
      observation: lines[0] || fallbackObs,
      question: lines[1] || fallbackQ,
    }
  } catch {
    return { observation: fallbackObs, question: fallbackQ }
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }

  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !authUser || authUser.id !== userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const ctx = await getUserContext(userId)
    const signal = ctx.drift_signal

    if (!signal?.detected) {
      return NextResponse.json({ detected: false })
    }

    const { observation, question } = await generateDriftText(
      signal.weakest_values,
      signal.gap,
      signal.window_days,
    )

    return NextResponse.json({ ...signal, observation, question })
  } catch (e) {
    console.error('Drift API error:', e)
    return NextResponse.json({ detected: false })
  }
}
