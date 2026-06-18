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

function buildSystemPrompt(sprint: any, checkins: any[], ctx: any): string {
  const now = new Date()

  // Layers with status=stable and last_checked > 30 days ago (or never)
  const staleLayers = (ctx.layer_statuses || []).filter((ls: any) => {
    if (ls.status !== 'stable') return false
    if (!ls.last_checked) return true
    const days = Math.round((now.getTime() - new Date(ls.last_checked).getTime()) / 86400000)
    return days > 30
  })

  const layerPulse = staleLayers.length > 0
    ? `\n\nLAYER PULSE: Слои, которые давно не проверялись (статус 'stable', >30 дней или никогда): ${staleLayers.map((ls: any) => `Слой ${ls.layer} (${LAYER_NAMES[ls.layer] || ''})`).join(', ')}. В ходе разговора органично вплети ОДИН вопрос об одном из этих слоёв — мягко, как естественное продолжение, не как анкету.`
    : ''

  const completedCount = checkins.filter(c => c.completed).length
  const totalCount = checkins.length
  const pct = totalCount > 0 ? Math.round(completedCount / totalCount * 100) : 0

  const notesLines = checkins
    .filter(c => c.notes && String(c.notes).trim())
    .slice(-10)
    .map(c => `  • ${c.date}: «${c.notes}»`)
    .join('\n')

  const checkinSummary = totalCount > 0
    ? `Чекинов в спринте: ${totalCount}. Выполнено: ${completedCount} (${pct}%).${notesLines ? `\n\nЗаметки из чекинов:\n${notesLines}` : '\n\nЗаметки не оставлялись.'}`
    : 'Чекинов в этом спринте ещё нет.'

  return `Ты — живой свидетель, присутствующий в разговоре о завершённом спринте. Твой язык — русский. Твой стиль — феноменологический, гештальтный: замечаешь и отражаешь, не предписываешь и не оцениваешь.

Спринт: «${sprint.behavior_name}»
Слой: ${sprint.layer_name || 'не указан'} · Уровень: ${sprint.level ?? '—'} · Длительность: ${sprint.target_days || '—'} дней

${checkinSummary}

КАК ВЕСТИ РАЗГОВОР:
1. Открой беседу — отрази паттерн выполнения: что было последовательным, что колебалось, что говорят заметки. Не оценивай — только живое феноменологическое наблюдение.
2. Задай 1-2 открытых вопроса, приглашающих к исследованию, — не допрашивай и не требуй отчёта.
3. Слушай ответы: отражай сказанное, замечай смыслы, не делай выводов раньше человека.
4. Будь краток: 2-4 абзаца за ответ, без заголовков и списков.${layerPulse}

КОГДА ПОДВОДИТЬ ИТОГИ (после 4-6 обменов, или когда человек даёт понять, что готов завершить):
Выведи 1-3 наблюдения в формате — каждый блок начинается с новой строки:

[INSIGHT layer=N category=pattern|value|meaning_theme|barrier|strength|open_question]
текст наблюдения — одно-два предложения
[/INSIGHT]

Где N — номер слоя (1-7). Если слой не определён, используй layer=0.

Если разговор прояснил статус какого-то слоя, добавь:
[LAYER_UPDATE layer=N status=stable|stabilizing|in_progress|not_started]
краткие заметки (опционально, одна строка)
[/LAYER_UPDATE]

Эти теги система обрабатывает автоматически и скрывает от пользователя. После тегов добавь тёплое закрывающее слово — короткое, без формализма.

ОГРАНИЧЕНИЯ:
- Не предлагай план действий, если не спросили
- Не давай советов, если не попросили
- Не называй человека по имени, если оно неизвестно`
}

function parseInsights(text: string) {
  const results: { layer: number | null, category: string | null, content: string }[] = []
  const re = /\[INSIGHT(?:\s+layer=(\d+))?(?:\s+category=([\w|]+))?\]([\s\S]*?)\[\/INSIGHT\]/g
  let m
  while ((m = re.exec(text)) !== null) {
    results.push({
      layer: m[1] ? parseInt(m[1]) : null,
      category: m[2]?.split('|')[0] || null,
      content: m[3].trim(),
    })
  }
  return results
}

function parseLayerUpdates(text: string) {
  const results: { layer: number, status: string, notes: string | null }[] = []
  const re = /\[LAYER_UPDATE\s+layer=(\d+)\s+status=([\w_]+)\]([\s\S]*?)\[\/LAYER_UPDATE\]/g
  let m
  while ((m = re.exec(text)) !== null) {
    results.push({
      layer: parseInt(m[1]),
      status: m[2],
      notes: m[3].trim() || null,
    })
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
    const { userId, sprintId, messages: msgHistory } = await req.json()

    if (!userId || !sprintId) {
      return NextResponse.json({ error: 'userId and sprintId required' }, { status: 400 })
    }

    // Auth: validate token matches userId (same pattern as deep-analysis)
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authUser || authUser.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch sprint + checkins + full context in parallel
    const [sprintRes, checkinsRes, ctx] = await Promise.all([
      supabaseAdmin
        .from('sprints')
        .select('*')
        .eq('id', sprintId)
        .eq('user_id', userId)
        .single(),
      supabaseAdmin
        .from('checkins')
        .select('*')
        .eq('user_id', userId)
        .eq('sprint_id', sprintId)
        .order('date', { ascending: true }),
      getUserContext(userId),
    ])

    if (sprintRes.error || !sprintRes.data) {
      return NextResponse.json({ error: 'Sprint not found' }, { status: 404 })
    }

    const sprint = sprintRes.data
    const checkins = checkinsRes.data || []
    const contextText = formatContextForPrompt(ctx)
    const systemPrompt = buildSystemPrompt(sprint, checkins, ctx)

    // Build message list: context injection → history → current trigger
    const isOpening = !msgHistory || msgHistory.length === 0
    const messages = [
      {
        role: 'user',
        content: `Контекст пользователя:\n\n${contextText}\n\nИспользуй как фон для разговора о завершённом спринте.`,
      },
      {
        role: 'assistant',
        content: 'Понял. Картина спринта и общий контекст передо мной. Начинаю.',
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

    const insights = parseInsights(raw)
    const layerUpdates = parseLayerUpdates(raw)
    const cleanText = stripTags(raw)

    // Persist insights
    let savedInsights: any[] = []
    if (insights.length > 0) {
      const rows = insights
        .filter(ins => ins.content)
        .map(ins => ({
          user_id: userId,
          source: 'sprint_reflection',
          layer: ins.layer === 0 ? null : ins.layer,
          category: ins.category,
          content: ins.content,
          related_sprint_id: sprintId,
          status: 'active',
        }))
      if (rows.length > 0) {
        const { data } = await supabaseAdmin
          .from('client_insights')
          .insert(rows)
          .select()
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
    })
  } catch (error: any) {
    console.error('Sprint review error — name:', error?.name, '| message:', error?.message, '| stack:', error?.stack)
    return NextResponse.json({ error: 'Internal server error', details: error?.message }, { status: 500 })
  }
}
