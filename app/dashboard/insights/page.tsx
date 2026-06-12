// @ts-nocheck
'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ── Design tokens ──────────────────────────────────────────────
const s = {
  bg:     '#07090D',
  text:   '#F2F0EA',
  dim:    'rgba(255,255,255,0.50)',
  muted:  'rgba(255,255,255,0.28)',
  faint:  'rgba(255,255,255,0.07)',
  energy:     '#6AA8FF',
  mood:       '#B18DFF',
  meaning:    '#52FF9A',
  connection: '#FFB84D',
  error:      '#FF5A5A',
}

const DIM_CONFIG = {
  energy:     { label: 'Энергия',    emoji: '⚡', color: '#6AA8FF' },
  mood:       { label: 'Настроение', emoji: '🌊', color: '#B18DFF' },
  meaning:    { label: 'Смысл',      emoji: '🌱', color: '#52FF9A' },
  connection: { label: 'Связь',      emoji: '🤝', color: '#FFB84D' },
}

// ── Bottom Nav ─────────────────────────────────────────────────
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
      position: 'fixed', bottom: 'calc(20px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)',
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

// ── Smooth SVG path ────────────────────────────────────────────
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

// ── Glow Line Chart (7-day) ────────────────────────────────────
function GlowLineChart({ logs, dim, width = '100%', height = 100 }) {
  const cfg = DIM_CONFIG[dim]
  const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

  const result = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    const log = logs.find(l => l.date === dateStr)
    result.push({ value: log?.[dim] ?? null, label: days[d.getDay() === 0 ? 6 : d.getDay() - 1] })
  }

  const W = 320, H = 90, padX = 12, padY = 10
  const w = W - padX * 2, h = H - padY * 2
  const vals = result.map(r => r.value).filter(v => v != null)
  if (vals.length < 2) {
    return (
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: H + 20 }}>
        {result.map((d, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.05)' }} />
            <div style={{ fontSize: 9, color: s.muted }}>{d.label}</div>
          </div>
        ))}
      </div>
    )
  }

  const min = Math.min(...vals) - 0.5
  const max = Math.max(...vals) + 0.5
  const range = max - min || 1

  const points = result.map((d, i) => {
    if (d.value == null) return null
    return [padX + (i / 6) * w, padY + (1 - (d.value - min) / range) * h]
  })

  const segments = []
  let seg = []
  for (let i = 0; i < points.length; i++) {
    if (points[i]) { seg.push(points[i]) }
    else if (seg.length) { segments.push(seg); seg = [] }
  }
  if (seg.length) segments.push(seg)

  const uid = cfg.color.replace('#', 'glc')

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, overflow: 'visible' }}>
        <defs>
          <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {/* Grid lines */}
        {[0, 5, 10].map(v => {
          const y = padY + (1 - (v - min) / range) * h
          if (y < padY - 2 || y > H - padY + 2) return null
          return <line key={v} x1={padX} y1={y} x2={W - padX} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        })}
        {/* Glow stroke (thick blur) */}
        {segments.map((seg, si) => seg.length >= 2 && (
          <path key={`g${si}`} d={smoothPath(seg)} fill="none" stroke={cfg.color}
            strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"
            opacity="0.2" filter={`url(#${uid}-glow)`} />
        ))}
        {/* Main stroke */}
        {segments.map((seg, si) => seg.length >= 2 && (
          <path key={`m${si}`} d={smoothPath(seg)} fill="none" stroke={cfg.color}
            strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        ))}
        {/* Dots on data points */}
        {points.map((pt, i) => pt && (
          <circle key={i} cx={pt[0]} cy={pt[1]} r="4" fill={cfg.color}
            style={{ filter: `drop-shadow(0 0 6px ${cfg.color})` }} />
        ))}
        {/* Value labels */}
        {result.map((d, i) => d.value != null && (
          <text key={i} x={padX + (i / 6) * w} y={padY + (1 - (d.value - min) / range) * h - 10}
            textAnchor="middle" fontSize="9" fill={cfg.color} opacity="0.8">{d.value}</text>
        ))}
      </svg>
      {/* Day labels */}
      <div style={{ display: 'flex', paddingLeft: padX, paddingRight: padX, marginTop: 4 }}>
        {result.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: s.muted }}>{d.label}</div>
        ))}
      </div>
    </div>
  )
}

