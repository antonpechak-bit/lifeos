// @ts-nocheck
'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const s = {
  bg:'#0d0d0f', surface:'#141416', surface2:'#1a1a1e',
  border:'rgba(255,255,255,0.07)', border2:'rgba(255,255,255,0.12)',
  text:'#e8e6e0', dim:'#7a7870', muted:'#3d3d3d', accent:'#c8b89a',
  green:'#7ab87a', red:'#e07070', info:'#6ea8c8'
}


const STATUS_COLORS = {
  optimal: { bg:'rgba(122,184,122,0.12)', border:'rgba(122,184,122,0.3)', text:'#7ab87a', dot:'#7ab87a' },
  warning: { bg:'rgba(200,184,154,0.1)', border:'rgba(200,184,154,0.25)', text:'#c8b89a', dot:'#c8b89a' },
  danger:  { bg:'rgba(224,112,112,0.1)', border:'rgba(224,112,112,0.25)', text:'#e07070', dot:'#e07070' },
}

function getBiomarkerStatus(value, ref_min, ref_max, is_flagged) {
  if (is_flagged) return 'danger'
  if (ref_min != null && ref_max != null) {
    if (value >= ref_min && value <= ref_max) return 'optimal'
    const margin = (ref_max - ref_min) * 0.2
    if (value >= ref_min - margin && value <= ref_max + margin) return 'warning'
    return 'danger'
  }
  if (ref_min != null && value < ref_min) return 'danger'
  if (ref_max != null && value > ref_max) return 'danger'
  return null
}

// ─── Мини-график динамики ─────────────────────────────────────

function SparkLine({ points, optimal, width = 80, height = 32 }) {
  if (!points || points.length < 2) return null
  const vals = points.map(p => p.value)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 1
  const pad = 3
  const w = width - pad * 2
  const h = height - pad * 2
  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * w
    const y = pad + (1 - (p.value - min) / range) * h
    return [x, y]
  })
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(' ')
  const last = coords[coords.length - 1]
  const lastVal = vals[vals.length - 1]
  const status = getStatus(points[0]?.key, lastVal)
  const color = status ? STATUS_COLORS[status].dot : s.dim
  return (
    <svg width={width} height={height} style={{ flexShrink:0 }}>
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} />
    </svg>
  )
}

// ─── Вкладка Динамика ─────────────────────────────────────────

