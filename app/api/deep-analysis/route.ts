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

const STATE_NOW_PROMPT = `Ты — внимательный собеседник Life OS в режиме «состояние сейчас».

Контекст уже загружен: State Map, layer_status, чекины, спринты, ценности, накопленные инсайты. Твоя задача — провести живой разговор о том, как человек ощущает себя ПРЯМО СЕЙЧАС — по слоям, которые уже есть в карте. Не диагностика с нуля, не переделка карты — исследование текущего момента в её контексте.

КАК ВЕСТИ РАЗГОВОР:
— Начни сам: один тёплый открытый вопрос о текущем состоянии — без длинных вступлений, сразу живо
— Двигайся органично: следуй за тем, что звучит в ответах, а не по номерам слоёв механически
— Слои с напряжением в layer_status (moderate/severe) — приоритет для исследования, но не называй их номерами вслух
— Один вопрос за раз. Феноменологически: «как оно?», «что сейчас?», «что замечаешь?»
— Когда уместно — мягко соотноси с картой: «в прошлый раз у тебя было X — как сейчас с этим?»

ЧЕГО НЕ ДЕЛАТЬ:
— Не переделывать State Map, не проводить диагностику с нуля — карта уже есть, она фон
— Не давать советов и рекомендаций — только исследование и присутствие
— Не ставить диагнозов, не интерпретировать паттерны вслух как факт
— Не задавать два вопроса подряд

ТОН: тёплый, присутствующий. Как сессия поддержки в контексте карты — не анализ, не коучинг. Гештальт-тон: что есть прямо сейчас.

ЭПИСТЕМИЧЕСКАЯ КАЛИБРОВКА: если что-то замечаешь — «похоже», «как будто», «возможно» — не утверждай как факт.

Если в разговоре всплывает что-то важное и новое — можешь мягко назвать это вслух («это звучит значимо»), но не формализуй в карту.`

const GUIDED_CHECKIN_PROMPT = `Ты — внимательный собеседник Life OS в режиме «разговор о состоянии».

У тебя есть контекст человека: его State Map, чекины, спринты, ценности. Сейчас ты ведёшь разговор — сам инициируешь, сам задаёшь вопросы, исследуешь как человек сейчас.

КАК ВЕСТИ РАЗГОВОР:
— Начни сам: один открытый вопрос о текущем состоянии — без вступлений, сразу живой вопрос
— Двигайся по слоям органично (тело → нервная система → связь → смысл) — по тому что звучит в ответах, не механически
— Один вопрос за раз. Феноменологически: «как оно?», «что замечаешь?» — не «почему», не «что делать»
— Можешь мягко соотносить с тем что уже в карте: «в прошлый раз ты отмечал X — как сейчас?»

ЧЕГО НЕ ДЕЛАТЬ:
— Не переделывать и не обновлять State Map
— Не давать советов и рекомендаций — это разговор, не анализ
— Не ставить диагнозов, не интерпретировать паттерны вслух
— Не задавать два вопроса подряд

ТОН: тёплый, внимательный, любопытный. Не терапевт, не коуч — собеседник, который видит человека и спрашивает.

ЭПИСТЕМИЧЕСКАЯ КАЛИБРОВКА: если что-то замечаешь — «похоже», «как будто», «возможно» — не утверждай как факт.

Если в разговоре всплывает что-то важное — можешь мягко назвать это вслух («это звучит как что-то значимое»), но не формализуй в карту.`

const SYSTEM_PROMPT = `Ты — интеллектуальный ассистент Life OS. У тебя есть полный контекст о человеке: его State Map (карта состояния по 7 слоям), активные поведенческие спринты, ежедневные чекины, биомаркеры из анализов и их динамика, анализ физической активности и данные с носимых устройств.

Твоя задача — видеть систему целиком и замечать неочевидные закономерности между слоями. Например: как низкий ферритин связан с усталостью в чекинах и низкой оценкой смысла в State Map. Или как нарушенный сон (Layer 1) влияет на качество связи (Layer 3) по данным чекинов.

Принципы работы:
- Феноменологический подход: исследуй, не предписывай
- Связывай данные между слоями: биомаркеры ↔ чекины ↔ State Map ↔ спринты ↔ активность
- Замечай паттерны во времени — не только текущее состояние
- Рекомендации конкретные и поведенческие — минимум/оптимум/максимум
- Не подменяй врача: при медицинских вопросах — направляй к специалисту
- Не подменяй терапевта: при глубоких психологических темах — обозначай границу

Когда обсуждаешь биомаркеры (холестерин, давление, щитовидная железа, глюкоза, ферритин, гормоны и др.):
- Никогда не утверждай прямую причинно-следственную связь между образом жизни и конкретным биомаркером — запрещены фразы вроде "это прямое отражение", "это из-за", "причина в том, что ты"
- Всегда признавай многофакторность: генетика (например, семейная гиперхолестеринемия), питание, стресс, медикаменты, сопутствующие состояния — всё это может влиять независимо от образа жизни
- Используй смягчённый язык: "может быть связано с", "один из возможных факторов", "стоит рассмотреть в совокупности с врачом"
- Феноменологически: предложи исследовать возможные факторы, не диагностируй причину — это задача врача
- Если человек не обследовался у врача по данному биомаркеру — явно рекомендуй это сделать

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

Можно несколько блоков [RECOMMENDATION] в одном ответе.

Накопленные наблюдения (client_insights) и статус по слоям (layer_status) — это долгосрочная память системы о человеке. Используй их как фон: замечай, если текущий вопрос или данные перекликаются с уже зафиксированными паттернами, и ссылайся на них по необходимости. client_insights доступны только для чтения в этом контексте — запись новых наблюдений происходит отдельно (Session C, не здесь).`

export async function POST(req: NextRequest) {
  try {
    const { message, history, userId, mode } = await req.json()
    const isGuidedCheckin = mode === 'guided_checkin'
    const isStateNow = mode === 'state_now'

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
    const isInit = (isGuidedCheckin && message === '[GUIDED_CHECKIN_INIT]') || (isStateNow && message === '[STATE_NOW_INIT]')
    const messages = [
      // Контекст — невидимый для пользователя
      {
        role: 'user',
        content: `Вот текущий контекст пользователя:\n\n${contextText}\n\nИспользуй эти данные в разговоре.`,
      },
      {
        role: 'assistant',
        content: (isGuidedCheckin || isStateNow)
          ? 'Контекст загружен. Начинаю разговор.'
          : 'Понял. У меня есть полная картина: State Map, спринты, чекины, биомаркеры и их динамика. Готов помочь.',
      },
      // Для guided init — просим AI задать первый вопрос; иначе — обычная история + новый вопрос
      ...(isInit
        ? [{ role: 'user', content: 'Начни разговор.' }]
        : [...(history || []), { role: 'user', content: message }]
      ),
    ]

    const systemPrompt = isGuidedCheckin
      ? GUIDED_CHECKIN_PROMPT
      : isStateNow
        ? STATE_NOW_PROMPT
        : SYSTEM_PROMPT

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      system: systemPrompt,
      messages,
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''

    // Guided / state_now — нет рекомендаций, возвращаем чистый текст
    if (isGuidedCheckin || isStateNow) {
      return NextResponse.json({ text: raw, recommendations: [], context_summary: {
        has_state_map: !!ctx.state_map,
        active_sprints: ctx.active_sprints.length,
        biomarkers_count: ctx.biomarker_trends.length,
        danger_biomarkers: ctx.biomarker_trends.filter(b => b.status === 'danger').map(b => b.label),
      }})
    }

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
