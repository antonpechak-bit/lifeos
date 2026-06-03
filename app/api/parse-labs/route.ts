// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const PROMPT_TEXT = `Это медицинские анализы. В документе может быть НЕСКОЛЬКО дат — динамика за разные периоды.

Извлеки ВСЕ записи по датам и верни ТОЛЬКО JSON без пояснений.

Формат ответа:
{
  "records": [
    {
      "date": "YYYY-MM-DD",
      "lab_name": "название лаборатории или null",
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
      }
    }
  ],
  "summary": "краткое описание что найдено (1-2 предложения)"
}

Важно:
- Если несколько дат — создай отдельную запись для каждой даты
- Если дата не указана явно — попробуй определить из контекста, иначе используй сегодняшнюю
- Верни числа в тех единицах в которых они указаны
- Если показатель не найден для даты — null
- Только JSON, никакого другого текста`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = body.fileBase64 || body.imageBase64
    const mediaType = body.mediaType || 'image/jpeg'

    if (!data) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const isPdf = mediaType === 'application/pdf'

    console.log('[parse-labs] mediaType:', mediaType, '| isPdf:', isPdf, '| data length:', data?.length)

    const fileBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data } }

    console.log('[parse-labs] fileBlock type:', fileBlock.type, '| source type:', fileBlock.source.type, '| source media_type:', fileBlock.source.media_type)

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [fileBlock, { type: 'text', text: PROMPT_TEXT }],
      }],
    })

    console.log('[parse-labs] Claude stop_reason:', response.stop_reason)
    console.log('[parse-labs] Claude response content blocks:', response.content.length)
    const raw = response.content[0].type === 'text' ? response.content[0].text : '{}'
    console.log('[parse-labs] Claude raw response:\n', raw)
    const clean = raw.replace(/```json|```/g, '').trim()
    console.log('[parse-labs] Cleaned JSON:\n', clean)

    let parsed
    try {
      parsed = JSON.parse(clean)
    } catch {
      console.error('[parse-labs] JSON.parse failed on:', clean)
      return NextResponse.json({ error: 'Failed to parse response', raw }, { status: 500 })
    }

    console.log('[parse-labs] parsed.records count:', parsed.records?.length ?? 0)

    // Обрабатываем массив записей
    const records = (parsed.records || []).map(record => {
      const found: Record<string, number> = {}
      let count = 0
      for (const [key, val] of Object.entries(record.found || {})) {
        if (val !== null && val !== undefined) {
          found[key] = val as number
          count++
        }
      }
      return { date: record.date, lab_name: record.lab_name, found, count }
    }).filter(r => r.count > 0)

    const totalCount = records.reduce((sum, r) => sum + r.count, 0)

    return NextResponse.json({
      records,
      total_count: totalCount,
      dates_found: records.length,
      summary: parsed.summary,
    })

  } catch (error) {
    console.error('Parse labs error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