// ── Wellbeing trend chart ──────────────────────────────────────
function WellbeingLineChart({ data }) {
  const color = s.energy
  if (!data || data.length < 2) return (
    <div style={{ textAlign: 'center', padding: '20px', color: s.muted, fontSize: 13 }}>Недостаточно данных</div>
  )
  const W = 320, H = 80, padX = 12, padY = 8
  const w = W - padX * 2, h = H - padY * 2
  const vals = data.map(l => parseFloat(l.wellbeing_index))
  const min = Math.min(...vals) - 0.3
  const max = Math.max(...vals) + 0.3
  const range = max - min || 1
  const coords = data.map((l, i) => [
    padX + (i / (data.length - 1)) * w,
    padY + (1 - (parseFloat(l.wellbeing_index) - min) / range) * h,
  ])
  const path = smoothPath(coords)
  const uid = 'wbi'
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, overflow: 'visible' }}>
      <defs>
        <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <path d={path} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"
        opacity="0.15" filter={`url(#${uid}-glow)`} />
      <path d={path} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r="5" fill={color}
        style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
    </svg>
  )
}

// ── Insight card ───────────────────────────────────────────────
function InsightCard({ insight }) {
  const colors = {
    positive: { bg: `${s.meaning}0D`, border: `${s.meaning}30`, dot: s.meaning },
    warning:  { bg: `${s.error}0D`,   border: `${s.error}28`,   dot: s.error },
    neutral:  { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', dot: s.muted },
  }
  const c = colors[insight.type] || colors.neutral
  return (
    <div style={{
      background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 20, padding: '16px 18px',
      animation: 'fadeUp 0.3s forwards', opacity: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: c.dot, flexShrink: 0, marginTop: 6,
          boxShadow: insight.type !== 'neutral' ? `0 0 8px ${c.dot}80` : 'none' }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: s.text, marginBottom: 5 }}>{insight.title}</div>
          <div style={{ fontSize: 12, color: s.dim, lineHeight: 1.75 }}>{insight.body}</div>
        </div>
      </div>
    </div>
  )
}

// ── Avg helper ─────────────────────────────────────────────────
const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '—'

