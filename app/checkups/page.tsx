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

const METRICS = [
  {
    group: 'Метаболизм',
    emoji: '🔴',
    fields: [
      { key:'glucose', label:'Глюкоза натощак', unit:'ммоль/л', optimal:'4.0–5.5', warning:'5.6–6.9', danger:'>7.0',
        science:'Хроническая гипергликемия запускает гликирование белков, окислительный стресс и системное воспаление.',
        psychology:'Резкие спады глюкозы активируют симпатику → раздражительность, тревога, когнитивный туман.',
        lifestyle:'10-минутная прогулка после еды снижает постпрандиальный пик на 30%. Клетчатка замедляет всасывание.',
        tradition:'Аюрведа: нестабильный «агни» — беспокойство и нечёткость ума. Осознанное питание снижает постпрандиальный стресс.' },
      { key:'hba1c', label:'HbA1c', unit:'%', optimal:'<5.7', warning:'5.7–6.4', danger:'≥6.5',
        science:'Отражает средний уровень глюкозы за 2–3 месяца. HbA1c >6% связан с ускоренным когнитивным снижением.',
        psychology:'Хронически повышенный HbA1c ассоциирован с деменцией и депрессией.',
        lifestyle:'Физическая активность — наиболее эффективный немедикаментозный метод. Требует 3 месяца для изменений.',
        tradition:'Буддийская метафора: долгосрочный «сладкий» след паттерна — буквальный биологический след за 3 месяца.' },
      { key:'cholesterol_ldl', label:'LDL холестерин', unit:'ммоль/л', optimal:'<2.5', warning:'2.5–3.5', danger:'>3.5',
        science:'При избытке LDL окисляются и откладываются в стенках артерий. Снижение на 1 ммоль/л → -20% сосудистых событий.',
        psychology:'Холестерин — строительный материал кортизола и тестостерона. Слишком низкий связан с депрессией.',
        lifestyle:'Zone 2 кардио снижает LDL. Омега-3 снижает триглицериды на 20–30%. Клетчатка (овёс, бобовые).',
        tradition:'ТКМ: «густая кровь» — застой ци, пассивность. Даосские практики движения как противовес.' },
      { key:'triglycerides', label:'Триглицериды', unit:'ммоль/л', optimal:'<1.7', warning:'1.7–5.6', danger:'>5.6',
        science:'Высокие триглицериды отражают избыток сахара и алкоголя в питании, инсулинорезистентность.',
        psychology:'Связаны с метаболическим синдромом, который коррелирует с депрессией и тревогой.',
        lifestyle:'Ограничение сахара и алкоголя — основная интервенция. Омега-3, аэробная активность.',
        tradition:'Аюрведа: избыток «ама» (токсины от непереваренной пищи) — метафора метаболического засорения.' },
    ]
  },
  {
    group: 'Воспаление',
    emoji: '🟠',
    fields: [
      { key:'crp', label:'вч-СРБ', unit:'мг/л', optimal:'<1.0', warning:'1.0–3.0', danger:'>3.0',
        science:'Маркер системного воспаления. Повышенный СРБ — общий механизм атеросклероза, диабета, деменции и депрессии.',
        psychology:'«Воспалительная депрессия» — отдельный субтип. Нейровоспаление повышает IL-6 и TNF-α при депрессии.',
        lifestyle:'Средиземноморская диета снижает СРБ на 20%. Сон, движение, снижение стресса — ключевые интервенции.',
        tradition:'Аюрведа: «питта-избыток» — внутренний жар. Охлаждающие практики, природа, медитация.' },
      { key:'homocysteine', label:'Гомоцистеин', unit:'мкмоль/л', optimal:'<9', warning:'9–15', danger:'>15',
        science:'При нарушении метилирования накапливается и повреждает сосуды. При MTHFR — особенно важен мониторинг.',
        psychology:'Высокий гомоцистеин снижает синтез серотонина, дофамина, норадреналина → депрессия, деменция.',
        lifestyle:'Метилфолат (B9), метилкобаламин (B12), B6 — снижают гомоцистеин. При MTHFR — активные формы витаминов.',
        tradition:'Нарушение трансформации на клеточном уровне — метафора застывших паттернов.' },
    ]
  },
  {
    group: 'Гормоны',
    emoji: '🟡',
    fields: [
      { key:'testosterone_total', label:'Тестостерон общий', unit:'нмоль/л', optimal:'15–35', warning:'10–15', danger:'<10',
        science:'Влияет на мышечную массу, либидо, настроение и когницию. Снижается на 1–2% в год после 30.',
        psychology:'Влияет на дофаминергическую систему: мотивацию, инициативу, уверенность. Низкий → апатия, ангедония.',
        lifestyle:'Сон критически важен: 5 ч/нед → -10–15% тестостерона. Силовые тренировки, снижение висцерального жира.',
        tradition:'Даосская концепция «цзин» — жизненная сила которая истощается при стрессе и недосыпании.' },
      { key:'cortisol', label:'Кортизол (утро)', unit:'нмоль/л', optimal:'300–500', warning:'200–300', danger:'<150 или >600',
        science:'Основной гормон стресса. Хронически высокий → атрофия гиппокампа, инсулинорезистентность, иммуносупрессия.',
        psychology:'Биохимический субстрат тревоги. Руминация поддерживает кортизол повышенным без внешнего стрессора.',
        lifestyle:'Регулярный подъём нормализует ритм. Zone 2 снижает базальный кортизол. 20 мин в лесу → -12%.',
        tradition:'Буддийская «дукха» — фоновое напряжение. Практики присутствия как выход из режима угрозы.' },
      { key:'tsh', label:'ТТГ', unit:'мМЕ/л', optimal:'1.0–2.5', warning:'2.5–4.0', danger:'>4.0 или <0.4',
        science:'Регулирует щитовидную железу. Высокий ТТГ → гипотиреоз. Часто пропускают при депрессии.',
        psychology:'Гипотиреоз: депрессия, туман, замедленность. Гипертиреоз: тревога, бессонница, паника.',
        lifestyle:'Йод, селен, цинк — кофакторы. Хронический стресс через кортизол подавляет конверсию T4→T3.',
        tradition:'Йога: вишудха-чакра (горловой центр) — самовыражение. Подавленный голос и нарушения щитовидной.' },
    ]
  },
  {
    group: 'Питание',
    emoji: '🟢',
    fields: [
      { key:'vitamin_d', label:'Витамин D', unit:'нмоль/л', optimal:'>75', warning:'30–75', danger:'<30',
        science:'Стероидный гормон. Рецепторы во всех тканях. 80% людей умеренного климата — в дефиците.',
        psychology:'Участвует в нейрогенезе гиппокампа. Дефицит коррелирует с депрессией, SAD, тревогой.',
        lifestyle:'20–30 мин солнца в полдень. D3+K2 добавки 2000–5000 МЕ. Магний — кофактор активации.',
        tradition:'Солнце как источник жизни — универсальный архетип. Сурья намаскар — физическое взаимодействие со светом.' },
      { key:'vitamin_b12', label:'Витамин B12', unit:'пмоль/л', optimal:'>300', warning:'150–300', danger:'<150',
        science:'Необходим для миелинизации нервов. Дефицит развивается медленно, проявляется неврологически.',
        psychology:'Дефицит → туман, депрессия, раздражительность. Часто ошибочно диагностируется как деменция.',
        lifestyle:'Мясо, рыба, яйца, молочное. Добавки: метилкобаламин предпочтительнее цианокобаламина.',
        tradition:'Длительные посты и веганство в традициях — риск дефицита B12, который компенсировали ритуальным мясом.' },
      { key:'ferritin', label:'Ферритин', unit:'мкг/л', optimal:'70–150', warning:'30–70', danger:'<30',
        science:'Депо железа. Снижение влияет на самочувствие задолго до анемии. Кофактор митохондрий.',
        psychology:'Дефицит → усталость, туман, тревога, депрессия. Снижает дофамин (тирозингидроксилаза).',
        lifestyle:'Гемовое железо (мясо) усваивается лучше. Витамин С улучшает усвоение негемового. Кофе снижает.',
        tradition:'Кровь как носитель жизненной силы во всех традициях. «Истощение крови» в ТКМ — усталость и тревога.' },
      { key:'omega3_index', label:'Омега-3 индекс', unit:'%', optimal:'>8', warning:'4–8', danger:'<4',
        science:'% EPA+DHA в эритроцитах. >8% → риск внезапной сердечной смерти в 10 раз ниже (Harris 2004).',
        psychology:'DHA — основной структурный жир мозга. Дефицит связан с депрессией, тревогой, СДВГ.',
        lifestyle:'Жирная рыба 2–3 раза в неделю. Добавки EPA+DHA 2–4 г/день для коррекции. ALA не заменяет.',
        tradition:'Рыба как священная пища в прибрежных традициях. Христианский пост с рыбой — поддерживал омега-3.' },
    ]
  },
]

