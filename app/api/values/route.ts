// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const EPISTEMIC_RULE = `ПРАВИЛО УВЕРЕННОСТИ: Ты предлагаешь — человек решает. Никогда не говори "у тебя есть ценность X" в директивном тоне. Формулировки: "Похоже, что...", "Заметно, что для тебя важно...", "Возможно, это...", "Звучит как...". Тон — тёплый исследователь, феноменологический, без предписаний.`

const VALUES_SYSTEM = `Ты — фасилитатор ценностного исследования. Твой язык — русский. Стиль: гештальт, феноменологический.
${EPISTEMIC_RULE}`

async function authUser(req: NextRequest, userId: string) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return null
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user || user.id !== userId) return null
  return user
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, userId, responses, valueName, examples, values } = body

    const authed = await authUser(req, userId)
    if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // ── Cluster responses into proposed values ─────────────────
    if (action === 'cluster') {
      const prompt = `На основе этих ответов человека на вопросы о ценностях:

${responses.map((r: string, i: number) => `${i + 1}. ${r}`).join('\n')}

Найди 3-5 возможных core values которые звучат в этих ответах.

Для определения layer:
- layer 6 (Смысл) — ценности, связанные с призванием, трансцендентным, наследием, смыслом жизни, духовностью
- layer 5 (Ценности) — всё остальное: принципы, связь, рост, мастерство, свобода, честность

Ответь строго в JSON (без markdown):
{
  "values": [
    { "name": "название на русском (1-2 слова)", "rationale": "1-2 предложения — какие темы из ответов указывают на эту ценность (тон: 'Похоже, что...')", "layer": 5 },
    ...
  ],
  "reflection": "2-3 предложения — живая картина того, что важно этому человеку, без клише. Заканчивается открытым вопросом."
}`

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        system: VALUES_SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      })
      const raw = response.content[0].type === 'text' ? response.content[0].text : '{}'
      let parsed
      try {
        parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
      } catch {
        parsed = { values: [], reflection: raw }
      }
      return NextResponse.json(parsed)
    }

    // ── Operationalization hints for one value ─────────────────
    if (action === 'operationalize') {
      const prompt = `Человек принял ценность: "${valueName}"

Помоги с operationalization — как эта ценность выглядит в конкретном поведении.

Паттерн примеров:
Связь → глубокие разговоры, эмоциональная открытость, время с близкими
Рост → чтение и новые навыки, регулярная рефлексия, выход из зоны комфорта
Подлинность → честность о чувствах, отказ от маскировки, выборы по внутренним приоритетам

${examples ? `Человек уже написал: "${examples}"` : ''}

Предложи 3 конкретных поведенческих проявления для "${valueName}" — кратко, без патетики.

Ответь строго в JSON (без markdown):
{
  "suggestions": ["проявление 1", "проявление 2", "проявление 3"],
  "question": "короткий вопрос в гештальт-тоне — что из этого отзывается?"
}`

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system: VALUES_SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      })
      const raw = response.content[0].type === 'text' ? response.content[0].text : '{}'
      let parsed
      try {
        parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
      } catch {
        parsed = { suggestions: [], question: '' }
      }
      return NextResponse.json(parsed)
    }

    // ── Save accepted values to DB ──────────────────────────────
    if (action === 'save') {
      const rows = values.map((v: any) => ({
        user_id: userId,
        value_name: v.value_name,
        layer: v.layer ?? 5,
        operationalization: v.operationalization ?? null,
        alignment_score: null,
      }))

      const { data, error } = await supabaseAdmin
        .from('user_values')
        .insert(rows)
        .select()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ saved: data })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Values API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const authed = await authUser(req, userId)
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const fourteenDaysAgo = new Date()
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
  const since = fourteenDaysAgo.toISOString().slice(0, 10)

  const [valuesRes, checkinsRes] = await Promise.all([
    supabaseAdmin
      .from('user_values')
      .select('*')
      .eq('user_id', userId)
      .order('created_at'),
    supabaseAdmin
      .from('value_checkins')
      .select('value_id, score, date')
      .eq('user_id', userId)
      .gte('date', since),
  ])

  const values = valuesRes.data || []
  const checkins = checkinsRes.data || []

  const enriched = values.map(v => {
    const vc = checkins.filter(c => c.value_id === v.id)
    const alignmentScore = vc.length > 0
      ? Math.round(vc.reduce((sum, c) => sum + c.score, 0) / vc.length * 10)
      : null
    return { ...v, alignment_score: alignmentScore }
  })

  return NextResponse.json({ values: enriched })
}
