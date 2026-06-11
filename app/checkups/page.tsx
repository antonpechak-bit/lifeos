// @ts-nocheck
'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const s = {
  bg:          '#07090D',
  text:        '#F2F0EA',
  dim:         'rgba(255,255,255,0.50)',
  muted:       'rgba(255,255,255,0.28)',
  faint:       'rgba(255,255,255,0.07)',
  energy:      '#6AA8FF',
  recovery:    '#52FF9A',
  mindfulness: '#B18DFF',
  stress:      '#FFB84D',
  overload:    '#FF5A5A',
}

const KEY_NAMES: Record<string, string> = {
  glucose:'Глюкоза', hba1c:'HbA1c', insulin:'Инсулин',
  alt:'АЛТ', ast:'АСТ', ggt:'ГГТ', alp:'ЩФ', ldh:'ЛДГ',
  bilirubin:'Билирубин', bilirubin_direct:'Билирубин прямой', bilirubin_indirect:'Билирубин непрямой',
  total_protein:'Общий белок', albumin:'Альбумин', creatinine:'Креатинин',
  urea:'Мочевина', uric_acid:'Мочевая кислота',
  cholesterol:'Холестерин', hdl:'ЛПВП', ldl:'ЛПНП', triglycerides:'Триглицериды', vldl:'ЛПОНП',
  tsh:'ТТГ', free_t4:'Св. Т4', free_t3:'Св. Т3', t4:'Т4', t3:'Т3',
  testosterone:'Тестостерон', estradiol:'Эстрадиол', progesterone:'Прогестерон',
  cortisol:'Кортизол', dhea_s:'ДГЭА-С', lh:'ЛГ', fsh:'ФСГ', prolactin:'Пролактин',
  igf1:'ИФР-1', shbg:'ГСПГ',
  hemoglobin:'Гемоглобин', hematocrit:'Гематокрит',
  rbc:'Эритроциты', wbc:'Лейкоциты', plt:'Тромбоциты',
  mcv:'MCV', mch:'MCH', mchc:'MCHC', rdw:'RDW',
  neutrophils:'Нейтрофилы', lymphocytes:'Лимфоциты', monocytes:'Моноциты',
  eosinophils:'Эозинофилы', basophils:'Базофилы',
  crp:'СРБ', esr:'СОЭ', fibrinogen:'Фибриноген', il6:'ИЛ-6',
  ferritin:'Ферритин', iron:'Железо', transferrin:'Трансферрин', tibc:'ОЖСС',
  vitamin_d:'Витамин D', vitamin_b12:'Витамин B12', folate:'Фолат',
  magnesium:'Магний', calcium:'Кальций', phosphorus:'Фосфор', potassium:'Калий',
  sodium:'Натрий', zinc:'Цинк', selenium:'Селен',
}

