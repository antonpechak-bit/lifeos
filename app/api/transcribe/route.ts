// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
 
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audio = formData.get('audio') as File
 
    if (!audio) {
      return NextResponse.json({ error: 'No audio' }, { status: 400 })
    }
 
    const whisperForm = new FormData()
    whisperForm.append('file', audio, 'audio.webm')
    whisperForm.append('model', 'whisper-1')
    whisperForm.append('language', 'ru')
 
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: whisperForm,
    })
 
    if (!response.ok) {
      const err = await response.text()
      console.error('Whisper error:', err)
      return NextResponse.json({ error: 'Whisper API error' }, { status: 500 })
    }
 
    const data = await response.json()
    return NextResponse.json({ text: data.text })
 
  } catch (error) {
    console.error('Transcribe error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
 
