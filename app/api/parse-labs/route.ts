// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
 
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
 
const FIELDS = [
  'glucose', 'hba1c', 'insulin',
  'cholesterol_ldl', 'cholesterol_hdl', 'cholesterol_total', 'triglycerides',
  'crp', 'homocysteine',
  'testosterone_total', 'testosterone_free', 'cortisol', 'tsh',
  'vitamin_d', 'vitamin_b12', 'ferritin', 'iron', 'magnesium', 'omega3_index',
  'hemoglobin', 'wbc', 'platelets'
]
 
const FIELD_NAMES: Record<string, string[]> = {
  glucose: ['глюкоза', 'glucose', 'сахар', 'blood glucose'],
  hba1c: ['hba1c', 'гликированный гемоглобин', 'glycated hemoglobin', 'a1c'],
  insulin: ['инсулин', 'insulin'],
  cholesterol_ldl: ['лпнп', 'ldl', 'холестерин лпнп', 'холестерол лпнп', 'low density'],
  cholesterol_hdl: ['лпвп', 'hdl', 'холестерин лпвп', 'холестерол лпвп', 'high density'],
  cholesterol_total: ['холестерин общий', 'общий холестерин', 'total cholesterol', 'холестерол'],
  triglycerides: ['триглицериды', 'triglycerides', 'tg'],
  crp: ['срб', 'crp', 'с-реактивный', 'c-reactive', 'вч-срб', 'hscrp'],
  homocysteine: ['гомоцистеин', 'homocysteine'],
  testosterone_total: ['тестостерон общий', 'testosterone total', 'тестостерон'],
  testosterone_free: ['тестостерон свободный', 'free testosterone'],
  cortisol: ['кортизол', 'cortisol'],
  tsh: ['ттг', 'tsh', 'тиреотропный'],
  vitamin_d: ['витамин d', 'vitamin d', '25-oh', '25(oh)d', 'кальцидиол'],
  vitamin_b12: ['витамин b12', 'vitamin b12', 'кобаламин', 'cobalamin', 'b-12'],
  ferritin: ['ферритин', 'ferritin'],
  iron: ['железо', 'iron', 'сывороточное железо'],
  magnesium: ['магний', 'magnesium', 'mg'],
  omega3_index: ['омега-3', 'omega-3', 'omega3 index'],
  hemoglobin: ['гемоглобин', 'hemoglobin', 'hgb', 'hb'],
  wbc: ['лейкоциты', 'wbc', 'white blood cells', 'лейк'],
  platelets: ['тромбоциты', 'platelets', 'plt', 'тромб'],
}
 
export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mediaType } = await req.json()
 
    if (!imageBase64) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    }
 
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType || 'image/jpeg',
              data: imageBase64,
            }
          },
          {
            type: 'text',
            text: `Это бланк медицинских анализов. Извлеки все числовые показатели и верни ТОЛЬКО JSON без пояснений.
 
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
          }
        ]
      }]
    })
 
    const raw = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const clean = raw.replace(/```json|```/g, '').trim()
 
    let parsed
    try {
      parsed = JSON.parse(clean)
    } catch {
      return NextResponse.json({ error: 'Failed to parse response', raw }, { status: 500 })
    }
 
    // Filter out nulls
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
