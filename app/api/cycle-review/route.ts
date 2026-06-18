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

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const LAYER_NAMES: Record<number, string> = {
  1: 'Телесная основа',
  2: 'Безопасность / ВНС',
  3: 'Связь',
  4: 'Внимание',
  5: 'Ценности',
  6: 'Смысл',
  7: 'Трансценденция',
}

// Numeric insight layer → sprint layer strings
const INSIGHT_LAYER_TO_SPRINT: Record<number, string[]> = {
  1: ['sleep', 'nutrition', 'movement'],
  2: ['ans'],
  3: ['connection'],
  4: ['attention'],
  5: ['values'],
  6: ['values'],
}

function findSprintByLayer(sprints: any[], layerNum: number): any | null {
  const candidates = INSIGHT_LAYER_TO_SPRINT[layerNum] || []
  return sprints.find(sp => candidates.includes(sp.layer)) || null
}

function buildCycleSystemPrompt(
  sprints: any[],
  checkinsBySprintId: Record<string, any[]>,
  dailyLogsByDate: Record<string, any>,
  ctx: any
): string {
  const now = new Date()

  // Stale layer pulse
  const staleLayers = (ctx.layer_statuses || []).filter((ls: any) => {
    if (ls.status !== 'stable') return false
    if (!ls.last_checked) return true
    const days = Math.round((now.getTime() - new Date(ls.last_checked).getTime()) / 86400000)
    return days > 30
  })
  const layerPulse = staleLayers.length > 0
    ? `\n\nLAYER PULSE: Слои, давно не проверявшиеся (>30 дней или никогда): ${staleLayers.map((ls: any) => `Слой ${ls.layer} (${LAYER_NAMES[ls.layer] || ''})`).join(', ')}. Органично вплети ОДИН вопрос об одном из них — мягко, как продолжение разговора.`
    : ''

  // Sprint summaries
  const sprintLines = sprints.map((sp, idx) => {
    const checkins = checkinsBySprintId[sp.id] || []
    const done  = checkins.filter(c => c.completed).length
    const total = checkins.length
    const pct   = total > 0 ? Math.round(done / total * 100) : 0
    const elapsed = Math.max(1, Math.ceil((now.getTime() - new Date(sp.started_at || sp.created_at).getTime()) / 86400000))
    const target  = sp.target_days || 14
    return `[${idx}] «${sp.behavior_name}» · ${sp.layer || '—'} · день ${elapsed}/${target} · выполнено ${done}/${total} (${pct}%)`
  }).join('\n')

  // Collect all unique dates from checkins (last 21 days)
  const allDates = new Set<string>()
  for (const checkins of Object.values(checkinsBySprintId)) {
    for (const c of checkins) allDates.add(c.date)
  }
  const sortedDates = [...allDates].sort().reverse().slice(0, 21)

  const dayLines = sortedDates.map(date => {
    const marks = sprints.map((sp, idx) => {
      const c = (checkinsBySprintId[sp.id] || []).find((x: any) => x.date === date)
      if (!c) return `[${idx}]—`
      return `[${idx}]${c.completed ? '✓' : '✗'}`
    }).join(' ')

    const dl = dailyLogsByDate[date]
    const wb = dl
      ? `energy ${dl.energy ?? '—'}, mood ${dl.mood ?? '—'}, meaning ${dl.meaning ?? '—'}, connection ${dl.connection ?? '—'}`
      : '—'
    return `${date}: ${marks} | ${wb}`
  }).join('\n')

  // Notes from checkins
  const notesLines: string[] = []
  for (const [sprintId, checkins] of Object.entries(checkinsBySprintId)) {
    const idx = sprints.findIndex(sp => sp.id === sprintId)
    for (const c of checkins) {
      if (c.note && String(c.note).trim()) {
        notesLines.push(`[${idx}] ${c.date}: «${c.note}»`)
      }
    }
  }
  const notesSummary = notesLines.length > 0
    ? `\n\nЗАМЕТКИ ИЗ ЧЕКИНОВ:\n${notesLines.slice(-15).join('\n')}`
    : ''

  return `Ты — живой свидетель, ведущий разговор об итогах цикла практик. Твой язык — русский. Стиль — феноменологический, гештальтный: замечаешь и отражаешь, не предписываешь и не оцениваешь.

АКТИВНЫЕ СПРИНТЫ (индекс 0…${sprints.length - 1}):
${sprintLines}

ДИНАМИКА ПО ДНЯМ (последние 21 день):
${dayLines || 'Нет данных'}${notesSummary}

КАК ВЕСТИ РАЗГОВОР:
1. Открой беседу — отрази цикл целостно: паттерны, связи между практиками, что замечаешь в данных.
2. Можешь замечать стыки: «В те дни, когда [0] держался, [1] тоже шёл» — если видишь такое.
3. Задай 1-2 открытых вопроса, приглашающих к осмыслению периода.
4. Слушай, отражай, не делай выводов раньше человека.
5. Будь краток: 2-4 абзаца за ответ, без заголовков и списков.${layerPulse}

КОГДА ПОДВОДИТЬ ИТОГИ (после 4-6 обменов, или когда человек даёт понять, что готов завершить):
Выведи 1-4 наблюдения. Каждый блок — с новой строки:

[INSIGHT layer=N category=pattern|value|meaning_theme|barrier|strength|open_question sprint_idx=N]
текст наблюдения — одно-два предложения
[/INSIGHT]

Где sprint_idx — индекс спринта из списка выше (0,1,...), или sprint_idx=all для инсайтов, касающихся всего цикла. layer=0 если слой не определён.

Если разговор прояснил статус слоя:
[LAYER_UPDATE layer=N status=stable|stabilizing|in_progress|not_started]
краткие заметки (опционально)
[/LAYER_UPDATE]

Эти теги обрабатываются автоматически и скрываются от пользователя. После тегов — тёплое короткое слово.

ОГРАНИЧЕНИЯ:
- Не предлагай план, если не спросили
- Не оценивай («молодец/плохо»)
- Не называй по имени`
}