const ALL_FIELDS = METRICS.flatMap(g => g.fields)

function PrismModal({ field, onClose }) {
  const [tab, setTab] = useState('science')
  const tabs = [
    { key:'science', label:'🔬 Наука' },
    { key:'psychology', label:'🧠 Психология' },
    { key:'lifestyle', label:'⚡ Образ жизни' },
    { key:'tradition', label:'🌿 Традиция' },
  ]
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:s.surface, border:`1px solid ${s.border2}`, borderRadius:20, padding:24, maxWidth:460, width:'100%', maxHeight:'80vh', overflow:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:500, color:s.text }}>{field.label}</div>
            <div style={{ fontSize:12, color:s.dim, marginTop:2 }}>Оптимум: {field.optimal} {field.unit}</div>
          </div>
          <button onClick={onClose} style={{ fontSize:20, color:s.dim, background:'none', border:'none', cursor:'pointer', lineHeight:1 }}>×</button>
        </div>
        <div style={{ display:'flex', gap:4, marginBottom:16, background:s.surface2, borderRadius:10, padding:3 }}>
          {tabs.map(t => (
            <div key={t.key} onClick={() => setTab(t.key)} style={{ flex:1, padding:'7px 4px', borderRadius:8, fontSize:11, textAlign:'center', cursor:'pointer', background:tab===t.key ? s.surface : 'transparent', color:tab===t.key ? s.text : s.dim, fontWeight:tab===t.key ? 500 : 300, transition:'all 0.15s' }}>
              {t.label}
            </div>
          ))}
        </div>
        <div style={{ fontSize:13, color:s.dim, lineHeight:1.8 }}>{field[tab]}</div>
      </div>
    </div>
  )
}

