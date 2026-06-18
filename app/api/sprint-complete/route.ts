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

export async function POST(req: NextRequest) {
  try {
    const { userId, sprintId, messages } = await req.json()

    if (!userId || !sprintId) {
      return NextResponse.json({ error: 'userId and sprintId required' }, { status: 400 })
    }

    const authHeader = req.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authUser || authUser.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [sprintRes, checkinsRes] = await Promise.all([
      supabaseAdmin
        .from('sprints')
        .select('*')
        .eq('id', sprintId)
        .eq('user_id', userId)
        .single(),
      supabaseAdmin
        .from('checkins')
        .select('completed, date')
        .eq('user_id', userId)
        .eq('sprint_id', sprintId),
    ])

    if (sprintRes.error || !sprintRes.data) {
      return NextResponse.json({ error: 'Sprint not found' }, { status: 404 })
    }

    const sprint = sprintRes.data
    if (sprint.status === 'completed') {
      return NextResponse.json({ error: 'Sprint already completed' }, { status: 400 })
    }

    const checkins = checkinsRes.data || []
    const success_count = checkins.filter(c => c.completed).length
    const total_days = sprint.target_days || 14

    let reflection_summary: string | null = null
    const hasConversation = messages && messages.filter((m: any) => m.role !== 'error').length >= 2

    if (hasConversation) {
      try {
        const conv = messages
          .filter((m: any) => m.role !== 'error')
          .map((m: any) => `${m.role === 'user' ? 'Человек' : 'Ассистент'}: ${m.content}`)
          .join('\n\n')

        const res = await anthropic.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: 300,
          system: 'Сформулируй короткую (2-4 предложения) выжимку разговора о завершённом спринте. Тон гештальт: что человек заметил, что произошло — без оценок «молодец/плохо». Только живое наблюдение и суть. По-русски.',
          messages: [{
            role: 'user',
            content: `Спринт «${sprint.behavior_name}»:\n\n${conv}\n\nВыжимка:`,
          }],
        })
        reflection_summary = res.content[0]?.type === 'text' ? res.content[0].text.trim() : null
      } catch (e) {
        console.error('Summary generation failed:', e)
      }
    }

    const cleanMessages = (messages || []).filter((m: any) => m.role !== 'error')

    const { error: updateError } = await supabaseAdmin
      .from('sprints')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        success_count,
        total_days,
        reflection_summary,
        reflection_messages: cleanMessages,
      })
      .eq('id', sprintId)
      .eq('user_id', userId)

    if (updateError) {
      console.error('Sprint update error — code:', updateError.code, '| message:', updateError.message, '| details:', updateError.details, '| hint:', updateError.hint)
      return NextResponse.json({ error: 'Failed to complete sprint', details: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, reflection_summary, success_count, total_days })
  } catch (error: any) {
    console.error('Sprint complete error — name:', error?.name, '| message:', error?.message, '| stack:', error?.stack)
    return NextResponse.json({ error: 'Internal server error', details: error?.message }, { status: 500 })
  }
}