function DynamicsTab({ biomarkerRows }) {
  const [selectedKey, setSelectedKey] = useState(null)

  // Group flat biomarker rows by key
  const byKey = {}
  for (const row of (biomarkerRows || [])) {
    if (!byKey[row.key]) byKey[row.key] = { key: row.key, name: row.name, unit: row.unit, points: [] }
    byKey[row.key].points.push({ date: row.date, value: Number(row.value), ref_min: row.ref_min, ref_max: row.ref_max, is_flagged: row.is_flagged })
  }

  const trends = Object.values(byKey).map(b => {
    const points = [...b.points].sort((a, c) => a.date.localeCompare(c.date))
    const latest = points[points.length - 1]
    const first = points[0]
    const change = points.length > 1 ? ((latest.value - first.value) / Math.abs(first.value || 1) * 100) : 0
    const trend = Math.abs(change) < 5 ? 'stable' : change > 0 ? 'rising' : 'falling'
    const status = getBiomarkerStatus(latest.value, latest.ref_min, latest.ref_max, latest.is_flagged)
    return { ...b, points, latest, change, trend, status }
  }).sort((a, b) => b.points.length - a.points.length || a.name.localeCompare(b.name))

  if (trends.length === 0) {
    return (
      <div style={{ textAlign:'center', padding:'40px 20px', border:`1px dashed ${s.border}`, borderRadius:14 }}>
        <div style={{ fontSize:14, color:s.dim }}>Нет данных для динамики</div>
        <div style={{ fontSize:12, color:s.muted, marginTop:8 }}>Загрузи анализы с несколькими датами</div>
      </div>
    )
  }

  const selected = selectedKey ? trends.find(t => t.key === selectedKey) : null

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

      {/* Детальный график выбранного показателя */}
      {selected && (
        <div style={{ background:s.surface, border:`1px solid ${s.border2}`, borderRadius:14, padding:16, animation:'fadeUp 0.2s forwards' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
            <div>
              <div style={{ fontSize:14, fontWeight:500, color:s.text }}>{selected.name}</div>
              {selected.latest.ref_min != null && selected.latest.ref_max != null && (
                <div style={{ fontSize:11, color:s.dim, marginTop:2 }}>
                  Референс: {selected.latest.ref_min}–{selected.latest.ref_max} {selected.unit}
                </div>
              )}
            </div>
            <button onClick={() => setSelectedKey(null)} style={{ fontSize:18, color:s.dim, background:'none', border:'none', cursor:'pointer' }}>×</button>
          </div>

          <div style={{ position:'relative', height:120, marginBottom:12 }}>
            {(() => {
              const pts = selected.points
              const vals = pts.map(p => p.value)
              const min = Math.min(...vals) * 0.9
              const max = Math.max(...vals) * 1.1
              const range = max - min || 1
              const W = 520, H = 100, pad = 20
              const w = W - pad * 2, h = H - pad * 2
              const coords = pts.map((p, i) => ({
                x: pad + (i / (pts.length - 1 || 1)) * w,
                y: pad + (1 - (p.value - min) / range) * h,
                ...p
              }))
              const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
              const sc = selected.status ? STATUS_COLORS[selected.status] : { dot: s.dim }
              return (
                <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'100%' }}>
                  <path d={path} fill="none" stroke={sc.dot} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  {coords.map((c, i) => (
                    <g key={i}>
                      <circle cx={c.x} cy={c.y} r="4" fill={c.is_flagged ? s.red : sc.dot} />
                      <text x={c.x} y={H - 4} textAnchor="middle" fontSize="9" fill={s.dim}>
                        {new Date(c.date).toLocaleDateString('ru', { month:'short', year:'2-digit' })}
                      </text>
                      <text x={c.x} y={c.y - 8} textAnchor="middle" fontSize="9" fill={s.text}>
                        {c.value}
                      </text>
                    </g>
                  ))}
                </svg>
              )
            })()}
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {[...selected.points].reverse().map((p, i) => {
              const st = getBiomarkerStatus(p.value, p.ref_min, p.ref_max, p.is_flagged)
              const sc = st ? STATUS_COLORS[st] : { bg: s.surface2, border: s.border, text: s.dim }
              return (
                <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 10px', borderRadius:8, background:sc.bg, border:`1px solid ${sc.border}` }}>
                  <span style={{ fontSize:12, color:s.dim }}>
                    {new Date(p.date).toLocaleDateString('ru', { day:'numeric', month:'long', year:'numeric' })}
                  </span>
                  <span style={{ fontSize:13, fontWeight:500, color:sc.text }}>
                    {p.value} {selected.unit}
                    {p.is_flagged && <span style={{ marginLeft:6, fontSize:10 }}>⚠</span>}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Список всех показателей */}
      <div style={{ background:s.surface, border:`1px solid ${s.border}`, borderRadius:14, padding:16 }}>
        <div style={{ fontSize:11, color:s.muted, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:12 }}>
          Все показатели ({trends.length})
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {trends.map(t => {
            const sc = t.status ? STATUS_COLORS[t.status] : { bg: s.surface2, border: s.border, text: s.dim, dot: s.dim }
            const trendIcon = t.trend === 'rising' ? '↑' : t.trend === 'falling' ? '↓' : '→'
            const isSelected = selectedKey === t.key
            const sparkPoints = t.points.map(p => ({ ...p, key: t.key }))
            return (
              <div
                key={t.key}
                onClick={() => setSelectedKey(isSelected ? null : t.key)}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', borderRadius:10, background: isSelected ? sc.bg : s.surface2, border:`1px solid ${isSelected ? sc.border : s.border}`, cursor:'pointer', transition:'all 0.15s' }}
              >
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, color:s.dim, marginBottom:2 }}>{t.name}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ fontSize:15, fontWeight:500, color:sc.text }}>{t.latest.value}</span>
                    <span style={{ fontSize:11, color:s.muted }}>{t.unit}</span>
                    {t.points.length > 1 && (
                      <span style={{ fontSize:11, color: t.trend === 'rising' ? s.green : t.trend === 'falling' ? s.red : s.dim }}>
                        {trendIcon} {Math.abs(t.change).toFixed(0)}%
                      </span>
                    )}
                    {t.latest.is_flagged && <span style={{ fontSize:10, color:s.red }}>⚠</span>}
                  </div>
                </div>
                {t.points.length > 1 && <SparkLine points={sparkPoints} />}
                <div style={{ width:6, height:6, borderRadius:'50%', background:sc.dot, flexShrink:0 }} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Основной компонент ───────────────────────────────────────

function CheckupsContent() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [labName, setLabName] = useState('')
  const [tab, setTab] = useState('dynamics')
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [biomarkerRows, setBiomarkerRows] = useState([])
  const fileInputRef = useRef(null)

  async function loadBiomarkers(userId) {
    const { data, error } = await supabase
      .from('health_biomarkers')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(2000)
    if (!error) setBiomarkerRows(data || [])
  }

  useEffect(() => {
    async function load() {
      try {
        const { data: authData } = await supabase.auth.getSession()
        if (!authData?.session) { router.push('/'); return }
        setUser(authData.session.user)
        await loadBiomarkers(authData.session.user.id)
      } catch(e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  async function handleUpload(file) {
    if (!file) return
    console.log('[handleUpload] file.name:', file.name, '| file.type:', file.type, '| file.size:', file.size)
    setUploading(true)
    setUploadResult(null)
    try {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const base64 = e.target.result.split(',')[1]
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
        const mediaType = isPdf ? 'application/pdf' : (file.type || 'image/jpeg')
        const res = await fetch('/api/parse-labs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileBase64: base64, mediaType }),
        })
        const data = await res.json()

        console.log('[handleUpload] user.id at save time:', user?.id ?? 'NULL')

        if (data.records && data.records.length > 0) {
          for (const record of data.records) {
            const resolvedLabName = record.lab_name || labName || null
            if (record.biomarkers && record.biomarkers.length > 0) {
              const rows = record.biomarkers.map(b => ({
                user_id: user.id,
                date: record.date,
                lab_name: resolvedLabName,
                key: b.key,
                name: b.name,
                value: b.value,
                unit: b.unit || null,
                ref_min: b.ref_min ?? null,
                ref_max: b.ref_max ?? null,
                is_flagged: b.is_flagged ?? false,
              }))
              console.log(`[handleUpload] upserting ${rows.length} rows for date=${record.date}`)
              const { data: upsertData, error } = await supabase
                .from('health_biomarkers')
                .upsert(rows, { onConflict: 'user_id,date,key' })
                .select()
              console.log(`[handleUpload] health_biomarkers date=${record.date} | error:`, error, '| rows returned:', upsertData?.length ?? 0)
            }
          }

          const last = [...data.records].sort((a, b) => b.date.localeCompare(a.date))[0]
          if (last.lab_name) setLabName(last.lab_name)

          await loadBiomarkers(user.id)

          const savedDates = data.records.map(r => r.date).join(', ')
          setUploadResult({
            success: true,
            count: data.total_count,
            dates: data.dates_found,
            savedDates,
            text: data.summary,
          })
        } else {
          setUploadResult({ success: false, text: 'Не удалось распознать показатели. Попробуй другой файл.' })
        }
        setUploading(false)
      }
      reader.readAsDataURL(file)
    } catch(e) {
      setUploadResult({ success: false, text: 'Ошибка при обработке файла.' })
      setUploading(false)
    }
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', background:s.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ fontSize:14, color:s.dim }}>Загружаем...</div>
    </div>
  )

  // Group biomarkerRows by date for History tab
  const byDate = {}
  for (const row of biomarkerRows) {
    if (!byDate[row.date]) byDate[row.date] = { date: row.date, lab_name: row.lab_name, items: [] }
    byDate[row.date].items.push(row)
  }
  const dateGroups = Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div style={{ minHeight:'100vh', background:s.bg, color:s.text, fontFamily:"'DM Sans',sans-serif", fontWeight:300, paddingBottom:40 }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <header style={{ padding:'14px 20px', borderBottom:`1px solid ${s.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <button onClick={() => router.push('/dashboard')} style={{ fontSize:13, color:s.dim, background:'none', border:'none', cursor:'pointer' }}>← Dashboard</button>
        <span style={{ fontFamily:"'Playfair Display',serif", fontSize:16, color:s.accent }}>🩺 Чекапы</span>
        <button onClick={() => router.push('/assistant')} style={{ fontSize:12, color:s.info, background:'rgba(110,168,200,0.08)', border:`1px solid rgba(110,168,200,0.2)`, borderRadius:8, padding:'5px 10px', cursor:'pointer' }}>
          Обсудить →
        </button>
      </header>

      <div style={{ maxWidth:560, margin:'0 auto', padding:'16px 16px' }}>

        {/* Upload block — always visible */}
        <div style={{ background:s.surface, border:`1px solid ${s.border}`, borderRadius:14, padding:'16px', marginBottom:16 }}>
          <input ref={fileInputRef} type="file" accept="image/*,.pdf,application/pdf" style={{ display:'none' }} onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{ width:'100%', padding:'12px', borderRadius:10, background: uploading ? s.surface2 : 'rgba(110,168,200,0.1)', border:`1px solid ${uploading ? s.border : 'rgba(110,168,200,0.25)'}`, color: uploading ? s.muted : '#6ea8c8', fontSize:13, cursor: uploading ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, transition:'all 0.2s' }}
          >
            {uploading
              ? <><span style={{ animation:'spin 1s linear infinite', display:'inline-block' }}>◌</span> Распознаю показатели...</>
              : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Загрузить анализы (фото или PDF)</>
            }
          </button>
          {uploadResult && (
            <div style={{ marginTop:10, padding:'10px 12px', borderRadius:10, background: uploadResult.success ? 'rgba(122,184,122,0.08)' : 'rgba(224,112,112,0.08)', border:`1px solid ${uploadResult.success ? 'rgba(122,184,122,0.25)' : 'rgba(224,112,112,0.2)'}`, fontSize:12, color: uploadResult.success ? s.green : s.red, lineHeight:1.6 }}>
              {uploadResult.success
                ? `✓ Сохранено ${uploadResult.dates} ${uploadResult.dates === 1 ? 'запись' : 'записей'}, ${uploadResult.count} показателей. Даты: ${uploadResult.savedDates}. `
                : ''
              }{uploadResult.text}
            </div>
          )}
          {!uploadResult && (
            <div style={{ marginTop:8, fontSize:11, color:s.muted }}>
              ИИ распознает все показатели и даты, сохранит в историю
            </div>
          )}
        </div>

        {/* Tabs — Динамика first, История second */}
        <div style={{ display:'flex', gap:4, marginBottom:16, background:s.surface, borderRadius:12, padding:4, border:`1px solid ${s.border}` }}>
          {[['dynamics','📈 Динамика'],['history','📋 История']].map(([t,l]) => (
            <div key={t} onClick={() => setTab(t)} style={{ flex:1, padding:'8px', borderRadius:8, fontSize:13, textAlign:'center', cursor:'pointer', background:tab===t ? s.surface2 : 'transparent', color:tab===t ? s.text : s.dim, fontWeight:tab===t ? 500 : 300, transition:'all 0.15s' }}>
              {l}
            </div>
          ))}
        </div>

        {/* ── Динамика ── */}
        {tab === 'dynamics' && (
          <div style={{ animation:'fadeUp 0.3s forwards' }}>
            <DynamicsTab biomarkerRows={biomarkerRows} />
          </div>
        )}

        {/* ── История ── */}
        {tab === 'history' && (
          <div style={{ display:'flex', flexDirection:'column', gap:10, animation:'fadeUp 0.3s forwards' }}>
            {dateGroups.length === 0 ? (
              <div style={{ textAlign:'center', padding:'40px 20px', border:`1px dashed ${s.border}`, borderRadius:14 }}>
                <div style={{ fontSize:14, color:s.dim }}>Загрузи анализы чтобы увидеть историю</div>
              </div>
            ) : dateGroups.map((group, i) => {
              const flagged = group.items.filter(b => b.is_flagged)
              const normal = group.items.filter(b => !b.is_flagged)
              return (
                <div key={i} style={{ background:s.surface, border:`1px solid ${s.border}`, borderRadius:14, padding:'14px 16px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                    <div style={{ fontSize:13, fontWeight:500 }}>
                      {new Date(group.date).toLocaleDateString('ru', { day:'numeric', month:'long', year:'numeric' })}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      {flagged.length > 0 && (
                        <span style={{ fontSize:11, color:s.red, background:'rgba(224,112,112,0.1)', border:'1px solid rgba(224,112,112,0.2)', borderRadius:6, padding:'2px 8px' }}>
                          ⚠ {flagged.length} вне нормы
                        </span>
                      )}
                      {group.lab_name && <span style={{ fontSize:11, color:s.dim }}>{group.lab_name}</span>}
                    </div>
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {[...flagged, ...normal].map((b, j) => {
                      const st = getBiomarkerStatus(b.value, b.ref_min, b.ref_max, b.is_flagged)
                      const sc = st ? STATUS_COLORS[st] : { bg:s.surface2, border:s.border, text:s.dim }
                      return (
                        <div key={j} style={{ padding:'4px 10px', borderRadius:8, background:sc.bg, border:`1px solid ${sc.border}`, fontSize:11, color:sc.text }}>
                          {b.name}: <strong>{b.value}</strong>{b.unit ? ` ${b.unit}` : ''}{b.is_flagged ? ' ⚠' : ''}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}

export default function CheckupsPage() {
  return <Suspense><CheckupsContent /></Suspense>
}