function getStatus(key, value) {
  if (!value) return null
  const field = ALL_FIELDS.find(f => f.key === key)
  if (!field) return null
  const v = parseFloat(value)
  const opt = field.optimal
  const optMatch = opt.match(/^([\d.]+)–([\d.]+)$/)
  if (optMatch) {
    const lo = parseFloat(optMatch[1]), hi = parseFloat(optMatch[2])
    if (v >= lo && v <= hi) return 'optimal'
    if (v < lo * 0.7 || v > hi * 1.5) return 'danger'
    return 'warning'
  }
  const ltMatch = opt.match(/^<([\d.]+)$/)
  if (ltMatch) {
    const hi = parseFloat(ltMatch[1])
    if (v < hi) return 'optimal'
    if (v < hi * 1.5) return 'warning'
    return 'danger'
  }
  const gtMatch = opt.match(/^>([\d.]+)$/)
  if (gtMatch) {
    const lo = parseFloat(gtMatch[1])
    if (v > lo) return 'optimal'
    if (v > lo * 0.7) return 'warning'
    return 'danger'
  }
  return null
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
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [history, setHistory] = useState([])
  const [values, setValues] = useState({})
  const [labName, setLabName] = useState('')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [infoField, setInfoField] = useState(null)
  const [tab, setTab] = useState('input')
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
        const uid = authData.session.user.id
        const [{ data: hist }] = await Promise.all([
          supabase.from('health_metrics').select('*').eq('user_id', uid).order('date', { ascending: false }).limit(50),
          loadBiomarkers(uid),
        ])
        setHistory(hist || [])
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

        console.log('[handleUpload] data.records:', JSON.stringify(data.records, null, 2))

        if (data.records && data.records.length > 0) {
          for (const record of data.records) {
            const resolvedLabName = record.lab_name || labName || null

            // Save all biomarkers to health_biomarkers
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
              const { error } = await supabase
                .from('health_biomarkers')
                .upsert(rows, { onConflict: 'user_id,date,key' })
              if (error) console.error('[handleUpload] health_biomarkers error:', error)
            }

            // Save standard 22 fields to health_metrics for backward compat
            if (record.found && Object.keys(record.found).length > 0) {
              const payload = { user_id: user.id, date: record.date, lab_name: resolvedLabName, notes: notes || null }
              Object.entries(record.found).forEach(([key, val]) => { if (val !== null) payload[key] = val })
              await supabase.from('health_metrics').upsert(payload, { onConflict: 'user_id,date' })
            }
          }

          // Show most recent record in the manual form
          const last = [...data.records].sort((a, b) => b.date.localeCompare(a.date))[0]
          setValues(prev => {
            const updated = { ...prev }
            Object.entries(last.found || {}).forEach(([key, val]) => { if (val !== null) updated[key] = String(val) })
            return updated
          })
          if (last.lab_name) setLabName(last.lab_name)
          if (last.date) setDate(last.date)

          // Reload both tables
          await Promise.all([
            supabase.from('health_metrics').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(50)
              .then(({ data: hist }) => setHistory(hist || [])),
            loadBiomarkers(user.id),
          ])

          const savedDates = data.records.map(r => r.date).join(', ')
          const flaggedCount = data.records.reduce((sum, r) => sum + (r.biomarkers || []).filter(b => b.is_flagged).length, 0)
          setUploadResult({
            success: true,
            count: data.total_count,
            dates: data.dates_found,
            savedDates,
            flaggedCount,
            text: data.summary,
          })
        } else {
          setUploadResult({
            success: false,
            text: 'Не удалось распознать показатели. Попробуй другой файл.',
          })
        }
        setUploading(false)
      }
      reader.readAsDataURL(file)
    } catch(e) {
      setUploadResult({ success: false, text: 'Ошибка при обработке файла.' })
      setUploading(false)
    }
  }

  async function save() {
    if (!user) return
    setSaving(true)
    const payload = { user_id: user.id, date, lab_name: labName || null, notes: notes || null }
    ALL_FIELDS.forEach(f => {
      if (values[f.key]) payload[f.key] = parseFloat(values[f.key])
    })
    const { error } = await supabase.from('health_metrics').upsert(payload, { onConflict: 'user_id,date' })
    if (!error) {
      setSaved(true)
      const { data: hist } = await supabase.from('health_metrics').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(50)
      setHistory(hist || [])
    }
    setSaving(false)
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', background:s.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ fontSize:14, color:s.dim }}>Загружаем...</div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:s.bg, color:s.text, fontFamily:"'DM Sans',sans-serif", fontWeight:300, paddingBottom:80 }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {infoField && <PrismModal field={infoField} onClose={() => setInfoField(null)} />}

      <header style={{ padding:'14px 20px', borderBottom:`1px solid ${s.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <button onClick={() => router.push('/dashboard')} style={{ fontSize:13, color:s.dim, background:'none', border:'none', cursor:'pointer' }}>← Dashboard</button>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontFamily:"'Playfair Display',serif", fontSize:16, color:s.accent }}>🩺 Чекапы</span>
        </div>
        <button onClick={() => router.push('/assistant')} style={{ fontSize:12, color:s.info, background:'rgba(110,168,200,0.08)', border:`1px solid rgba(110,168,200,0.2)`, borderRadius:8, padding:'5px 10px', cursor:'pointer' }}>
          Обсудить →
        </button>
      </header>

      <div style={{ margin:'16px 16px 0', padding:'14px 16px', background:'rgba(110,168,200,0.06)', border:`1px solid rgba(110,168,200,0.15)`, borderRadius:12, fontSize:12, color:'#6ea8c8', lineHeight:1.7 }}>
        <strong>Образовательный инструмент, не медицинский сервис.</strong> Загружай данные своих анализов чтобы видеть динамику и понимать что они означают. Любые решения обсуждай с врачом.
      </div>

      <div style={{ maxWidth:560, margin:'0 auto', padding:'16px 16px' }}>

        {/* Tabs */}
        <div style={{ display:'flex', gap:4, marginBottom:20, background:s.surface, borderRadius:12, padding:4, border:`1px solid ${s.border}` }}>
          {[['input','📥 Ввести'],['history','📋 История'],['dynamics','📈 Динамика']].map(([t,l]) => (
            <div key={t} onClick={() => setTab(t)} style={{ flex:1, padding:'8px', borderRadius:8, fontSize:13, textAlign:'center', cursor:'pointer', background:tab===t ? s.surface2 : 'transparent', color:tab===t ? s.text : s.dim, fontWeight:tab===t ? 500 : 300, transition:'all 0.15s' }}>
              {l}
            </div>
          ))}
        </div>

        {/* ── Ввод ── */}
        {tab === 'input' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14, animation:'fadeUp 0.3s forwards' }}>

            <div style={{ background:s.surface, border:`1px solid ${s.border}`, borderRadius:14, padding:'16px' }}>
              <div style={{ display:'flex', gap:10 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, color:s.muted, marginBottom:6 }}>Дата анализов</div>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width:'100%', background:s.surface2, border:`1px solid ${s.border}`, borderRadius:8, padding:'8px 10px', color:s.text, fontSize:13, outline:'none', boxSizing:'border-box' }} />
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, color:s.muted, marginBottom:6 }}>Лаборатория</div>
                  <input value={labName} onChange={e => setLabName(e.target.value)} placeholder="Инвитро, Гемотест..." style={{ width:'100%', background:s.surface2, border:`1px solid ${s.border}`, borderRadius:8, padding:'8px 10px', color:s.text, fontSize:13, outline:'none', boxSizing:'border-box' }} />
                </div>
              </div>
            </div>

            <div style={{ background:s.surface, border:`1px solid ${s.border}`, borderRadius:14, padding:'16px' }}>
              <div style={{ fontSize:11, color:s.muted, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:12 }}>📎 Загрузить анализы</div>
              <input ref={fileInputRef} type="file" accept="image/*,.pdf,application/pdf" style={{ display:'none' }} onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{ width:'100%', padding:'12px', borderRadius:10, background: uploading ? s.surface2 : 'rgba(110,168,200,0.1)', border:`1px solid ${uploading ? s.border : 'rgba(110,168,200,0.25)'}`, color: uploading ? s.muted : '#6ea8c8', fontSize:13, cursor: uploading ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, transition:'all 0.2s' }}
              >
                {uploading
                  ? <><span style={{ animation:'spin 1s linear infinite', display:'inline-block' }}>◌</span> Распознаю показатели...</>
                  : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Фото или PDF с анализами</>
                }
              </button>
              {uploadResult && (
                <div style={{ marginTop:10, padding:'10px 12px', borderRadius:10, background: uploadResult.success ? 'rgba(122,184,122,0.08)' : 'rgba(224,112,112,0.08)', border:`1px solid ${uploadResult.success ? 'rgba(122,184,122,0.25)' : 'rgba(224,112,112,0.2)'}`, fontSize:12, color: uploadResult.success ? s.green : s.red, lineHeight:1.6 }}>
                  {uploadResult.success
                    ? `✓ Сохранено ${uploadResult.dates} ${uploadResult.dates === 1 ? 'запись' : 'записей'}, ${uploadResult.count} показателей${uploadResult.flaggedCount > 0 ? `, из них ${uploadResult.flaggedCount} вне нормы` : ''}. Даты: ${uploadResult.savedDates}. `
                    : ''
                  }{uploadResult.text}
                </div>
              )}
              <div style={{ marginTop:8, fontSize:11, color:s.muted, lineHeight:1.6 }}>
                Загрузи фото бланка или PDF из лаборатории — ИИ распознает все даты и заполнит динамику.
              </div>
            </div>

            {METRICS.map(group => (
              <div key={group.group} style={{ background:s.surface, border:`1px solid ${s.border}`, borderRadius:14, padding:'16px' }}>
                <div style={{ fontSize:11, color:s.muted, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:14 }}>
                  {group.emoji} {group.group}
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {group.fields.map(field => {
                    const status = getStatus(field.key, values[field.key])
                    const sc = status ? STATUS_COLORS[status] : null
                    return (
                      <div key={field.key} style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                            <span style={{ fontSize:12, color:s.dim }}>{field.label}</span>
                            <button onClick={() => setInfoField(field)} style={{ width:18, height:18, borderRadius:'50%', border:`1px solid rgba(200,184,154,0.3)`, background:'rgba(200,184,154,0.08)', color:s.accent, fontSize:10, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>?</button>
                            <span style={{ fontSize:10, color:s.muted, marginLeft:'auto' }}>{field.optimal} {field.unit}</span>
                          </div>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <input type="number" step="0.1" value={values[field.key] || ''} onChange={e => { setValues(v => ({...v, [field.key]: e.target.value})); setSaved(false) }} placeholder="—" style={{ flex:1, background: sc ? sc.bg : s.surface2, border:`1px solid ${sc ? sc.border : s.border}`, borderRadius:8, padding:'8px 10px', color: sc ? sc.text : s.text, fontSize:13, outline:'none' }} />
                            <span style={{ fontSize:11, color:s.muted, width:60, flexShrink:0 }}>{field.unit}</span>
                            {sc && <div style={{ width:8, height:8, borderRadius:'50%', background:sc.dot, flexShrink:0 }} />}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            <div style={{ background:s.surface, border:`1px solid ${s.border}`, borderRadius:14, padding:'16px' }}>
              <div style={{ fontSize:11, color:s.muted, marginBottom:8 }}>Заметки к анализам</div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Контекст, самочувствие, что менял перед анализами..." rows={3} style={{ width:'100%', background:s.surface2, border:`1px solid ${s.border}`, borderRadius:8, padding:'10px 12px', color:s.text, fontFamily:"'DM Sans',sans-serif", fontSize:13, outline:'none', resize:'none', boxSizing:'border-box' }} />
            </div>

          </div>
        )}

        {/* ── История ── */}
        {tab === 'history' && (() => {
          // Group biomarkerRows by date
          const byDate = {}
          for (const row of biomarkerRows) {
            if (!byDate[row.date]) byDate[row.date] = { date: row.date, lab_name: row.lab_name, items: [] }
            byDate[row.date].items.push(row)
          }
          const dateGroups = Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date))

          if (dateGroups.length === 0) {
            return (
              <div style={{ display:'flex', flexDirection:'column', gap:10, animation:'fadeUp 0.3s forwards' }}>
                <div style={{ textAlign:'center', padding:'40px 20px', border:`1px dashed ${s.border}`, borderRadius:14 }}>
                  <div style={{ fontSize:14, color:s.dim }}>Ещё нет данных чекапов</div>
                </div>
              </div>
            )
          }

          return (
            <div style={{ display:'flex', flexDirection:'column', gap:10, animation:'fadeUp 0.3s forwards' }}>
              {dateGroups.map((group, i) => {
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
                            {b.name}: <strong>{b.value}</strong>{b.unit ? ` ${b.unit}` : ''}
                            {b.is_flagged && ' ⚠'}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}

        {/* ── Динамика ── */}
        {tab === 'dynamics' && (
          <div style={{ animation:'fadeUp 0.3s forwards' }}>
            <DynamicsTab biomarkerRows={biomarkerRows} />
          </div>
        )}

      </div>

      {tab === 'input' && (
        <div style={{ position:'fixed', bottom:0, left:0, right:0, padding:'14px 20px', background:s.bg, borderTop:`1px solid ${s.border}` }}>
          <div style={{ maxWidth:560, margin:'0 auto' }}>
            <button onClick={save} disabled={saving} style={{ width:'100%', padding:'13px', borderRadius:14, background: saved ? 'rgba(122,184,122,0.15)' : s.accent, color: saved ? s.green : s.bg, border: saved ? `1px solid rgba(122,184,122,0.3)` : 'none', fontSize:14, fontWeight:500, cursor:saving ? 'default' : 'pointer', fontFamily:"'DM Sans',sans-serif", transition:'all 0.3s' }}>
              {saved ? '✓ Сохранено' : saving ? 'Сохраняем...' : 'Сохранить анализы'}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

export default function CheckupsPage() {
  return <Suspense><CheckupsContent /></Suspense>
}