function keyToName(key: string): string {
  return KEY_NAMES[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const GROUP_COLORS = {
  metabolism:  '#6AA8FF',
  inflammation:'#FF5A5A',
  hormones:    '#B18DFF',
  nutrition:   '#52FF9A',
  blood:       '#FFB84D',
  other:       'rgba(255,255,255,0.40)',
}

function getGroupColor(key) {
  const k = (key || '').toLowerCase()
  if (/glucose|hba1c|insulin|creatinin|urea|alt|ast|ggt|ldh|alp|bilirubin|cholesterol|triglycerid|hdl|ldl|uric/.test(k)) return GROUP_COLORS.metabolism
  if (/crp|esr|wbc|leuko|neutro|lympho|mono|eozin|basophil|fibrinogen/.test(k)) return GROUP_COLORS.inflammation
  if (/testoster|estradiol|progesteron|cortisol|dhea|lh|fsh|prolactin|tsh|t3|t4|igf/.test(k)) return GROUP_COLORS.hormones
  if (/vitamin|ferritin|iron|folate|b12|magnesium|zinc|calcium|omega/.test(k)) return GROUP_COLORS.nutrition
  if (/hemoglobin|hematocrit|rbc|plt|mcv|mch|mchc|hgb|hct|platelet|erythro/.test(k)) return GROUP_COLORS.blood
  return GROUP_COLORS.other
}

const STATUS_COLORS = {
  optimal:{ bg:'rgba(82,255,154,0.10)',  border:'rgba(82,255,154,0.28)',  text:'#52FF9A', dot:'#52FF9A' },
  warning:{ bg:'rgba(255,184,77,0.10)',  border:'rgba(255,184,77,0.25)',  text:'#FFB84D', dot:'#FFB84D' },
  danger: { bg:'rgba(255,90,90,0.10)',   border:'rgba(255,90,90,0.25)',   text:'#FF5A5A', dot:'#FF5A5A' },
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

function smoothPath(coords) {
  if (coords.length < 2) return ''
  if (coords.length === 2) return `M${coords[0][0]},${coords[0][1]} L${coords[1][0]},${coords[1][1]}`
  let d = `M${coords[0][0]},${coords[0][1]}`
  for (let i = 1; i < coords.length - 1; i++) {
    const mx = ((coords[i][0] + coords[i + 1][0]) / 2).toFixed(1)
    const my = ((coords[i][1] + coords[i + 1][1]) / 2).toFixed(1)
    d += ` Q${coords[i][0]},${coords[i][1]} ${mx},${my}`
  }
  d += ` L${coords[coords.length - 1][0]},${coords[coords.length - 1][1]}`
  return d
}

function GlowChart({ points, color, width = 150, height = 88 }) {
  if (!points || points.length < 2) return (
    <div style={{ width, height, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:8, height:8, borderRadius:'50%', background:color, boxShadow:`0 0 14px ${color}` }} />
    </div>
  )
  const vals = points.map(p => p.value)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 1
  const padX = 10, padY = 12
  const w = width - padX * 2
  const h = height - padY * 2
  const coords = points.map((p, i) => [
    padX + (i / (points.length - 1)) * w,
    padY + (1 - (p.value - min) / range) * h,
  ])
  const path = smoothPath(coords)
  const last = coords[coords.length - 1]
  const uid = color.replace(/[^a-zA-Z0-9]/g, 'c')
  return (
    <svg width={width} height={height} style={{ flexShrink:0, overflow:'visible' }}>
      <defs>
        <filter id={`glow-${uid}`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <path d={path} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"
        opacity="0.3" filter={`url(#glow-${uid})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="4" fill={color} />
      <circle cx={last[0]} cy={last[1]} r="7" fill={color} opacity="0.2" />
    </svg>
  )
}

function BiomarkerCard({ trend, isSelected, onClick }) {
  const color = getGroupColor(trend.key)
  const trendIcon = trend.trend === 'rising' ? '↑' : trend.trend === 'falling' ? '↓' : '→'
  const trendColor = trend.trend === 'rising' ? s.recovery : trend.trend === 'falling' ? s.overload : s.muted

  return (
    <div
      onClick={onClick}
      style={{
        position:'relative', width:'100%', height:120,
        borderRadius:24,
        background: isSelected
          ? 'linear-gradient(155deg,rgba(255,255,255,0.10) 0%,rgba(255,255,255,0.04) 100%)'
          : 'linear-gradient(155deg,rgba(255,255,255,0.07) 0%,rgba(255,255,255,0.02) 100%)',
        backdropFilter:'blur(40px)', WebkitBackdropFilter:'blur(40px)',
        border:`1px solid ${isSelected ? color + '55' : 'rgba(255,255,255,0.08)'}`,
        overflow:'hidden', cursor:'pointer',
        transition:'all 0.2s',
        display:'flex', alignItems:'stretch',
        boxShadow: isSelected ? `0 0 40px ${color}20, 0 8px 40px rgba(0,0,0,0.3)` : '0 4px 20px rgba(0,0,0,0.2)',
      }}
    >
      <div style={{
        position:'absolute', inset:0,
        background:`radial-gradient(ellipse at 85% 50%, ${color}14 0%, transparent 60%)`,
        pointerEvents:'none',
      }} />

      <div style={{ flex:1, padding:'14px 16px', display:'flex', flexDirection:'column', justifyContent:'space-between', minWidth:0, position:'relative' }}>
        <div style={{ fontSize:11, color:s.dim, letterSpacing:'0.03em', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {trend.name}
          {trend.latest.is_flagged && <span style={{ marginLeft:6, color:s.overload }}>⚠</span>}
        </div>
        <div>
          <div style={{ display:'flex', alignItems:'baseline', gap:5 }}>
            <span style={{ fontSize:28, fontWeight:600, color:s.text, lineHeight:1, letterSpacing:'-0.02em' }}>
              {trend.latest.value}
            </span>
            <span style={{ fontSize:11, color:s.muted }}>{trend.unit}</span>
          </div>
          {trend.points.length > 1 ? (
            <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:4 }}>
              <span style={{ fontSize:12, color:trendColor, fontWeight:500 }}>
                {trendIcon} {Math.abs(trend.change).toFixed(0)}%
              </span>
              <span style={{ fontSize:10, color:s.muted }}>{trend.points.length} точек</span>
            </div>
          ) : (
            <div style={{ marginTop:4, fontSize:10, color:s.muted }}>1 запись</div>
          )}
        </div>
      </div>

      <div style={{ display:'flex', alignItems:'center', paddingRight:8, position:'relative' }}>
        <GlowChart points={trend.points} color={color} width={150} height={90} />
      </div>
    </div>
  )
}

function DynamicsTab({ biomarkerRows }) {
  const [selectedKey, setSelectedKey] = useState(null)

  const byKey = {}
  for (const row of (biomarkerRows || [])) {
    if (!byKey[row.key]) byKey[row.key] = { key:row.key, name:row.name || keyToName(row.key), unit:row.unit, points:[] }
    byKey[row.key].points.push({ date:row.date, value:Number(row.value), ref_min:row.ref_min, ref_max:row.ref_max, is_flagged:row.is_flagged })
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
      <div style={{ textAlign:'center', padding:'40px 20px', background:'linear-gradient(155deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.01) 100%)', backdropFilter:'blur(40px)', WebkitBackdropFilter:'blur(40px)', border:'1px dashed rgba(255,255,255,0.1)', borderRadius:24 }}>
        <div style={{ fontSize:14, color:s.dim }}>Нет данных для динамики</div>
        <div style={{ fontSize:12, color:s.muted, marginTop:8 }}>Загрузи анализы с несколькими датами</div>
      </div>
    )
  }

  const selected = selectedKey ? trends.find(t => t.key === selectedKey) : null

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>

      {selected && (() => {
        const color = getGroupColor(selected.key)
        const pts = selected.points
        const vals = pts.map(p => p.value)
        const minV = Math.min(...vals) * 0.9
        const maxV = Math.max(...vals) * 1.1
        const range = maxV - minV || 1
        const W = 520, H = 100, pad = 24
        const w = W - pad * 2, h = H - pad * 2
        const coords = pts.map((p, i) => [
          pad + (i / (pts.length - 1 || 1)) * w,
          pad + (1 - (p.value - minV) / range) * h,
        ])
        const path = smoothPath(coords)
        return (
          <div style={{
            background:'linear-gradient(155deg,rgba(255,255,255,0.09) 0%,rgba(255,255,255,0.03) 100%)',
            backdropFilter:'blur(40px)', WebkitBackdropFilter:'blur(40px)',
            border:`1px solid ${color}35`,
            borderRadius:28, padding:20,
            animation:'fadeUp 0.2s forwards',
            boxShadow:`0 0 60px ${color}12, 0 20px 60px rgba(0,0,0,0.3)`,
          }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
              <div>
                <div style={{ fontSize:14, fontWeight:500, color:s.text }}>{selected.name}</div>
                {selected.latest.ref_min != null && selected.latest.ref_max != null && (
                  <div style={{ fontSize:11, color:s.dim, marginTop:2 }}>
                    Норма: {selected.latest.ref_min}–{selected.latest.ref_max} {selected.unit}
                  </div>
                )}
              </div>
              <button onClick={() => setSelectedKey(null)} style={{ fontSize:20, color:s.dim, background:'none', border:'none', cursor:'pointer', lineHeight:1, padding:4 }}>×</button>
            </div>

            <div style={{ position:'relative', height:120, marginBottom:14 }}>
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'100%', overflow:'visible' }}>
                <defs>
                  <filter id="glow-detail" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="5" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>
                <path d={path} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"
                  opacity="0.25" filter="url(#glow-detail)" />
                <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                {coords.map((c, i) => (
                  <g key={i}>
                    <circle cx={c[0]} cy={c[1]} r="4.5" fill={pts[i].is_flagged ? s.overload : color} />
                    <text x={c[0]} y={H - 2} textAnchor="middle" fontSize="9" fill={s.muted}>
                      {new Date(pts[i].date).toLocaleDateString('ru', { month:'short', year:'2-digit' })}
                    </text>
                    <text x={c[0]} y={c[1] - 10} textAnchor="middle" fontSize="9" fill={s.text}>
                      {pts[i].value}
                    </text>
                  </g>
                ))}
              </svg>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {[...selected.points].reverse().map((p, i) => {
                const st = getBiomarkerStatus(p.value, p.ref_min, p.ref_max, p.is_flagged)
                const sc = st ? STATUS_COLORS[st] : { bg:'rgba(255,255,255,0.04)', border:'rgba(255,255,255,0.08)', text:s.dim }
                return (
                  <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 12px', borderRadius:12, background:sc.bg, border:`1px solid ${sc.border}` }}>
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
        )
      })()}

      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {trends.map(t => (
          <BiomarkerCard
            key={t.key}
            trend={t}
            isSelected={selectedKey === t.key}
            onClick={() => setSelectedKey(selectedKey === t.key ? null : t.key)}
          />
        ))}
      </div>
    </div>
  )
}

function BottomNav({ router }) {
  const items = [
    { icon: '🏠', label: 'Главная',   route: '/dashboard' },
    { icon: '⚡', label: 'Чекин',     route: '/checkin' },
    { icon: '📊', label: 'Инсайты',   route: '/dashboard/insights' },
    { icon: '💬', label: 'Ассистент', route: '/assistant' },
    { icon: '🩺', label: 'Чекапы',    route: '/checkups' },
  ]
  const current = typeof window !== 'undefined' ? window.location.pathname : ''
  return (
    <nav style={{
      position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(8,10,16,0.92)',
      backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 999,
      display: 'flex', alignItems: 'center', gap: 2,
      padding: '8px 10px',
      zIndex: 50,
      boxShadow: '0 8px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
    }}>
      {items.map(item => {
        const active = current === item.route
        return (
          <button key={item.route} onClick={() => router.push(item.route)} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
            border: active ? '1px solid rgba(255,255,255,0.14)' : '1px solid transparent',
            borderRadius: 14, cursor: 'pointer', padding: '7px 13px',
            transition: 'all 0.15s',
          }}>
            <span style={{ fontSize: 19 }}>{item.icon}</span>
            <span style={{ fontSize: 9, color: active ? s.text : s.muted, letterSpacing: '0.02em' }}>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

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
                name: b.name || keyToName(b.key),
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
      <div style={{ width:28, height:28, borderRadius:'50%', border:'2px solid rgba(255,255,255,0.08)', borderTop:`2px solid ${s.energy}`, animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const byDate = {}
  for (const row of biomarkerRows) {
    if (!byDate[row.date]) byDate[row.date] = { date:row.date, lab_name:row.lab_name, items:[] }
    byDate[row.date].items.push(row)
  }
  const dateGroups = Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div style={{ minHeight:'100vh', background:s.bg, color:s.text, fontFamily:"'DM Sans',-apple-system,sans-serif", fontWeight:300, paddingBottom:120 }}>
      <style>{`
        @keyframes fadeUp    { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin      { to{transform:rotate(360deg)} }
        @keyframes orbFloat  { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(12px,-10px) scale(1.08)} }
        @keyframes orbFloat2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-10px,14px) scale(1.05)} }
      `}</style>

      {/* Hero header */}
      <div style={{
        padding:'28px 24px 24px',
        position:'relative', overflow:'hidden',
        background:'linear-gradient(145deg,#081628 0%,#060D1C 50%,#0A0F22 100%)',
        borderBottom:'1px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{ position:'absolute', top:-40, right:-30, width:220, height:220, borderRadius:'50%', background:`radial-gradient(circle,${s.mindfulness}20 0%,transparent 65%)`, animation:'orbFloat 9s ease-in-out infinite', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:-60, left:-40, width:260, height:260, borderRadius:'50%', background:`radial-gradient(circle,${s.energy}12 0%,transparent 65%)`, animation:'orbFloat2 12s ease-in-out infinite 1.5s', pointerEvents:'none' }} />

        <div style={{ position:'relative', zIndex:1, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <button onClick={() => router.push('/dashboard')} style={{ fontSize:13, color:s.dim, background:'none', border:'none', cursor:'pointer', padding:0 }}>← Назад</button>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:17, color:s.text }}>🩺 Чекапы</div>
          </div>
          <button onClick={() => router.push('/assistant')} style={{
            fontSize:12, color:s.energy,
            background:'rgba(106,168,255,0.08)', border:'1px solid rgba(106,168,255,0.2)',
            borderRadius:12, padding:'5px 10px', cursor:'pointer',
          }}>
            Обсудить →
          </button>
        </div>
      </div>

      <div style={{ maxWidth:560, margin:'0 auto', padding:'16px 16px' }}>

        {/* Upload block */}
        <div style={{
          background:'linear-gradient(155deg,rgba(255,255,255,0.075) 0%,rgba(255,255,255,0.025) 100%)',
          backdropFilter:'blur(40px)', WebkitBackdropFilter:'blur(40px)',
          border:'1px solid rgba(255,255,255,0.09)',
          borderRadius:28, padding:16, marginBottom:16,
          boxShadow:'0 4px 30px rgba(0,0,0,0.2)',
        }}>
          <input ref={fileInputRef} type="file" accept="image/*,.pdf,application/pdf" style={{ display:'none' }}
            onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              width:'100%', padding:'12px', borderRadius:16,
              background: uploading ? 'rgba(255,255,255,0.03)' : `rgba(106,168,255,0.08)`,
              border: `1px solid ${uploading ? 'rgba(255,255,255,0.06)' : 'rgba(106,168,255,0.25)'}`,
              color: uploading ? s.muted : s.energy,
              fontSize:13, cursor: uploading ? 'not-allowed' : 'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              transition:'all 0.2s', fontFamily:"'DM Sans',sans-serif",
            }}
          >
            {uploading
              ? <><span style={{ animation:'spin 1s linear infinite', display:'inline-block' }}>◌</span> Распознаю показатели...</>
              : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Загрузить анализы (фото или PDF)</>
            }
          </button>
          {uploadResult && (
            <div style={{ marginTop:10, padding:'10px 14px', borderRadius:14, background: uploadResult.success ? 'rgba(82,255,154,0.08)' : 'rgba(255,90,90,0.08)', border:`1px solid ${uploadResult.success ? 'rgba(82,255,154,0.22)' : 'rgba(255,90,90,0.2)'}`, fontSize:12, color: uploadResult.success ? s.recovery : s.overload, lineHeight:1.6 }}>
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

        {/* Tabs */}
        <div style={{ display:'flex', gap:4, marginBottom:16, background:'rgba(255,255,255,0.04)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', borderRadius:18, padding:4, border:'1px solid rgba(255,255,255,0.08)' }}>
          {[['dynamics','📈 Динамика'],['history','📋 История']].map(([t, l]) => (
            <div key={t} onClick={() => setTab(t)} style={{ flex:1, padding:'10px', borderRadius:14, fontSize:13, textAlign:'center', cursor:'pointer', background:tab===t ? 'rgba(255,255,255,0.09)' : 'transparent', color:tab===t ? s.text : s.muted, fontWeight:tab===t ? 500 : 300, transition:'all 0.15s', border: tab===t ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent' }}>
              {l}
            </div>
          ))}
        </div>

        {/* Dynamics tab */}
        {tab === 'dynamics' && (
          <div style={{ animation:'fadeUp 0.3s forwards' }}>
            <DynamicsTab biomarkerRows={biomarkerRows} />
          </div>
        )}

        {/* History tab */}
        {tab === 'history' && (
          <div style={{ display:'flex', flexDirection:'column', gap:10, animation:'fadeUp 0.3s forwards' }}>
            {dateGroups.length === 0 ? (
              <div style={{ textAlign:'center', padding:'40px 20px', background:'linear-gradient(155deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.01) 100%)', backdropFilter:'blur(40px)', WebkitBackdropFilter:'blur(40px)', border:'1px dashed rgba(255,255,255,0.1)', borderRadius:24 }}>
                <div style={{ fontSize:14, color:s.dim }}>Загрузи анализы чтобы увидеть историю</div>
              </div>
            ) : dateGroups.map((group, i) => {
              const flagged = group.items.filter(b => b.is_flagged)
              const normal  = group.items.filter(b => !b.is_flagged)
              return (
                <div key={i} style={{
                  background:'linear-gradient(155deg,rgba(255,255,255,0.07) 0%,rgba(255,255,255,0.02) 100%)',
                  backdropFilter:'blur(40px)', WebkitBackdropFilter:'blur(40px)',
                  border:'1px solid rgba(255,255,255,0.08)',
                  borderRadius:24, padding:'16px 18px',
                  boxShadow:'0 4px 24px rgba(0,0,0,0.2)',
                }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                    <div style={{ fontSize:14, fontWeight:500, color:s.text }}>
                      {new Date(group.date).toLocaleDateString('ru', { day:'numeric', month:'long', year:'numeric' })}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      {flagged.length > 0 && (
                        <span style={{ fontSize:11, color:s.overload, background:'rgba(255,90,90,0.10)', border:'1px solid rgba(255,90,90,0.22)', borderRadius:10, padding:'3px 9px' }}>
                          ⚠ {flagged.length} вне нормы
                        </span>
                      )}
                      {group.lab_name && <span style={{ fontSize:11, color:s.muted }}>{group.lab_name}</span>}
                    </div>
                  </div>

                  <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {[...flagged, ...normal].map((b, j) => {
                      const flaggedPill = b.is_flagged
                      return (
                        <div key={j} style={{
                          padding:'5px 11px', borderRadius:12,
                          background: flaggedPill ? 'rgba(255,90,90,0.10)' : 'rgba(82,255,154,0.08)',
                          border:`1px solid ${flaggedPill ? 'rgba(255,90,90,0.28)' : 'rgba(82,255,154,0.22)'}`,
                          fontSize:11,
                          color: flaggedPill ? s.overload : s.recovery,
                          whiteSpace:'nowrap', lineHeight:1.4,
                        }}>
                          <span style={{ opacity:0.75 }}>{b.name || keyToName(b.key)}</span>
                          {' '}
                          <strong style={{ fontWeight:600 }}>{b.value}</strong>
                          {b.unit ? <span style={{ opacity:0.6 }}> {b.unit}</span> : ''}
                          {flaggedPill ? ' ⚠' : ''}
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

      <BottomNav router={router} />
    </div>
  )
}

export default function CheckupsPage() {
  return <Suspense><CheckupsContent /></Suspense>
}
