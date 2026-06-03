// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// Keys that map to health_metrics columns (returned in legacy `found` map for backward compat)
const LEGACY_KEYS = new Set([
  'glucose','hba1c','insulin','cholesterol_ldl','cholesterol_hdl','cholesterol_total',
  'triglycerides','crp','homocysteine','testosterone_total','testosterone_free',
  'cortisol','tsh','vitamin_d','vitamin_b12','ferritin','iron','magnesium',
  'omega3_index','hemoglobin','wbc','platelets',
])

const PROMPT_TEXT = `Это медицинские анализы. В документе может быть НЕСКОЛЬКО дат — динамика за разные периоды.

Извлеки ВСЕ числовые показатели из документа и верни ТОЛЬКО JSON без пояснений.
Пропускай качественные результаты (Отрицательно, Не обнаружено, Положительно и т.п.) — только числа.

Формат ответа:
{
  "records": [
    {
      "date": "YYYY-MM-DD",
      "lab_name": "название лаборатории или null",
      "biomarkers": [
        {
          "key": "snake_case_name",
          "name": "Название на русском",
          "value": число,
          "unit": "единица измерения",
          "ref_min": число или null,
          "ref_max": число или null,
          "is_flagged": true/false
        }
      ]
    }
  ],
  "summary": "краткое описание что найдено (1-2 предложения)"
}

Правила:
- key — латиница snake_case, уникальный идентификатор показателя (например: glucose, hba1c, alt, ast, creatinine, uric_acid, tsh, free_t4)
- Если несколько дат — создай отдельную запись для каждой даты
- Если дата не указана — попробуй определить из контекста, иначе используй сегодняшнюю
- is_flagged = true если рядом с значением есть *, H, L, стрелка вверх/вниз, или значение выходит за ref_min/ref_max
- ref_min и ref_max — из референсного диапазона лаборатории (если указан)
- Только JSON, никакого другого текста

Конвертация единиц — приводи к стандартным:
- glucose: ммоль/л (если мг/дл — раздели на 18.0)
- cholesterol_*, triglycerides: ммоль/л (если мг/дл — раздели на 38.67 для холестерина, на 88.57 для триглицеридов)
- testosterone_total, testosterone_free: нмоль/л (если нг/дл — раздели на 28.85; если нг/мл — умножь на 3.467)`

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

    console.log('[parse-labs] fileBlock type:', fileBlock.type, '| source media_type:', fileBlock.source.media_type)

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [fileBlock, { type: 'text', text: PROMPT_TEXT }],
      }],
    })

    console.log('[parse-labs] Claude stop_reason:', response.stop_reason, '| content blocks:', response.content.length)
    const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
    console.log('[parse-labs] Claude raw response (first 1000 chars):', raw.slice(0, 1000))
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
      const recordMatches = clean.matchAll(/\{[^{}]*"date"\s*:[^{}]*\{[^{}]*\}[^{}]*\}/gs)
      const extractedRecords = []
      for (const match of recordMatches) {
        try {
          const rec = JSON.parse(match[0])
          if (rec.date) extractedRecords.push(rec)
        } catch { /* skip */ }
      }
      console.log('[parse-labs] Fallback extracted records:', extractedRecords.length)
      if (extractedRecords.length === 0) {
        return NextResponse.json({ error: 'Failed to parse response', raw }, { status: 500 })
      }
      parsed = { records: extractedRecords, summary: null }
    }

    console.log('[parse-labs] parsed.records count:', parsed.records?.length ?? 0)

    // Build normalized records — biomarkers array + legacy found map
    const records = (parsed.records || []).map(record => {
      const biomarkers = (record.biomarkers || []).filter(b => b.value !== null && b.value !== undefined)
      console.log(`[parse-labs] record date=${record.date} | biomarkers=${biomarkers.length} | keys:`, biomarkers.map(b => b.key).join(','))
      return {
        date: record.date,
        lab_name: record.lab_name,
        biomarkers,
        count: biomarkers.length,
        found: Object.fromEntries(biomarkers.filter(b => LEGACY_KEYS.has(b.key)).map(b => [b.key, b.value])),
      }
    }).filter(r => r.count > 0)

    console.log('[parse-labs] final records after filter:', records.length, '| total biomarkers:', records.reduce((s, r) => s + r.count, 0))

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
