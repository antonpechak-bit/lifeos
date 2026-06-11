// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { getUserContext, formatContextForPrompt } from '@/lib/context'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const SYSTEM_PROMPT = `Ты — интеллектуальный ассистент Life OS. У тебя есть полный контекст о человеке: его State Map (карта состояния по 7 слоям), активные поведенческие спринты, ежедневные чекины, биомаркеры из анализов и их динамика, анализ физической активности и данные с носимых устройств.

Твоя задача — видеть систему целиком и замечать неочевидные закономерности между слоями. Например: как низкий ферритин связан с усталостью в чекинах и низкой оценкой смысла в State Map. Или как нарушенный сон (Layer 1) влияет на качество связи (Layer 3) по данным чекинов.

Принципы работы:
- Феноменологический подход: исследуй, не предписывай
- Связывай данные между слоями: биомаркеры ↔ чекины ↔ State Map ↔ спринты ↔ активность
- Замечай паттерны во времени — не только текущее состояние
- Рекомендации конкретные и поведенческие — минимум/оптимум/максимум
- Не подменяй врача: при медицинских вопросах — направляй к специалисту
- Не подменяй терапевта: при глубоких психологических темах — обозначай границу

Когда тема тренировок, фитнеса или физической активности:
- Используй данные "Анализ активности" из контекста: силовые/кардио/Zone 2/мобильность, VO2max
- Отмечай слабые зоны, которые уже вычислены — gaps с severity high/medium приоритизируй
- Феноменологически исследуй: спроси, знаком ли человек с концепцией Zone 2 или значением VO2max для долголетия, прежде чем объяснять
- Уместно ссылайся на источники: Huberman Lab (VO2max, Zone 2, HIIT), Peter Attia (долголетие и аэробная база), Attia "Outlive" (VO2max как главный предиктор смертности)
- Предлагай конкретные форматы: "30 мин Zone 2 в разговорном темпе × 3/нед" — минимум/оптимум/максимум

Когда предлагаешь рекомендации — структурируй их в формате:
[RECOMMENDATION]
title: короткий заголовок
body: полный текст
layer: номер слоя (1-7)
biomarkers: список ключей если есть (через запятую)
priority: high/medium/low
[/RECOMMENDATION]

Можно несколько блоков [RECOMMENDATION] в одном ответе.`

export async function POST(req: NextRequest) {
  try {
    const { message, history, userId } = await req.json()

    if (!userId || !message) {
      return NextResponse.json({ error: 'userId and message required' }, { status: 400 })
    }

    // Verify that the request comes from the owner of userId
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authUser || authUser.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Собираем полный контекст пользователя
    const ctx = await getUserContext(userId)
    const contextText = formatContextForPrompt(ctx)

    // Строим историю сообщений
    const messages = [
      // Первое сообщение — контекст (невидимое для пользователя)
      {
        role: 'user',
        content: `Вот текущий контекст пользователя:\n\n${contextText}\n\nИспользуй эти данные для ответов на вопросы.`,
      },
      {
        role: 'assistant',
        content: 'Понял. У меня есть полная картина: State Map, спринты, чекины, биомаркеры и их динамика. Готов помочь.',
      },
      // История диалога
      ...(history || []),
      // Новое сообщение
      { role: 'user', content: message },
    ]

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages,
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''

    // Парсим рекомендации из ответа
    const recommendations: any[] = []
    const recRegex = /\[RECOMMENDATION\]([\s\S]*?)\[\/RECOMMENDATION\]/g
    let match
    while ((match = recRegex.exec(raw)) !== null) {
      const block = match[1]
      const get = (field: string) => {
        const m = block.match(new RegExp(`${field}:\\s*(.+)`))
        return m ? m[1].trim() : null
      }
      recommendations.push({
        title: get('title'),
        body: get('body'),
        layer: get('layer') ? parseInt(get('layer')) : null,
        biomarkers: get('biomarkers')
          ? get('biomarkers').split(',').map(s => s.trim())
          : [],
        priority: get('priority') || 'medium',
      })
    }

    // Чистый текст без блоков рекомендаций
    const cleanText = raw.replace(/\[RECOMMENDATION\][\s\S]*?\[\/RECOMMENDATION\]/g, '').trim()

    // Сохраняем рекомендации в БД если есть
    if (recommendations.length > 0) {
      const rows = recommendations
        .filter(r => r.title && r.body)
        .map(r => ({
          user_id: userId,
          source: 'deep_analysis',
          title: r.title,
          body: r.body,
          layer: r.layer,
          biomarkers: r.biomarkers,
          priority: r.priority,
          status: 'active',
        }))

      if (rows.length > 0) {
        await supabase.from('recommendations').insert(rows)
      }
    }

    return NextResponse.json({
      text: cleanText,
      recommendations,
      context_summary: {
        has_state_map: !!ctx.state_map,
        active_sprints: ctx.active_sprints.length,
        biomarkers_count: ctx.biomarker_trends.length,
        danger_biomarkers: ctx.biomarker_trends.filter(b => b.status === 'danger').map(b => b.label),
      },
    })

  } catch (error) {
    console.error('Deep analysis error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