// ── Main content ───────────────────────────────────────────────
function InsightsContent() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [logs, setLogs] = useState([])
  const [summaries, setSummaries] = useState([])
  const [currentWeekData, setCurrentWeekData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [activeTab, setActiveTab] = useState('week')
  const [activeDim, setActiveDim] = useState('energy')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.push('/'); return }
      const u = data.session.user
      setUser(u)

      try {
        const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30)
        const { data: logsData, error: logsErr } = await supabase
          .from('daily_logs').select('*').eq('user_id', u.id)
          .gte('date', monthAgo.toISOString().split('T')[0]).order('date')

        const { data: sumData, error: sumErr } = await supabase
          .from('weekly_summaries').select('*').eq('user_id', u.id)
          .order('week_start', { ascending: false }).limit(8)

        if (logsErr || sumErr) throw logsErr || sumErr

        setLogs(logsData || [])
        setSummaries(sumData || [])

        const weekStart = getWeekStart()
        const existing = sumData?.find(s => s.week_start === weekStart)
        if (existing) setCurrentWeekData(existing)
      } catch (e) {
        setError('Не удалось загрузить данные. Проверьте соединение.')
      }

      setLoading(false)
    }).catch(() => {
      setError('Ошибка авторизации.')
      setLoading(false)
    })
  }, [])

  function getWeekStart() {
    const d = new Date()
    const day = d.getDay() || 7
    d.setDate(d.getDate() - day + 1)
    return d.toISOString().split('T')[0]
  }

  function getWeekEnd() {
    const d = new Date()
    const day = d.getDay() || 7
    d.setDate(d.getDate() - day + 7)
    return d.toISOString().split('T')[0]
  }

  async function generateInsights() {
    if (!user) return
    setGenerating(true)
    try {
      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, weekStart: getWeekStart(), weekEnd: getWeekEnd() }),
      })
      const data = await res.json()
      if (data.insights) {
        setCurrentWeekData({ ...data.aggregates, ...data.insights, insights: data.insights.insights })
        setSummaries(prev => [{ week_start: getWeekStart(), ...data.aggregates, ...data.insights }, ...prev.filter(s => s.week_start !== getWeekStart())])
      }
    } catch (e) { console.error(e) }
    setGenerating(false)
  }

  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
  const weekLogs = logs.filter(l => new Date(l.date) >= weekAgo)

  const weekAvgs = {
    energy:     avg(weekLogs.filter(l => l.energy).map(l => l.energy)),
    mood:       avg(weekLogs.filter(l => l.mood).map(l => l.mood)),
    meaning:    avg(weekLogs.filter(l => l.meaning).map(l => l.meaning)),
    connection: avg(weekLogs.filter(l => l.connection).map(l => l.connection)),
    anxiety:    avg(weekLogs.filter(l => l.anxiety_level).map(l => l.anxiety_level)),
  }

  const wellbeingTrend = logs.filter(l => l.wellbeing_index).slice(-14)

  if (loading) return (
    <div style={{ minHeight: '100vh', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.08)', borderTop: `2px solid ${s.energy}`, animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{
        background: 'linear-gradient(155deg,rgba(255,90,90,0.08) 0%,rgba(255,255,255,0.02) 100%)',
        border: '1px solid rgba(255,90,90,0.2)', borderRadius: 28, padding: '32px 28px', textAlign: 'center', maxWidth: 320,
      }}>
        <div style={{ fontSize: 28, marginBottom: 14 }}>⚠</div>
        <div style={{ fontSize: 14, color: s.text, marginBottom: 8 }}>{error}</div>
        <button onClick={() => window.location.reload()} style={{
          marginTop: 16, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 999, padding: '10px 24px', color: s.dim, fontSize: 13, cursor: 'pointer',
        }}>Попробовать снова</button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: s.bg, color: s.text, fontFamily: "'DM Sans',-apple-system,sans-serif", fontWeight: 300, paddingBottom: 110 }}>
      <style>{`
        @keyframes fadeUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        @keyframes orbFloat{ 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(10px,-8px) scale(1.06)} }
      `}</style>

      {/* Header */}
      <header style={{ padding: '22px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', animation: 'fadeUp 0.4s ease forwards' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => router.push('/dashboard')} style={{ fontSize: 13, color: s.muted, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>←</button>
          <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, color: s.text, opacity: 0.9 }}>Инсайты</span>
        </div>
        <button
          onClick={generateInsights}
          disabled={generating}
          style={{
            fontSize: 12, padding: '8px 16px', borderRadius: 999,
            background: generating ? 'rgba(255,255,255,0.04)' : `${s.energy}18`,
            border: `1px solid ${generating ? 'rgba(255,255,255,0.08)' : `${s.energy}35`}`,
            color: generating ? s.muted : s.energy,
            cursor: generating ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
          {generating
            ? <><span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>◌</span> Анализирую...</>
            : '✦ Анализ недели'}
        </button>
      </header>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '22px 18px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Tab bar */}
        <div style={{
          display: 'flex', gap: 2, padding: '5px',
          background: 'linear-gradient(155deg,rgba(255,255,255,0.055) 0%,rgba(255,255,255,0.02) 100%)',
          backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20,
          animation: 'fadeUp 0.45s ease forwards',
        }}>
          {[['week', '📊 Неделя'], ['trends', '📈 Тренды'], ['history', '📋 История']].map(([t, l]) => (
            <button key={t} onClick={() => setActiveTab(t)} style={{
              flex: 1, padding: '9px 12px', borderRadius: 15, fontSize: 13, textAlign: 'center', cursor: 'pointer', border: 'none',
              background: activeTab === t ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: activeTab === t ? s.text : s.muted,
              fontWeight: activeTab === t ? 500 : 300,
              transition: 'all 0.15s',
            }}>{l}</button>
          ))}
        </div>

        {/* ── НЕДЕЛЯ ── */}
        {activeTab === 'week' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeUp 0.3s forwards' }}>

            {/* 4 dimensions overview */}
            <div style={{
              background: 'linear-gradient(155deg,rgba(255,255,255,0.07) 0%,rgba(255,255,255,0.025) 100%)',
              backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
              border: '1px solid rgba(255,255,255,0.09)', borderRadius: 28,
              padding: '22px 20px', position: 'relative', overflow: 'hidden',
              boxShadow: '0 0 60px rgba(106,168,255,0.05)',
            }}>
              <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle,rgba(106,168,255,0.1) 0%,transparent 65%)', animation: 'orbFloat 8s ease-in-out infinite', pointerEvents: 'none' }} />
              <div style={{ fontSize: 11, color: s.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 18, position: 'relative' }}>
                Средние показатели · 7 дней
              </div>
              {Object.entries(DIM_CONFIG).map(([key, cfg]) => {
                const val = weekAvgs[key]
                const pct = val === '—' ? 0 : (parseFloat(val) / 10) * 100
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, position: 'relative' }}>
                    <span style={{ fontSize: 16, width: 22, flexShrink: 0 }}>{cfg.emoji}</span>
                    <span style={{ fontSize: 13, color: s.dim, width: 96, flexShrink: 0 }}>{cfg.label}</span>
                    <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: cfg.color, borderRadius: 2, boxShadow: `0 0 8px ${cfg.color}60`, transition: 'width 0.6s ease' }} />
                    </div>
                    <span style={{ fontSize: 16, fontWeight: 500, color: val === '—' ? s.muted : cfg.color, width: 32, textAlign: 'right', flexShrink: 0, textShadow: val !== '—' ? `0 0 16px ${cfg.color}80` : 'none' }}>
                      {val}
                    </span>
                  </div>
                )
              })}
              {weekLogs.length > 0 && (
                <div style={{ marginTop: 4, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: s.muted }}>Тревога (ниже = лучше)</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 80, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${weekAvgs.anxiety === '—' ? 0 : (parseFloat(weekAvgs.anxiety) / 10) * 100}%`, background: s.error, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 500, color: s.error, width: 32, textAlign: 'right' }}>{weekAvgs.anxiety}</span>
                  </div>
                </div>
              )}
            </div>

            {/* AI Insights */}
            {currentWeekData?.insights?.length > 0 ? (
              <div>
                <div style={{ fontSize: 11, color: s.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12, paddingLeft: 4 }}>Инсайты недели</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {currentWeekData.insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
                </div>
              </div>
            ) : (
              <div style={{
                background: 'linear-gradient(155deg,rgba(255,255,255,0.055) 0%,rgba(255,255,255,0.015) 100%)',
                backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
                border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 28, padding: '36px 24px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 28, marginBottom: 14 }}>✦</div>
                <div style={{ fontSize: 14, color: s.dim, marginBottom: 8 }}>
                  {weekLogs.length === 0 ? 'Нет данных за эту неделю' : 'Готов к анализу'}
                </div>
                <div style={{ fontSize: 12, color: s.muted, marginBottom: 20 }}>
                  {weekLogs.length === 0
                    ? 'Начни заполнять ежедневные чекины — и ИИ найдёт паттерны в твоих данных'
                    : `${weekLogs.length} ${weekLogs.length === 1 ? 'день' : 'дней'} данных — нажми «Анализ недели»`}
                </div>
                {weekLogs.length > 0 && (
                  <button onClick={generateInsights} disabled={generating} style={{
                    background: `linear-gradient(135deg,${s.energy},${s.mood})`,
                    color: '#07090D', border: 'none', borderRadius: 999,
                    padding: '12px 28px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    boxShadow: `0 0 30px ${s.energy}40`,
                  }}>
                    {generating ? 'Анализирую...' : '✦ Анализ недели'}
                  </button>
                )}
              </div>
            )}

            {/* Next focus */}
            {currentWeekData?.next_focus && (
              <div style={{
                background: `${s.meaning}0A`, border: `1px solid ${s.meaning}28`,
                borderRadius: 20, padding: '16px 20px', display: 'flex', gap: 12, alignItems: 'flex-start',
              }}>
                <span style={{ fontSize: 16, flexShrink: 0, color: s.meaning }}>→</span>
                <div>
                  <div style={{ fontSize: 11, color: s.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Фокус на следующую неделю</div>
                  <div style={{ fontSize: 13, color: s.meaning, lineHeight: 1.6 }}>{currentWeekData.next_focus}</div>
                </div>
              </div>
            )}

            {/* Summary */}
            {currentWeekData?.summary_text && (
              <div style={{
                background: 'linear-gradient(155deg,rgba(255,255,255,0.055) 0%,rgba(255,255,255,0.015) 100%)',
                backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: '18px 20px',
              }}>
                <div style={{ fontSize: 11, color: s.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Картина недели</div>
                <div style={{ fontSize: 13, color: s.dim, lineHeight: 1.75 }}>{currentWeekData.summary_text}</div>
              </div>
            )}
          </div>
        )}

        {/* ── ТРЕНДЫ ── */}
        {activeTab === 'trends' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeUp 0.3s forwards' }}>

            {/* Dim selector */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(DIM_CONFIG).map(([key, cfg]) => (
                <button key={key} onClick={() => setActiveDim(key)} style={{
                  padding: '8px 16px', borderRadius: 999,
                  border: `1px solid ${activeDim === key ? cfg.color : 'rgba(255,255,255,0.1)'}`,
                  background: activeDim === key ? `${cfg.color}18` : 'rgba(255,255,255,0.04)',
                  color: activeDim === key ? cfg.color : s.muted,
                  fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
                  boxShadow: activeDim === key ? `0 0 20px ${cfg.color}20` : 'none',
                }}>
                  {cfg.emoji} {cfg.label}
                </button>
              ))}
            </div>

            {/* Chart card */}
            <div style={{
              background: `linear-gradient(155deg,${DIM_CONFIG[activeDim].color}0D 0%,rgba(255,255,255,0.02) 100%)`,
              backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
              border: `1px solid ${DIM_CONFIG[activeDim].color}22`, borderRadius: 28,
              padding: '22px 20px', position: 'relative', overflow: 'hidden',
              boxShadow: `0 0 60px ${DIM_CONFIG[activeDim].color}0A`,
            }}>
              <div style={{ position: 'absolute', bottom: -30, right: -30, width: 140, height: 140, borderRadius: '50%', background: `radial-gradient(circle,${DIM_CONFIG[activeDim].color}18 0%,transparent 65%)`, animation: 'orbFloat 7s ease-in-out infinite', pointerEvents: 'none' }} />
              <div style={{ fontSize: 13, fontWeight: 500, color: s.text, marginBottom: 4, position: 'relative' }}>
                {DIM_CONFIG[activeDim].emoji} {DIM_CONFIG[activeDim].label} · последние 7 дней
              </div>
              <div style={{ fontSize: 12, color: s.muted, marginBottom: 18, position: 'relative' }}>
                Средняя: <span style={{ color: DIM_CONFIG[activeDim].color }}>{avg(weekLogs.filter(l => l[activeDim]).map(l => l[activeDim]))}</span>
              </div>
              {logs.length > 0 ? (
                <GlowLineChart logs={logs} dim={activeDim} />
              ) : (
                <div style={{ textAlign: 'center', padding: '24px', color: s.muted, fontSize: 13 }}>
                  Нет данных — начни заполнять чекины
                </div>
              )}
            </div>

            {/* Wellbeing index trend */}
            {wellbeingTrend.length > 0 && (
              <div style={{
                background: `linear-gradient(155deg,${s.energy}0A 0%,rgba(255,255,255,0.02) 100%)`,
                backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
                border: `1px solid ${s.energy}1A`, borderRadius: 28, padding: '22px 20px',
                boxShadow: `0 0 60px ${s.energy}08`,
              }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: s.text, marginBottom: 4 }}>🧬 Индекс благополучия · 14 дней</div>
                <div style={{ fontSize: 12, color: s.muted, marginBottom: 18 }}>
                  Среднее: <span style={{ color: s.energy }}>{avg(wellbeingTrend.map(l => parseFloat(l.wellbeing_index)))}</span>
                </div>
                <WellbeingLineChart data={wellbeingTrend} />
              </div>
            )}

            {/* Correlations */}
            {summaries.filter(s => s.top_correlation).length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: s.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12, paddingLeft: 4 }}>Паттерны из прошлых недель</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {summaries.filter(s => s.top_correlation).slice(0, 4).map((sum, i) => (
                    <div key={i} style={{
                      background: 'linear-gradient(155deg,rgba(255,255,255,0.055) 0%,rgba(255,255,255,0.015) 100%)',
                      border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: '14px 16px',
                      display: 'flex', gap: 12,
                    }}>
                      <span style={{ fontSize: 14, color: s.muted, flexShrink: 0 }}>◎</span>
                      <div>
                        <div style={{ fontSize: 11, color: s.muted, marginBottom: 4 }}>
                          {new Date(sum.week_start).toLocaleDateString('ru', { day: 'numeric', month: 'long' })}
                        </div>
                        <div style={{ fontSize: 13, color: s.dim }}>{sum.top_correlation}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ИСТОРИЯ ── */}
        {activeTab === 'history' && (
          <div style={{ animation: 'fadeUp 0.3s forwards' }}>
            {summaries.length === 0 ? (
              <div style={{
                background: 'linear-gradient(155deg,rgba(255,255,255,0.055) 0%,rgba(255,255,255,0.015) 100%)',
                backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
                border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 28,
                textAlign: 'center', padding: '60px 20px', color: s.dim, fontSize: 14,
              }}>
                История появится после первого анализа недели
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {summaries.map((sum, i) => (
                  <div key={i} style={{
                    background: 'linear-gradient(155deg,rgba(255,255,255,0.07) 0%,rgba(255,255,255,0.025) 100%)',
                    backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
                    border: '1px solid rgba(255,255,255,0.09)', borderRadius: 28, padding: '20px 22px',
                    position: 'relative', overflow: 'hidden',
                  }}>
                    <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'radial-gradient(circle,rgba(177,141,255,0.1) 0%,transparent 65%)', pointerEvents: 'none' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, position: 'relative' }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: s.text }}>
                        {new Date(sum.week_start).toLocaleDateString('ru', { day: 'numeric', month: 'long' })} — {sum.week_end && new Date(sum.week_end).toLocaleDateString('ru', { day: 'numeric', month: 'long' })}
                      </div>
                      {sum.avg_wellbeing && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 10, color: s.muted, marginBottom: 2 }}>Индекс</div>
                          <div style={{ fontSize: 22, fontWeight: 600, color: s.energy, textShadow: `0 0 20px ${s.energy}70` }}>{parseFloat(sum.avg_wellbeing).toFixed(1)}</div>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: sum.summary_text ? 12 : 0, flexWrap: 'wrap', position: 'relative' }}>
                      {['energy', 'mood', 'meaning', 'connection'].map(key => sum[`avg_${key}`] ? (
                        <div key={key} style={{
                          fontSize: 11, padding: '4px 10px', borderRadius: 999,
                          background: `${DIM_CONFIG[key].color}12`, color: DIM_CONFIG[key].color,
                          border: `1px solid ${DIM_CONFIG[key].color}28`,
                        }}>
                          {DIM_CONFIG[key].emoji} {parseFloat(sum[`avg_${key}`]).toFixed(1)}
                        </div>
                      ) : null)}
                      {sum.sprint_completion_rate && (
                        <div style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, background: `${s.meaning}12`, color: s.meaning, border: `1px solid ${s.meaning}28` }}>
                          ✓ {Math.round(sum.sprint_completion_rate * 100)}%
                        </div>
                      )}
                    </div>
                    {sum.summary_text && (
                      <div style={{ fontSize: 12, color: s.dim, lineHeight: 1.75, position: 'relative' }}>{sum.summary_text}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      <BottomNav router={router} />
    </div>
  )
}

export default function InsightsPage() {
  return <Suspense><InsightsContent /></Suspense>
}
