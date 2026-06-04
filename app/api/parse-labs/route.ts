// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const PASS1_PROMPT = `Это медицинские анализы. Найди все даты, для которых есть результаты анализов.

Верни ТОЛЬКО JSON без пояснений:
{"dates": ["YYYY-MM-DD", "YYYY-MM-DD", ...]}

Если дата не указана явно — определи из контекста. Только JSON.`

function pass2Prompt(date: string) {
  return `Это медицинские анализы. Извлеки ВСЕ числовые показатели ТОЛЬКО для даты ${date}.
Пропускай качественные результаты (Отрицательно, Не обнаружено и т.п.).

Верни ТОЛЬКО JSON:
{
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

Правила:
- key: латиница snake_case (glucose, hba1c, alt, ast, tsh, free_t4, creatinine и т.д.)
- is_flagged = true если есть *, H, L, стрелка, или значение вне ref_min/ref_max
- Приводи к СИ: глюкоза/холестерин в ммоль/л (мг/дл ÷ 18.0 и ÷ 38.67), тестостерон в нмоль/л (нг/дл ÷ 28.85)
- Только JSON, никакого другого текста`
}

function buildFileBlock(mediaType: string, data: string) {
  return mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data } }
}

function parseJson(raw: string, label: string) {
  const clean = raw.replace(/```json|```/g, '').trim()
  try {
    return JSON.parse(clean)
  } catch (e) {
    console.error(`[parse-labs] JSON.parse failed for ${label}:`, e.message, '| first 300 chars:', clean.slice(0, 300))
    return null
  }
}

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

    const fileBlock = buildFileBlock(mediaType, data)

    // ── Pass 1: extract dates ──────────────────────────────────
    console.log('[parse-labs] Pass 1: extracting dates')
    const pass1 = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 500,
      messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: PASS1_PROMPT }] }],
    })

    console.log('[parse-labs] Pass 1 stop_reason:', pass1.stop_reason)
    const pass1Raw = pass1.content[0]?.type === 'text' ? pass1.content[0].text : ''
    console.log('[parse-labs] Pass 1 raw:', pass1Raw)

    const pass1Parsed = parseJson(pass1Raw, 'pass1')
    if (!pass1Parsed || !Array.isArray(pass1Parsed.dates) || pass1Parsed.dates.length === 0) {
      console.error('[parse-labs] Pass 1 returned no dates')
      return NextResponse.json({ error: 'No dates found in document', records: [] }, { status: 200 })
    }

    const dates: string[] = pass1Parsed.dates
    console.log('[parse-labs] Pass 1 found dates:', dates)

    // ── Pass 2: extract biomarkers per date sequentially ─────────
    console.log(`[parse-labs] Pass 2: extracting biomarkers for ${dates.length} dates sequentially`)

    const dateResults = []
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i]
      console.log(`[parse-labs] Processing date ${i + 1} of ${dates.length}: ${date}`)

      const pass2 = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: pass2Prompt(date) }] }],
      })

      console.log(`[parse-labs] Pass 2 date=${date} stop_reason:`, pass2.stop_reason)
      const raw = pass2.content[0]?.type === 'text' ? pass2.content[0].text : ''
      const parsed = parseJson(raw, `pass2-${date}`)

      if (!parsed) {
        dateResults.push(null)
      } else {
        const biomarkers = (parsed.biomarkers || []).filter(b => b.value !== null && b.value !== undefined)
        console.log(`[parse-labs] Pass 2 date=${date} | biomarkers=${biomarkers.length}`)
        dateResults.push({
          date,
          lab_name: parsed.lab_name || null,
          biomarkers,
          count: biomarkers.length,
        })
      }

      if (i < dates.length - 1) {
        await new Promise(r => setTimeout(r, 500))
      }
    }

    const records = dateResults.filter(r => r !== null && r.count > 0)
    const totalCount = records.reduce((s, r) => s + r.count, 0)

    console.log('[parse-labs] Final records:', records.length, '| total biomarkers:', totalCount)

    return NextResponse.json({
      records,
      total_count: totalCount,
      dates_found: records.length,
      summary: null,
    })

  } catch (error) {
    console.error('[parse-labs] Internal error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