function parseCycleInsights(text: string, sprints: any[]) {
  const results: { layer: number | null, category: string | null, content: string, related_sprint_id: string | null }[] = []
  const re = /\[INSIGHT(?:\s+layer=(\d+))?(?:\s+category=([\w|]+))?(?:\s+sprint_idx=(\d+|all))?\]([\s\S]*?)\[\/INSIGHT\]/g
  let m
  while ((m = re.exec(text)) !== null) {
    const sprintIdxRaw = m[3]
    let related_sprint_id: string | null = null

    if (sprintIdxRaw && sprintIdxRaw !== 'all') {
      const idx = parseInt(sprintIdxRaw)
      related_sprint_id = sprints[idx]?.id || null
    } else if (!sprintIdxRaw) {
      const layerNum = m[1] ? parseInt(m[1]) : null
      if (layerNum !== null && layerNum > 0) {
        related_sprint_id = findSprintByLayer(sprints, layerNum)?.id || null
      }
    }

    results.push({
      layer: m[1] ? parseInt(m[1]) : null,
      category: m[2]?.split('|')[0] || null,
      content: m[4].trim(),
      related_sprint_id,
    })
  }
  return results
}

function parseLayerUpdates(text: string) {
  const results: { layer: number, status: string, notes: string | null }[] = []
  const re = /\[LAYER_UPDATE\s+layer=(\d+)\s+status=([\w_]+)\]([\s\S]*?)\[\/LAYER_UPDATE\]/g
  let m
  while ((m = re.exec(text)) !== null) {
    results.push({ layer: parseInt(m[1]), status: m[2], notes: m[3].trim() || null })
  }
  return results
}

