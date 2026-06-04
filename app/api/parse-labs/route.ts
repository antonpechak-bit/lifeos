// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const PROMPT = `Medical lab results. Extract ALL numeric biomarkers grouped by date. Skip qualitative results (negative, not detected, normal/abnormal text, etc.).

Return ONLY compact JSON, no explanations or markdown:
{"lab_name":"string or null","records":[{"date":"YYYY-MM-DD","biomarkers":[{"key":"snake_case","value":5.4,"unit":"mmol/L","ref_min":3.9,"ref_max":6.1,"is_flagged":false}]}]}

Rules:
- key: latin snake_case (glucose, hba1c, alt, ast, tsh, free_t4, creatinine, hdl, ldl, triglycerides, ferritin, vitamin_d, etc.)
- value: number only — never a string
- is_flagged: true if marked *, H, L, arrow, or value outside ref range
- Convert to SI: glucose/cholesterol in mmol/L (mg/dL ÷ 18.0 and ÷ 38.67), testosterone in nmol/L (ng/dL ÷ 28.85)
- Use null for missing ref_min/ref_max
- Each distinct date = separate record in records[]
- ONLY JSON, nothing else`

function buildFileBlock(mediaType: string, data: string) {
  return mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
    : { type: 'image',    source: { type: 'base64', media_type: mediaType,          data } }
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

async function callClaude(params: Parameters<typeof anthropic.messages.create>[0]) {
  try {
    return await anthropic.messages.create(params)
  } catch (e: any) {
    const isRateLimit = e.status === 429 || e.error?.type === 'rate_limit_error'
    if (isRateLimit) {
      console.log('[parse-labs] Rate limit hit, retrying in 5s...')
      await new Promise(r => setTimeout(r, 5000))
      return await anthropic.messages.create(params)
    }
    throw e
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

    console.log('[parse-labs] Sending single request, max_tokens=16000')
    const response = await callClaude({
      model: 'claude-sonnet-4-5',
      max_tokens: 16000,
      messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: PROMPT }] }],
    })

    console.log('[parse-labs] stop_reason:', response.stop_reason, '| output tokens:', response.usage?.output_tokens)
    const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''

    const parsed = parseJson(raw, 'single-pass')
    if (!parsed || !Array.isArray(parsed.records) || parsed.records.length === 0) {
      console.error('[parse-labs] No records parsed')
      return NextResponse.json({ error: 'No data found in document', records: [] }, { status: 200 })
    }

    const records = parsed.records
      .map((r: any) => {
        const biomarkers = (r.biomarkers || []).filter(
          (b: any) => b.value !== null && b.value !== undefined && typeof b.value === 'number'
        )
        console.log(`[parse-labs] date=${r.date} | biomarkers=${biomarkers.length}`)
        return { date: r.date, lab_name: parsed.lab_name || null, biomarkers, count: biomarkers.length }
      })
      .filter((r: any) => r.date && r.count > 0)

    const totalCount = records.reduce((s: number, r: any) => s + r.count, 0)
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
