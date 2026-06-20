// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// Anon client — used only for JWT verification (respects RLS)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Service-role client — used only after identity is confirmed
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const SPRINT_SYSTEM = `Ты — компаньон Life OS для углублённой работы с конкретным приоритетом.

У тебя есть State Map человека — фоновый контекст для понимания того, кто перед тобой.
Твоя задача: углубиться в один выбранный приоритет, понять детали, и вместе договориться о конкретном шаге.

ФОКУС — ГЛАВНОЕ ПРАВИЛО:
Этот разговор строго о выбранном приоритете и его слое. Не выходи за его рамки.
State Map — фон для понимания человека в целом, а не список тем для обсуждения.
Не задавай вопросы про слои, которые не относятся к текущему приоритету.
Если замечаешь связь с другим слоем — можешь в одной фразе упомянуть, но не уводи туда разговор.
Layer Pulse (вопросы про «залежавшиеся» слои) — не здесь. Его место в ревью.

СТРУКТУРА РАЗГОВОРА:
1. Начни с 2–3 уточняющих вопросов строго по выбранному приоритету
   — что именно происходит сейчас
   — что уже пробовал
   — что мешает
2. На основе ответов предложи конкретное поведение из меню спринтов
   — маленькое (≤5 мин)
   — объясни почему именно это, исходя из того, что услышал
3. Вместе уточните детали — по одному за раз:
   — якорь (если нужен — см. ниже)
   — время (когда)
   — длительность: предложи ориентир исходя из уровня практики (micro → «давай 14 дней?», mini → «попробуем 21?», basic → «месяц — как тебе?»). Это предложение, не назначение. Человек может назвать другой срок или сказать «без срока» — принимай. Один вопрос за раз, не перечень.
4. Когда договорились — скажи: "Отлично. Записываю спринт."
   И сразу выведи в формате:

[SPRINT_START]
NAME: название поведения (коротко)
DESCRIPTION: что именно делать
ANCHOR: к чему привязываем (или «—» если якоря нет)
LAYER: sleep|nutrition|movement|ans|connection|attention|values
LEVEL: micro|mini|basic
DAYS: 14
CYCLE_DAYS:
[SPRINT_END]

Где:
— DAYS: согласованное число дней (например 14, 21, 7). Если человек выбрал «без срока» — оставь пустым.
— CYCLE_DAYS: заполняй ТОЛЬКО если нет активного цикла (указано ниже) И в разговоре прозвучал горизонт периода («на месяц», «на три недели»). Иначе — оставь пустым.

ЯКОРЬ — КОГДА И КАК:
Не все действия одинаковы. Смотри на тип, прежде чем предлагать якорь.

Повторяющееся поведение (то, что нужно делать регулярно — медитация, прогулка, дыхание, ритуал):
→ Якорь к существующему действию уместен. Предложи и коротко объясни зачем: новое легче приживается, когда цепляется к тому, что уже есть. «После завтрака», «перед сном» — конкретика помогает. Но это предложение, не требование.

Разовое действие (найти, выбрать, записаться, попробовать один раз, прочитать):
→ Якорь не нужен. Достаточно договориться о сроке: «в ближайшие 3 дня», «до конца недели».

Если человек говорит «ни к чему» / «без привязки» / «сам разберусь» — принять спокойно, не переспрашивать.

ПРАВИЛА:
— Один вопрос за раз
— Не навязывай — предлагай и спрашивай согласия
— Тон: тёплый, прямой, конкретный — гештальт, не коуч
— Не теория — практика
— Если человек хочет другое поведение — принимай и адаптируй
— Длительность — итог разговора, не умолчание

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

function parseDays(raw: string): number | null {
  if (!raw) return null
  const lower = raw.trim().toLowerCase()
  if (lower === '' || lower === 'null' || lower === 'none' || lower === '0' || lower === 'без срока') return null
  const n = parseInt(raw)
  return isNaN(n) || n <= 0 ? null : n
}

export async function POST(req: NextRequest) {
  try {
    const { messages, stateMap, priority, sessionId, userId: bodyUserId } = await req.json()

    // Verify identity against JWT — never trust userId from the request body alone
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // If caller provided a userId, it must match the token's subject
    if (bodyUserId && bodyUserId !== authUser.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = authUser.id

    // Check for active cycle before building prompt
    let activeCycle: any = null
    if (userId) {
      const { data } = await supabaseAdmin
        .from('cycles')
        .select('id, started_at, target_days')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      activeCycle = data
    }

    const cycleContext = activeCycle
      ? `ЦИКЛ: активен (начат ${activeCycle.started_at || '—'}${activeCycle.target_days ? `, ориентир ${activeCycle.target_days} дн.` : ''}). Новый спринт войдёт в этот цикл. Поле CYCLE_DAYS — не заполнять.`
      : `ЦИКЛ: нет активного цикла. Это начало нового периода. После того как договоришься о спринте и длительности — можно спросить про горизонт периода («на сколько в целом настраиваемся?»). Если человек назовёт срок — запиши в CYCLE_DAYS. Если нет — оставь пустым.`

    const systemWithContext = `${SPRINT_SYSTEM}

— — —
STATE MAP ПОЛЬЗОВАТЕЛЯ (фоновый контекст — для понимания человека, НЕ территория для вопросов):
${stateMap || 'Не указана'}

ФОКУС ЭТОГО РАЗГОВОРА — выбранный приоритет:
${priority || 'Не указан'}

${cycleContext}`

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

    if (reply.includes('[SPRINT_START]') && sessionId && userId) {
      const sprintRaw = reply.split('[SPRINT_START]')[1]?.split('[SPRINT_END]')[0]?.trim()
      if (sprintRaw) {
        const lines = sprintRaw.split('\n').map(l => l.trim()).filter(Boolean)
        const get = (key: string) => lines.find(l => l.startsWith(key + ':'))?.slice(key.length + 1).trim() ?? ''

        const target_days = parseDays(get('DAYS'))
        const cycle_days  = parseDays(get('CYCLE_DAYS'))

        const today  = new Date().toISOString().split('T')[0]
        const ends_at = target_days
          ? (() => { const d = new Date(); d.setDate(d.getDate() + target_days); return d.toISOString().split('T')[0] })()
          : null

        // Find or create active cycle
        let cycleId: string | null = activeCycle?.id || null

        if (!cycleId) {
          const { data: newCycle } = await supabaseAdmin
            .from('cycles')
            .insert({
              user_id: userId,
              status: 'active',
              started_at: today,
              target_days: cycle_days || null,
            })
            .select('id')
            .single()
          cycleId = newCycle?.id || null
        } else if (cycle_days && !activeCycle?.target_days) {
          // Update existing cycle target if not yet set
          await supabaseAdmin
            .from('cycles')
            .update({ target_days: cycle_days })
            .eq('id', cycleId)
            .is('target_days', null)
        }

        const { error: insertError } = await supabaseAdmin.from('sprints').insert({
          user_id: userId,
          session_id: sessionId,
          cycle_id: cycleId,
          layer: get('LAYER'),
          behavior_name: get('NAME'),
          behavior_description: get('DESCRIPTION'),
          anchor: get('ANCHOR'),
          level: get('LEVEL'),
          target_days,
          started_at: today,
          ends_at,
          status: 'active',
        })

        if (insertError) console.error('Sprint insert error:', insertError)
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