function stripTags(text: string): string {
  return text
    .replace(/\[INSIGHT(?:[^\]]*)\][\s\S]*?\[\/INSIGHT\]/g, '')
    .replace(/\[LAYER_UPDATE(?:[^\]]*)\][\s\S]*?\[\/LAYER_UPDATE\]/g, '')
    .trim()
}

export async function POST(req: NextRequest) {
  try {
    const { userId, messages: msgHistory } = await req.json()

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    const authHeader = req.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authUser || authUser.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Load active sprints
    const { data: sprints } = await supabaseAdmin
      .from('sprints')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at')

    if (!sprints || sprints.length === 0) {
      return NextResponse.json({ error: 'No active sprints' }, { status: 400 })
    }

    // Load checkins for each sprint + daily_logs + full context in parallel
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10)

    const [checkinsResults, dailyLogsRes, ctx] = await Promise.all([
      Promise.all(
        sprints.map(sp =>
          supabaseAdmin
            .from('checkins')
            .select('date, completed, note')
            .eq('user_id', userId)
            .eq('sprint_id', sp.id)
            .order('date')
        )
      ),
      supabaseAdmin
        .from('daily_logs')
        .select('date, energy, mood, meaning, connection')
        .eq('user_id', userId)
        .gte('date', thirtyDaysAgoStr)
        .order('date'),
      getUserContext(userId),
    ])

    const checkinsBySprintId: Record<string, any[]> = {}
    for (let i = 0; i < sprints.length; i++) {
      checkinsBySprintId[sprints[i].id] = checkinsResults[i].data || []
    }

    const dailyLogsByDate: Record<string, any> = {}
    for (const d of dailyLogsRes.data || []) {
      dailyLogsByDate[d.date] = d
    }

    const contextText  = formatContextForPrompt(ctx)
    const systemPrompt = buildCycleSystemPrompt(sprints, checkinsBySprintId, dailyLogsByDate, ctx)

    const isOpening = !msgHistory || msgHistory.length === 0
    const messages = [
      {
        role: 'user',
        content: `Контекст пользователя:\n\n${contextText}\n\nИспользуй как фон для разговора об итогах цикла.`,
      },
      {
        role: 'assistant',
        content: 'Понял. Картина цикла и общий контекст передо мной. Начинаю.',
      },
      ...(msgHistory || []),
      ...(isOpening ? [{ role: 'user', content: 'Начни разговор.' }] : []),
    ]

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      system: systemPrompt,
      messages,
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    const insights     = parseCycleInsights(raw, sprints)
    const layerUpdates = parseLayerUpdates(raw)
    const cleanText    = stripTags(raw)

    // Persist insights
    let savedInsights: any[] = []
    if (insights.length > 0) {
      const rows = insights
        .filter(ins => ins.content)
        .map(ins => ({
          user_id: userId,
          source: 'cycle_reflection',
          layer: ins.layer === 0 ? null : ins.layer,
          category: ins.category,
          content: ins.content,
          related_sprint_id: ins.related_sprint_id,
          status: 'active',
        }))
      if (rows.length > 0) {
        const { data } = await supabaseAdmin.from('client_insights').insert(rows).select()
        savedInsights = data || []
      }
    }

    // Upsert layer statuses
    for (const update of layerUpdates) {
      await supabaseAdmin
        .from('layer_status')
        .upsert(
          {
            user_id: userId,
            layer: update.layer,
            status: update.status,
            notes: update.notes,
            last_checked: new Date().toISOString(),
          },
          { onConflict: 'user_id,layer' }
        )
    }

    return NextResponse.json({
      text: cleanText,
      insights_saved: savedInsights.length > 0,
      insights_count: savedInsights.length,
      insights: savedInsights,
      layer_updates: layerUpdates,
      sprint_count: sprints.length,
    })
  } catch (error: any) {
    console.error('Cycle review error — name:', error?.name, '| message:', error?.message, '| stack:', error?.stack)
    return NextResponse.json({ error: 'Internal server error', details: error?.message }, { status: 500 })
  }
}
