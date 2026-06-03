// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const PROMPT_TEXT = `Это медицинские анализы. Документ может содержать НЕСКОЛЬКО дат.

Извлеки данные по каждой дате и верни ТОЛЬКО JSON:

{
  "records": [
    {
      "date": "YYYY-MM-DD",
      "lab_name": "название или null",
      "found": {
        "glucose": null, "hba1c": null, "insulin": null, "homa_ir": null,
        "cholesterol_total": null, "cholesterol_ldl": null, "cholesterol_hdl": null, "cholesterol_vldl": null, "triglycerides": null,
        "crp": null, "homocysteine": null, "calprotectin": null,
        "testosterone_total": null, "testosterone_free": null, "cortisol": null,
        "tsh": null, "t3_free": null, "t4_free": null, "estradiol": null, "prolactin": null,
        "fsh": null, "lh": null, "parathyroid_hormone": null, "shbg": null,
        "vitamin_d": null, "vitamin_b12": null, "vitamin_b9": null,
        "ferritin": null, "iron": null, "magnesium": null, "zinc": null, "copper": null, "omega3_index": null,
        "alt": null, "ast": null, "ggt": null,
        "bilirubin_total": null, "bilirubin_direct": null,
        "creatinine": null, "gfr": null, "uric_acid": null,
        "albumin": null, "total_protein": null, "alkaline_phosphatase": null,
        "hemoglobin": null, "wbc": null, "platelets": null, "esr": null,
        "lymphocytes_pct": null, "neutrophils_pct": null
      }
    }
  ],
  "summary": "1-2 предложения"
}

Правила:
- Отдельная запись для каждой даты; если дата не указана — используй сегодняшнюю
- Если показатель не найден — null; только числа, без единиц
- Приводи к СИ: глюкоза/холестерин в ммоль/л, тестостерон в нмоль/л, остальное как указано
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
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [fileBlock, { type: 'text', text: PROMPT_TEXT }],
      }],
    })

    console.log('[parse-labs] stop_reason:', response.stop_reason)
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
      console.log('[parse-labs] JSON.parse succeeded | records:', parsed.records?.length ?? 0)
    } catch (parseErr) {
      console.error('[parse-labs] JSON.parse failed:', parseErr.message)
      console.error('[parse-labs] Failing JSON (first 500 chars):', clean.slice(0, 500))
      return NextResponse.json({ error: 'Failed to parse response', raw }, { status: 500 })
    }

    const records = (parsed.records || []).map(record => {
      const found: Record<string, number> = {}
      let count = 0
      for (const [key, val] of Object.entries(record.found || {})) {
        if (val !== null && val !== undefined) {
          found[key] = val as number
          count++
        }
      }
      console.log(`[parse-labs] record date=${record.date} | found=${count} biomarkers`)
      return { date: record.date, lab_name: record.lab_name, found, count }
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
