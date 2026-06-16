// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { SYSTEM_PROMPT } from '@/lib/prompts'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// anon client — only used for JWT verification (auth.getUser)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// service role client — bypasses RLS for session writes
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { messages, sessionId } = await req.json()
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid messages' }, { status: 400 })
    }

    // Verify caller JWT → resolve userId for RLS-safe write
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    let userId: string | null = null
    if (token) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      if (!authError && user) userId = user.id
    }

    let response
    try {
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
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

    if (sessionId && userId) {
      const hasStateMap = reply.includes('[STATE_MAP_START]')
      const stateMap = hasStateMap
        ? reply.split('[STATE_MAP_START]')[1]?.split('[STATE_MAP_END]')[0]?.trim()
        : undefined

      const { error: updateError } = await supabaseAdmin
        .from('sessions')
        .update({
          messages: [...messages, { role: 'assistant', content: reply }],
          ...(stateMap && { state_map: stateMap, completed: true }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .eq('user_id', userId)

      if (updateError) console.error('Session update error:', updateError)
    }

    return NextResponse.json({ reply })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: 'Произошла ошибка. Попробуйте снова.' },
      { status: 500 }
    )
  }
}
