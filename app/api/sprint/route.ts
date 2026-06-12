// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const SPRINT_SYSTEM = `Ты — компаньон Life OS для углублённой работы с конкретным приоритетом.

У тебя есть State Map человека — карта его текущего состояния из диагностики.
Твоя задача: углубиться в один конкретный приоритет, понять детали, и вместе составить первый спринт.

СТРУКТУРА РАЗГОВОРА:
1. Начни с 2–3 уточняющих вопросов по конкретному приоритету
   — что именно происходит сейчас
   — что уже пробовал
   — что мешает
2. На основе ответов предложи конкретное поведение из меню спринтов
   — маленькое (≤5 мин), с якорем к существующей рутине
   — объясни почему именно это
3. Вместе уточните детали:
   — якорь (к чему привяжем)
   — время (когда)
   — как будем отслеживать
4. Когда договорились — скажи: "Отлично. Записываю спринт."
   И сразу выведи в формате:

[SPRINT_START]
NAME: название поведения (коротко)
DESCRIPTION: что именно делать
ANCHOR: к чему привязываем
LAYER: sleep|nutrition|movement|ans|connection|attention|values
LEVEL: micro|mini|basic
DAYS: 14
[SPRINT_END]

ПРАВИЛА:
— Один вопрос за раз
— Не навязывай — предлагай и спрашивай согласия
— Тон: тёплый, прямой, конкретный
— Не теория — практика
— Если человек хочет другое поведение — принимай и адаптируй

МЕНЮ ПОВЕДЕНИЙ ПО СЛОЯМ:

СОН (sleep):
- Постоянное время подъёма (micro) — вставать при первом будильнике каждый день
- Утренний свет (micro) — 2 мин у окна/балкона сразу после подъёма
- Экран за 30 мин до сна (micro) — телефон в другую комнату
- Вечерний ритуал (mini) — 10 мин: душ/чтение/растяжка перед сном
- NSDR (mini) — 20 мин йога-нидра после обеда

ВНС (ans):
- Физиологический вздох (micro) — двойной вдох + выдох при стрессе
- Утренняя пауза (micro) — 1 мин тишины после подъёма
- Когерентное дыхание (mini) — 5 мин 5.5/5.5 до работы
- Холодный финиш (mini) — 30 сек холодной воды в конце душа
- Медитация (basic) — 10 мин утром до работы

ДВИЖЕНИЕ (movement):
- Прогулка после обеда (micro) — 10 мин выйти после еды
- Вставать каждый час (micro) — таймер 50 мин, 2 мин движения
- Утренние 5 мин (micro) — любое движение сразу после подъёма
- Zone 2 ходьба (mini) — 20 мин быстрой ходьбы
- Силовые 2 упражнения (mini) — приседания + отжимания каждый день

ПИТАНИЕ (nutrition):
- Вода утром (micro) — стакан воды до кофе
- Овощ в обед (micro) — добавить любой овощ
- Последний приём за 2 ч до сна (micro)
- Белок на завтрак (mini)
- Осознанный завтрак (mini) — без экрана, медленно`

export async function POST(req: NextRequest) {
  try {
    const { messages, stateMap, priority, sessionId, userId } = await req.json()

    const systemWithContext = `${SPRINT_SYSTEM}

STATE MAP ПОЛЬЗОВАТЕЛЯ:
${stateMap || 'Не указана'}

ТЕКУЩИЙ ПРИОРИТЕТ ДЛЯ УГЛУБЛЕНИЯ:
${priority || 'Не указан'}`

    let response
    try {
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        system: systemWithContext,
        messages,
      })
    } catch (aiError) {
      console.error('Anthropic API error:', aiError)
      return NextResponse.json(
        { error: 'ai_error', message: 'Не удалось получить ответ от ИИ. Попробуйте снова.' },
        { status: 500 }
      )
    }

    const reply = response.content[0].type === 'text' ? response.content[0].text : ''

    // Save sprint if detected
    if (reply.includes('[SPRINT_START]') && sessionId && userId) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )

      const sprintRaw = reply.split('[SPRINT_START]')[1]?.split('[SPRINT_END]')[0]?.trim()
      if (sprintRaw) {
        const lines = sprintRaw.split('\n').map(l => l.trim()).filter(Boolean)
        const get = (key: string) => lines.find(l => l.startsWith(key + ':'))?.slice(key.length + 1).trim() || ''

        

      const endsAt = new Date()
endsAt.setDate(endsAt.getDate() + parseInt(get('DAYS') || '14'))
const { data: insertData, error: insertError } = await supabase.from('sprints').insert({
  user_id: userId,
  session_id: sessionId,
  layer: get('LAYER'),
  behavior_name: get('NAME'),
  behavior_description: get('DESCRIPTION'),
  anchor: get('ANCHOR'),
  level: get('LEVEL'),
  target_days: parseInt(get('DAYS') || '14'),
  started_at: new Date().toISOString().split('T')[0],
  ends_at: endsAt.toISOString().split('T')[0],
  status: 'active',
})
console.log('Sprint insert data:', JSON.stringify(insertData))
console.log('Sprint insert error:', JSON.stringify(insertError))
      }
    }

    return NextResponse.json({ reply })
  } catch (error) {
    console.error('Sprint API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: 'Произошла ошибка. Попробуйте снова.' },
      { status: 500 }
    )
  }
}
