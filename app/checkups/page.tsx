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
        <div style={{ fontSize:13, color:s.dim, lineHeight:1.8 }}>
          {field[tab]}
        </div>
      </div>
    </div>
  )
}

function getStatus(key, value) {
  if (!value) return null
  const field = METRICS.flatMap(g => g.fields).find(f => f.key === key)
  if (!field) return null
  const v = parseFloat(value)
  const opt = field.optimal
  const warn = field.warning

  // Simple range check based on optimal string
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
  const fileInputRef = useRef(null)

  useEffect(() => {
    async function load() {
      try {
        const { data: authData } = await supabase.auth.getSession()
        if (!authData?.session) { router.push('/'); return }
        setUser(authData.session.user)

        const { data: hist } = await supabase
          .from('health_metrics').select('*')
          .eq('user_id', authData.session.user.id)
          .order('date', { ascending: false }).limit(10)
        setHistory(hist || [])
      } catch(e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  async function handleUpload(file) {
    if (!file) return
    setUploading(true)
    setUploadResult(null)
    try {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const base64 = e.target.result.split(',')[1]
        const mediaType = file.type || 'image/jpeg'
        const res = await fetch('/api/parse-labs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, mediaType }),
        })
        const data = await res.json()
        if (data.found && data.count > 0) {
          // Auto-fill found values
          setValues(prev => {
            const updated = { ...prev }
            Object.entries(data.found).forEach(([key, val]) => {
              if (val !== null) updated[key] = String(val)
            })
            return updated
          })
          if (data.lab_name) setLabName(data.lab_name)
          if (data.date) setDate(data.date)
          setUploadResult({ success: true, count: data.count, text: data.raw_text })
        } else {
          setUploadResult({ success: false, text: 'Не удалось распознать показатели. Попробуй другое фото.' })
        }
        setUploading(false)
      }
      reader.readAsDataURL(file)
    } catch(e) {
      setUploadResult({ success: false, text: 'Ошибка при обработке изображения.' })
      setUploading(false)
    }
  }

  async function save() {
    if (!user) return
    setSaving(true)
    const payload = { user_id: user.id, date, lab_name: labName || null, notes: notes || null }
    METRICS.flatMap(g => g.fields).forEach(f => {
      if (values[f.key]) payload[f.key] = parseFloat(values[f.key])
    })
    const { error } = await supabase.from('health_metrics').upsert(payload, { onConflict: 'user_id,date' })
    if (!error) {
      setSaved(true)
      const { data: hist } = await supabase.from('health_metrics').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(10)
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
          <span style={{ fontSize:10, padding:'2px 8px', borderRadius:100, background:'rgba(200,184,154,0.1)', border:`1px solid rgba(200,184,154,0.2)`, color:s.accent }}>В разработке</span>
        </div>
        <div style={{ width:60 }} />
      </header>

      {/* Disclaimer */}
      <div style={{ margin:'16px 16px 0', padding:'14px 16px', background:'rgba(110,168,200,0.06)', border:`1px solid rgba(110,168,200,0.15)`, borderRadius:12, fontSize:12, color:'#6ea8c8', lineHeight:1.7 }}>
        <strong>Образовательный инструмент, не медицинский сервис.</strong> Загружай данные своих анализов чтобы видеть динамику и понимать что они означают. Любые решения обсуждай с врачом.<br/>
        <span style={{ color:s.dim }}>Регулярные чекапы — один из самых недооценённых инструментов превентивной медицины. Большинство хронических заболеваний развиваются годами без симптомов.</span>
      </div>

      <div style={{ maxWidth:560, margin:'0 auto', padding:'16px 16px' }}>

        {/* Tabs */}
        <div style={{ display:'flex', gap:4, marginBottom:20, background:s.surface, borderRadius:12, padding:4, border:`1px solid ${s.border}` }}>
          {[['input','📥 Ввести данные'],['history','📊 История']].map(([t,l]) => (
            <div key={t} onClick={() => setTab(t)} style={{ flex:1, padding:'8px', borderRadius:8, fontSize:13, textAlign:'center', cursor:'pointer', background:tab===t ? s.surface2 : 'transparent', color:tab===t ? s.text : s.dim, fontWeight:tab===t ? 500 : 300, transition:'all 0.15s' }}>
              {l}
            </div>
          ))}
        </div>

        {tab === 'input' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14, animation:'fadeUp 0.3s forwards' }}>

            {/* Date and lab */}
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

            {/* Upload photo */}
            <div style={{ background:s.surface, border:`1px solid ${s.border}`, borderRadius:14, padding:'16px' }}>
              <div style={{ fontSize:11, color:s.muted, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:12 }}>📸 Загрузить фото анализов</div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                style={{ display:'none' }}
                onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{ width:'100%', padding:'12px', borderRadius:10, background: uploading ? s.surface2 : 'rgba(110,168,200,0.1)', border:`1px solid ${uploading ? s.border : 'rgba(110,168,200,0.25)'}`, color: uploading ? s.muted : '#6ea8c8', fontSize:13, cursor: uploading ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, transition:'all 0.2s' }}
              >
                {uploading ? (
                  <><span style={{ animation:'spin 1s linear infinite', display:'inline-block' }}>◌</span> Распознаю показатели...</>
                ) : (
                  <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Загрузить фото или PDF</>
                )}
              </button>
              {uploadResult && (
                <div style={{ marginTop:10, padding:'10px 12px', borderRadius:10, background: uploadResult.success ? 'rgba(122,184,122,0.08)' : 'rgba(224,112,112,0.08)', border:`1px solid ${uploadResult.success ? 'rgba(122,184,122,0.25)' : 'rgba(224,112,112,0.2)'}`, fontSize:12, color: uploadResult.success ? s.green : s.red, lineHeight:1.6 }}>
                  {uploadResult.success ? `✓ Найдено ${uploadResult.count} показателей. ` : ''}{uploadResult.text}
                </div>
              )}
              <div style={{ marginTop:8, fontSize:11, color:s.muted, lineHeight:1.6 }}>
                Сфотографируй бланк с результатами — ИИ автоматически распознает показатели и заполнит форму. Проверь и скорректируй при необходимости.
              </div>
            </div>

            {/* Metric groups */}
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
                            <input
                              type="number"
                              step="0.1"
                              value={values[field.key] || ''}
                              onChange={e => { setValues(v => ({...v, [field.key]: e.target.value})); setSaved(false) }}
                              placeholder="—"
                              style={{ flex:1, background: sc ? sc.bg : s.surface2, border:`1px solid ${sc ? sc.border : s.border}`, borderRadius:8, padding:'8px 10px', color: sc ? sc.text : s.text, fontSize:13, outline:'none' }}
                            />
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

            {/* Notes */}
            <div style={{ background:s.surface, border:`1px solid ${s.border}`, borderRadius:14, padding:'16px' }}>
              <div style={{ fontSize:11, color:s.muted, marginBottom:8 }}>Заметки к анализам</div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Контекст, самочувствие, что менял перед анализами..." rows={3} style={{ width:'100%', background:s.surface2, border:`1px solid ${s.border}`, borderRadius:8, padding:'10px 12px', color:s.text, fontFamily:"'DM Sans',sans-serif", fontSize:13, outline:'none', resize:'none', boxSizing:'border-box' }} />
            </div>

          </div>
        )}

        {tab === 'history' && (
          <div style={{ display:'flex', flexDirection:'column', gap:10, animation:'fadeUp 0.3s forwards' }}>
            {history.length === 0 ? (
              <div style={{ textAlign:'center', padding:'40px 20px', border:`1px dashed ${s.border}`, borderRadius:14 }}>
                <div style={{ fontSize:14, color:s.dim }}>Ещё нет данных чекапов</div>
              </div>
            ) : history.map((h, i) => (
              <div key={i} style={{ background:s.surface, border:`1px solid ${s.border}`, borderRadius:14, padding:'14px 16px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
                  <div style={{ fontSize:13, fontWeight:500 }}>
                    {new Date(h.date).toLocaleDateString('ru', { day:'numeric', month:'long', year:'numeric' })}
                  </div>
                  {h.lab_name && <div style={{ fontSize:11, color:s.dim }}>{h.lab_name}</div>}
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {METRICS.flatMap(g => g.fields).filter(f => h[f.key] != null).map(f => {
                    const status = getStatus(f.key, h[f.key])
                    const sc = status ? STATUS_COLORS[status] : { bg:s.surface2, border:s.border, text:s.dim, dot:s.muted }
                    return (
                      <div key={f.key} style={{ padding:'4px 10px', borderRadius:8, background:sc.bg, border:`1px solid ${sc.border}`, fontSize:11, color:sc.text }}>
                        {f.label}: <strong>{h[f.key]}</strong>
                      </div>
                    )
                  })}
                </div>
                {h.notes && <div style={{ marginTop:10, fontSize:12, color:s.dim }}>{h.notes}</div>}
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Save button */}
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
