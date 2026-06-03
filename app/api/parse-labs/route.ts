// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const PROMPT_TEXT = `Это медицинские анализы. Документ может содержать НЕСКОЛЬКО дат.

Извлеки ВСЕ числовые показатели для каждой даты. Пропускай качественные результаты (Отрицательно, Не обнаружено и т.п.).

Верни ТОЛЬКО JSON:

{
  "records": [
    {
      "date": "YYYY-MM-DD",
      "lab_name": "название или null",
      "biomarkers": [
        {
          "key": "snake_case_latin",
          "name": "Название на русском",
          "value": число,
          "unit": "единица",
          "ref_min": число или null,
          "ref_max": число или null,
          "is_flagged": true/false
        }
      ]
    }
  ],
  "summary": "1-2 предложения"
}

Правила:
- key: латиница snake_case (glucose, hba1c, alt, ast, tsh, free_t4, creatinine, uric_acid и т.д.)
- Отдельная запись для каждой даты; если дата не указана — используй сегодняшнюю
- is_flagged = true если есть *, H, L, стрелка, или значение вне ref_min/ref_max
- ref_min/ref_max — из референсного диапазона лаборатории
- Приводи к СИ: глюкоза/холестерин в ммоль/л (мг/дл ÷ 18.0 и ÷ 38.67), тестостерон в нмоль/л (нг/дл ÷ 28.85)
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

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: [fileBlock, { type: 'text', text: PROMPT_TEXT }],
      }],
    })

    console.log('[parse-labs] stop_reason:', response.stop_reason, '| content blocks:', response.content.length)
    const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
    console.log('[parse-labs] raw response (first 1000 chars):', raw.slice(0, 1000))

    if (!raw) {
      console.error('[parse-labs] Empty response from Claude')
      return NextResponse.json({ error: 'Empty response from Claude', records: [] }, { status: 500 })
    }

    const clean = raw.replace(/```json|```/g, '').trim()

    let parsed
    try {
      parsed = JSON.parse(clean)
      console.log('[parse-labs] JSON.parse succeeded | records:', parsed.records?.length ?? 0,
        '| first record biomarkers:', parsed.records?.[0]?.biomarkers?.length ?? 'n/a')
    } catch (parseErr) {
      console.error('[parse-labs] JSON.parse failed:', parseErr.message)
      console.error('[parse-labs] Failing JSON (first 500 chars):', clean.slice(0, 500))
      return NextResponse.json({ error: 'Failed to parse response', raw }, { status: 500 })
    }

    const records = (parsed.records || []).map(record => {
      const biomarkers = (record.biomarkers || []).filter(b => b.value !== null && b.value !== undefined)
      console.log(`[parse-labs] record date=${record.date} | biomarkers=${biomarkers.length}`)
      return {
        date: record.date,
        lab_name: record.lab_name,
        biomarkers,
        count: biomarkers.length,
      }
    }).filter(r => r.count > 0)

    console.log('[parse-labs] final records:', records.length, '| total biomarkers:', records.reduce((s, r) => s + r.count, 0))

    return NextResponse.json({
      records,
      total_count: records.reduce((s, r) => s + r.count, 0),
      dates_found: records.length,
      summary: parsed.summary,
    })

  } catch (error) {
    console.error('[parse-labs] Internal error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
