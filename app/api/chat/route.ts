import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { SYSTEM_PROMPT } from '@/lib/prompts'
import { supabase } from '@/lib/supabase'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export async function POST(req: NextRequest) {
  try {
    const { messages, sessionId } = await req.json()

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid messages' }, { status: 400 })
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    })

    const reply = response.content[0].type === 'text' ? response.content[0].text : ''

    // Save to Supabase if sessionId provided
    if (sessionId) {
      const hasStateMap = reply.includes('[STATE_MAP_START]')
      const stateMap = hasStateMap
        ? reply.split('[STATE_MAP_START]')[1]?.split('[STATE_MAP_END]')[0]?.trim()
        : undefined

      await supabase
        .from('sessions')
        .update({
          messages: [
            ...messages,
            { role: 'assistant', content: reply },
          ],
          ...(stateMap && { state_map: stateMap, completed: true }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
    }

    return NextResponse.json({ reply })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
