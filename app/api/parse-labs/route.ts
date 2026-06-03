// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const PROMPT_TEXT = `Это бланк медицинских анализов. Извлеки все числовые показатели и верни ТОЛЬКО JSON без пояснений.

Формат ответа:
{
  "found": {
    "glucose": число или null,
    "hba1c": число или null,
    "insulin": число или null,
    "cholesterol_ldl": число или null,
    "cholesterol_hdl": число или null,
    "cholesterol_total": число или null,
    "triglycerides": число или null,
    "crp": число или null,
    "homocysteine": число или null,
    "testosterone_total": число или null,
    "testosterone_free": число или null,
    "cortisol": число или null,
    "tsh": число или null,
    "vitamin_d": число или null,
    "vitamin_b12": число или null,
    "ferritin": число или null,
    "iron": число или null,
    "magnesium": число или null,
    "omega3_index": число или null,
    "hemoglobin": число или null,
    "wbc": число или null,
    "platelets": число или null
  },
  "lab_name": "название лаборатории если есть или null",
  "date": "дата анализов в формате YYYY-MM-DD если есть или null",
  "raw_text": "краткое описание что найдено на бланке (1-2 предложения)"
}

Важно:
- Верни числа в тех единицах в которых они указаны в бланке
- Если показатель не найден — null
- Только JSON, никакого другого текста`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // обратная совместимость — старый клиент шлёт imageBase64
    const data = body.fileBase64 || body.imageBase64
    const mediaType = body.mediaType || 'image/jpeg'

    if (!data) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const isPdf = mediaType === 'application/pdf'

    // Строим content блок в зависимости от типа файла
    const fileBlock = isPdf
      ? {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data,
          },
        }
      : {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data,
          },
        }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          fileBlock,
          {
            type: 'text',
            text: PROMPT_TEXT,
          },
        ],
      }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const clean = raw.replace(/```json|```/g, '').trim()

    let parsed
    try {
      parsed = JSON.parse(clean)
    } catch {
      return NextResponse.json({ error: 'Failed to parse response', raw }, { status: 500 })
    }

    const found: Record<string, number> = {}
    let count = 0
    for (const [key, val] of Object.entries(parsed.found || {})) {
      if (val !== null && val !== undefined) {
        found[key] = val as number
        count++
      }
    }

    return NextResponse.json({
      found,
      count,
      lab_name: parsed.lab_name,
      date: parsed.date,
      raw_text: parsed.raw_text,
    })

  } catch (error) {
    console.error('Parse labs error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
