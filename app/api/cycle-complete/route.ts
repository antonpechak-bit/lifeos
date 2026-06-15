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
    const { userId, messages } = await req.json()

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

    // Load all active sprints
    const { data: sprints } = await supabaseAdmin
      .from('sprints')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')

    if (!sprints || sprints.length === 0) {
      return NextResponse.json({ error: 'No active sprints to complete' }, { status: 400 })
    }

    // Load checkins for all sprints in parallel
    const checkinsResults = await Promise.all(
      sprints.map(sp =>
        supabaseAdmin
          .from('checkins')
          .select('completed, date')
          .eq('user_id', userId)
          .eq('sprint_id', sp.id)
      )
    )

    // Generate ONE shared cycle reflection_summary
    let reflection_summary: string | null = null
    const cleanMessages = (messages || []).filter((m: any) => m.role !== 'error')
    const hasConversation = cleanMessages.length >= 2

    if (hasConversation) {
      try {
        const sprintNames = sprints.map((sp, i) => `[${i}] «${sp.behavior_name}»`).join(', ')
        const conv = cleanMessages
          .map((m: any) => `${m.role === 'user' ? 'Человек' : 'Ассистент'}: ${m.content}`)
          .join('\n\n')

        const res = await anthropic.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: 350,
          system: 'Сформулируй короткую (2-4 предложения) выжимку разговора об итогах цикла практик. Охвати все практики целостно: что связало этот период, что человек заметил, какие связи проявились. Тон гештальт — наблюдение, без оценок. По-русски.',
          messages: [{
            role: 'user',
            content: `Цикл: ${sprintNames}.\n\nРазговор:\n\n${conv}\n\nВыжимка цикла:`,
          }],
        })
        reflection_summary = res.content[0]?.type === 'text' ? res.content[0].text.trim() : null
      } catch (e) {
        console.error('Cycle summary generation failed:', e)
      }
    }

    const completedAt = new Date().toISOString()

    // Complete all sprints with the shared reflection
    const completedSprints = await Promise.all(
      sprints.map(async (sprint, idx) => {
        const checkins    = checkinsResults[idx].data || []
        const success_count = checkins.filter((c: any) => c.completed).length
        const total_days    = sprint.target_days || 14

        const { error } = await supabaseAdmin
          .from('sprints')
          .update({
            status: 'completed',
            completed_at: completedAt,
            success_count,
            total_days,
            reflection_summary,
            reflection_messages: cleanMessages,
          })
          .eq('id', sprint.id)
          .eq('user_id', userId)

        if (error) console.error(`Failed to complete sprint ${sprint.id}:`, error)

        return {
          id: sprint.id,
          behavior_name: sprint.behavior_name,
          layer: sprint.layer,
          success_count,
          total_days,
        }
      })
    )

    return NextResponse.json({
      success: true,
      reflection_summary,
      completed_sprints: completedSprints,
    })
  } catch (error) {
    console.error('Cycle complete error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
