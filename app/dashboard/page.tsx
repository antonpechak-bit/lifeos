// @ts-nocheck
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const DIM = {
  energy:     { label:'Энергия',    emoji:'⚡', color:'#c8a86e' },
  mood:       { label:'Настроение', emoji:'🌊', color:'#6ea8c8' },
  meaning:    { label:'Смысл',      emoji:'🌱', color:'#7ab87a' },
  connection: { label:'Связь',      emoji:'🤝', color:'#a86ec8' },
}

const s = {
  bg:'#0d0d0f', surface:'#141416', surface2:'#1a1a1e',
  border:'rgba(255,255,255,0.07)', border2:'rgba(255,255,255,0.12)',
  text:'#e8e6e0', dim:'#7a7870', muted:'#3d3d3d', accent:'#c8b89a',
  green:'#7ab87a', red:'#e07070', info:'#6ea8c8'
}

// ─── Helpers ──────────────────────────────────────────────────

function smoothPath(coords) {
  if (coords.length < 2) return ''
  if (coords.length === 2) return `M${coords[0][0]},${coords[0][1]} L${coords[1][0]},${coords[1][1]}`
  let d = `M${coords[0][0]},${coords[0][1]}`
  for (let i = 1; i < coords.length - 1; i++) {
    const mx = ((coords[i][0] + coords[i+1][0]) / 2).toFixed(1)
    const my = ((coords[i][1] + coords[i+1][1]) / 2).toFixed(1)
    d += ` Q${coords[i][0]},${coords[i][1]} ${mx},${my}`
  }
  d += ` L${coords[coords.length-1][0]},${coords[coords.length-1][1]}`
  return d
}

// ─── Glow sparkline ───────────────────────────────────────────

function GlowSparkline({ logs, dimKey, color, width=110, height=56 }) {
  const pts = (logs || [])
    .filter(l => l[dimKey] != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(l => ({ value: l[dimKey] }))

  if (pts.length < 2) return (
    <div style={{ width, height, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:6, height:6, borderRadius:'50%', background:color, opacity:0.35 }} />
    </div>
  )

  const vals = pts.map(p => p.value)
  const min = Math.min(...vals) - 0.5
  const max = Math.max(...vals) + 0.5
  const range = max - min || 1
  const padX = 6, padY = 8
  const w = width - padX*2, h = height - padY*2
  const coords = pts.map((p, i) => [
    padX + (i / (pts.length - 1)) * w,
    padY + (1 - (p.value - min) / range) * h,
  ])
  const path = smoothPath(coords)
  const last = coords[coords.length - 1]
  const uid = color.replace('#','')

  return (
    <svg width={width} height={height} style={{ flexShrink:0, overflow:'visible' }}>
      <defs>
        <filter id={`sg-${uid}`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <path d={path} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"
        opacity="0.25" filter={`url(#sg-${uid})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill={color} />
      <circle cx={last[0]} cy={last[1]} r="6"   fill={color} opacity="0.2" />
    </svg>
  )
}

// ─── Wellbeing index ring ─────────────────────────────────────

function WellbeingRing({ value, size=120 }) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const pct = value ? value / 10 : 0
  const color = s.accent
  return (
    <div style={{ position:'relative', width:size, height:size }}>
      <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={6} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
          strokeLinecap="round"
          style={{ filter:`drop-shadow(0 0 8px ${color}88)`, transition:'stroke-dashoffset 0.8s ease' }} />
      </svg>
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:1 }}>
        <span style={{ fontSize:30, fontWeight:700, color:s.accent, lineHeight:1, letterSpacing:'-0.03em' }}>
          {parseFloat(value).toFixed(1)}
        </span>
        <span style={{ fontSize:9, color:s.dim, textTransform:'uppercase', letterSpacing:'0.08em' }}>индекс</span>
      </div>
    </div>
  )
}

// ─── Dimension card (2×2 grid) ────────────────────────────────

function DimCard({ dimKey, cfg, value, weekLogs }) {
  return (
    <div style={{
      position:'relative', borderRadius:20,
      background:s.surface, border:`1px solid ${s.border}`,
      overflow:'hidden', padding:'14px 14px 12px',
      display:'flex', flexDirection:'column', justifyContent:'space-between',
      minHeight:130,
    }}>
      <div style={{
        position:'absolute', inset:0,
        background:`radial-gradient(ellipse at 85% 55%, ${cfg.color}18 0%, transparent 65%)`,
        pointerEvents:'none',
      }} />
      <div style={{ fontSize:11, color:s.dim, letterSpacing:'0.02em', position:'relative' }}>
        {cfg.emoji} {cfg.label}
      </div>
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', position:'relative' }}>
        <div>
          <div style={{ display:'flex', alignItems:'baseline', gap:3 }}>
            <span style={{ fontSize:36, fontWeight:700, color: value ? cfg.color : s.muted, lineHeight:1, letterSpacing:'-0.03em' }}>
              {value ?? '—'}
            </span>
            {value && <span style={{ fontSize:11, color:s.dim }}>/10</span>}
          </div>
        </div>
        <GlowSparkline logs={weekLogs} dimKey={dimKey} color={cfg.color} />
      </div>
    </div>
  )
}

// ─── Sprint card ──────────────────────────────────────────────

function SprintCard({ sprint, checkins, today, router }) {
  const sprintCheckins = checkins.filter(c => c.sprint_id === sprint.id)
  const doneCount = sprintCheckins.filter(c => c.completed).length
  const todayDone  = sprintCheckins.some(c => c.date === today && c.completed)
  const target     = sprint.target_days || 14
  const pct        = Math.min(doneCount / target, 1)

  const weekDays = []
  const dayLabels = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    const check   = sprintCheckins.find(c => c.date === dateStr)
    const dayIdx  = d.getDay() === 0 ? 6 : d.getDay() - 1
    weekDays.push({ dateStr, isToday: dateStr === today, done: check?.completed, missed: check && !check.completed, label: dayLabels[dayIdx] })
  }

  const r = 28, circ = 2 * Math.PI * r, size = 72

  return (
    <div style={{
      background:s.surface, border:`1px solid ${s.border}`,
      borderRadius:20, padding:'18px 18px 14px',
      position:'relative', overflow:'hidden',
    }}>
      <div style={{
        position:'absolute', inset:0,
        background:`radial-gradient(ellipse at 90% 20%, rgba(110,168,200,0.1) 0%, transparent 55%)`,
        pointerEvents:'none',
      }} />

      {/* Top row: name + arc */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 }}>
        <div style={{ flex:1, paddingRight:12 }}>
          <div style={{ fontSize:15, fontWeight:500, color:s.text, lineHeight:1.35, marginBottom:4 }}>
            {sprint.behavior_name}
          </div>
          {sprint.anchor && (
            <div style={{ fontSize:11, color:s.muted }}>⚓ {sprint.anchor}</div>
          )}
        </div>
        {/* Circular progress */}
        <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
          <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
            <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={5} />
            <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={s.info} strokeWidth={5}
              strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
              strokeLinecap="round"
              style={{ filter:`drop-shadow(0 0 6px ${s.info}88)`, transition:'stroke-dashoffset 0.6s ease' }} />
          </svg>
          <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
            <span style={{ fontSize:14, fontWeight:600, color:s.info, lineHeight:1 }}>{doneCount}</span>
            <span style={{ fontSize:9,  color:s.dim }}>/{ target}</span>
          </div>
        </div>
      </div>

      {/* Week dots */}
      <div style={{ display:'flex', gap:5, marginBottom:14 }}>
        {weekDays.map((d, i) => (
          <div key={i} style={{ flex:1, textAlign:'center' }}>
            <div style={{
              width:'100%', aspectRatio:'1', borderRadius:8,
              background: d.done   ? 'rgba(122,184,122,0.2)'
                        : d.missed ? 'rgba(224,112,112,0.12)'
                        : d.isToday? 'rgba(200,184,154,0.1)'
                        : s.surface2,
              border:`1px solid ${d.done    ? 'rgba(122,184,122,0.4)'
                                : d.missed  ? 'rgba(224,112,112,0.25)'
                                : d.isToday ? 'rgba(200,184,154,0.25)'
                                : 'transparent'}`,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:11,
              color: d.done ? s.green : d.missed ? s.red : s.muted,
              boxShadow: d.done ? `0 0 8px rgba(122,184,122,0.2)` : 'none',
            }}>
              {d.done ? '✓' : d.missed ? '×' : ''}
            </div>
            <div style={{ fontSize:9, color:s.muted, marginTop:3 }}>{d.label}</div>
          </div>
        ))}
      </div>

      <button
        onClick={() => router.push('/checkin')}
        style={{
          width:'100%', padding:'10px', borderRadius:12, border:'none',
          background: todayDone ? 'rgba(122,184,122,0.12)' : 'rgba(200,184,154,0.1)',
          border:`1px solid ${todayDone ? 'rgba(122,184,122,0.3)' : 'rgba(200,184,154,0.2)'}`,
          color: todayDone ? s.green : s.accent,
          fontSize:13, fontWeight:500, cursor:'pointer', transition:'all 0.15s',
        }}
      >
        {todayDone ? '✓ Чекин сегодня пройден' : '→ Отметить выполнение'}
      </button>
    </div>
  )
}

// ─── Bottom navigation ────────────────────────────────────────

function BottomNav({ router }) {
  const items = [
    { icon:'🏠', label:'Главная',   route:'/dashboard' },
    { icon:'⚡', label:'Чекин',     route:'/checkin' },
    { icon:'📊', label:'Инсайты',   route:'/dashboard/insights' },
    { icon:'💬', label:'Ассистент', route:'/assistant' },
    { icon:'🩺', label:'Чекапы',    route:'/checkups' },
  ]
  return (
    <nav style={{
      position:'fixed', bottom:0, left:0, right:0,
      background:'rgba(13,13,15,0.96)',
      backdropFilter:'blur(24px)',
      borderTop:`1px solid rgba(255,255,255,0.07)`,
      display:'flex', justifyContent:'space-around',
      padding:'10px 0 calc(10px + env(safe-area-inset-bottom))',
      zIndex:50,
    }}>
      {items.map(item => (
        <button key={item.route} onClick={() => router.push(item.route)}
          style={{
            display:'flex', flexDirection:'column', alignItems:'center', gap:3,
            background:'none', border:'none', cursor:'pointer', padding:'2px 12px',
            opacity: typeof window !== 'undefined' && window.location.pathname === item.route ? 1 : 0.45,
            transition:'opacity 0.15s',
          }}>
          <span style={{ fontSize:20 }}>{item.icon}</span>
          <span style={{ fontSize:9, color:s.dim, fontFamily:"'DM Sans',sans-serif", letterSpacing:'0.02em' }}>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}

// ─── Main component ───────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser]           = useState(null)
  const [sessions, setSessions]   = useState([])
  const [sprints, setSprints]     = useState([])
  const [todayLog, setTodayLog]   = useState(null)
  const [weekLogs, setWeekLogs]   = useState([])
  const [checkins, setCheckins]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [showHistory, setShowHistory] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    async function load() {
      try {
        const { data } = await supabase.auth.getSession()
        if (!data?.session) { router.push('/'); return }
        const u = data.session.user
        setUser(u)

        const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
        const weekStr = weekAgo.toISOString().split('T')[0]

        const [
          { data: sess },
          { data: spr },
          { data: logs },
          { data: checkData },
        ] = await Promise.all([
          supabase.from('sessions').select('*').eq('user_id', u.id).order('created_at', { ascending: false }),
          supabase.from('sprints').select('*').eq('user_id', u.id).eq('status','active').order('created_at', { ascending: false }),
          supabase.from('daily_logs').select('*').eq('user_id', u.id).gte('date', weekStr).order('date'),
          supabase.from('checkins').select('*').eq('user_id', u.id).gte('date', weekStr),
        ])

        const { data: todayLogData } = await supabase
          .from('daily_logs').select('*').eq('user_id', u.id).eq('date', today).maybeSingle()

        setSessions(sess || [])
        setSprints(spr || [])
        setWeekLogs(logs || [])
        setTodayLog(todayLogData || null)
        setCheckins(checkData || [])
      } catch(e) {
        console.error('Dashboard load error:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', background:s.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ fontSize:14, color:s.dim }}>Загружаем...</div>
    </div>
  )

  const completedSession = sessions.find(s => s.completed)
  const activeSprints    = sprints
  const userName         = user?.user_metadata?.name || user?.email?.split('@')[0]
  const todayCheckinDone = todayLog !== null

  const stateMapOverview = completedSession?.state_map
    ?.split('\n').find(l => l.startsWith('ОБЩАЯ КАРТИНА:'))
    ?.replace('ОБЩАЯ КАРТИНА:', '').trim() || ''

  const priorities = completedSession?.state_map
    ?.split('\n')
    .filter(l => l.match(/^ПРИОРИТЕТ \d:/i))
    .map(l => {
      const parts = l.replace(/^ПРИОРИТЕТ \d:\s*/i, '').split('|').map(p => p.trim())
      return { name: parts[0], why: parts[1] }
    }) || []

  const hasDimData = todayLog && (todayLog.energy || todayLog.mood || todayLog.meaning || todayLog.connection)

  return (
    <div style={{ minHeight:'100vh', background:s.bg, color:s.text, fontFamily:"'DM Sans',sans-serif", fontWeight:300, paddingBottom:90 }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        @keyframes spin   { to   { transform:rotate(360deg) } }
      `}</style>

      {/* Header */}
      <header style={{ padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontFamily:"'Playfair Display',serif", fontSize:20, color:s.accent }}>Life OS</span>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:12, color:s.dim }}>{userName}</span>
          <button onClick={signOut} style={{ fontSize:11, color:s.dim, background:'none', border:`1px solid ${s.border}`, borderRadius:8, padding:'4px 10px', cursor:'pointer' }}>
            Выйти
          </button>
        </div>
      </header>

      <div style={{ maxWidth:560, margin:'0 auto', padding:'0 16px', display:'flex', flexDirection:'column', gap:14, animation:'fadeUp 0.35s forwards' }}>

        {/* ── No diagnosis ── */}
        {!completedSession && (
          <div style={{ textAlign:'center', padding:'80px 20px' }}>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:64, color:s.accent, opacity:0.15, marginBottom:24 }}>◎</div>
            <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:24, fontWeight:400, marginBottom:12 }}>
              Привет{userName ? `, ${userName}` : ''}
            </h2>
            <p style={{ fontSize:14, color:s.dim, lineHeight:1.8, maxWidth:300, margin:'0 auto 32px' }}>
              Начни с диагностики — и получишь карту своего состояния и план на 2–3 месяца.
            </p>
            <button onClick={() => router.push('/chat')} style={{ background:s.accent, color:s.bg, border:'none', borderRadius:100, padding:'14px 36px', fontSize:14, fontWeight:500, cursor:'pointer' }}>
              Начать диагностику
            </button>
          </div>
        )}

        {/* ── Has diagnosis ── */}
        {completedSession && (
          <>
            {/* Today wellbeing */}
            {hasDimData ? (
              <div style={{ background:s.surface, border:`1px solid ${s.border}`, borderRadius:24, padding:'20px', position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse at 50% 0%, rgba(200,184,154,0.07) 0%, transparent 55%)', pointerEvents:'none' }} />

                {/* Top row: index ring + label */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
                  <div>
                    <div style={{ fontSize:11, color:s.muted, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:4 }}>
                      Сегодня
                    </div>
                    {todayLog.wellbeing_index && (
                      <WellbeingRing value={todayLog.wellbeing_index} size={100} />
                    )}
                    {!todayLog.wellbeing_index && (
                      <div style={{ fontSize:13, color:s.dim, marginTop:4 }}>Чекин пройден ✓</div>
                    )}
                  </div>
                  {/* Sleep / activity extras */}
                  {todayLog.sleep_quality && (
                    <div style={{ display:'flex', flexDirection:'column', gap:8, alignItems:'flex-end' }}>
                      {todayLog.sleep_quality && (
                        <div style={{ fontSize:12, color:s.dim, background:s.surface2, borderRadius:10, padding:'5px 10px' }}>
                          😴 {todayLog.sleep_quality === 'good' ? 'Отдохнул' : todayLog.sleep_quality === 'ok' ? 'Нормально' : 'Разбит'}
                        </div>
                      )}
                      {todayLog.workout !== null && (
                        <div style={{ fontSize:12, color:s.dim, background:s.surface2, borderRadius:10, padding:'5px 10px' }}>
                          🏃 {todayLog.workout ? 'Тренировка' : 'Без тренировки'}
                        </div>
                      )}
                      {todayLog.steps && (
                        <div style={{ fontSize:12, color:s.dim, background:s.surface2, borderRadius:10, padding:'5px 10px' }}>
                          👣 {todayLog.steps.toLocaleString()}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 2×2 dim cards */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {Object.entries(DIM).map(([key, cfg]) => (
                    <DimCard key={key} dimKey={key} cfg={cfg} value={todayLog[key] ?? null} weekLogs={weekLogs} />
                  ))}
                </div>
              </div>
            ) : (
              /* Checkin CTA */
              <div style={{ background:s.surface, border:`1px solid rgba(200,184,154,0.2)`, borderRadius:24, padding:'28px 24px', textAlign:'center', position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse at 50% 0%, rgba(200,184,154,0.08) 0%, transparent 60%)', pointerEvents:'none' }} />
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:48, color:s.accent, opacity:0.25, marginBottom:12 }}>◎</div>
                <div style={{ fontSize:16, fontWeight:500, color:s.text, marginBottom:8 }}>Как сегодня?</div>
                <div style={{ fontSize:13, color:s.dim, marginBottom:20 }}>Чекин займёт 30 секунд</div>
                <button onClick={() => router.push('/checkin')}
                  style={{ background:s.accent, color:s.bg, border:'none', borderRadius:100, padding:'12px 32px', fontSize:14, fontWeight:500, cursor:'pointer' }}>
                  ⚡ Начать чекин
                </button>
              </div>
            )}

            {/* Checkin button (if checkin done but no dim data visible above) */}
            {hasDimData && (
              <button onClick={() => router.push('/checkin')}
                style={{ width:'100%', padding:'13px', borderRadius:16, background:'rgba(122,184,122,0.1)', border:`1px solid rgba(122,184,122,0.25)`, color:s.green, fontSize:13, fontWeight:500, cursor:'pointer' }}>
                ✓ Чекин пройден — открыть →
              </button>
            )}

            {/* State Map */}
            {stateMapOverview && (
              <div style={{ background:s.surface, border:`1px solid rgba(200,184,154,0.12)`, borderRadius:20, padding:'18px 20px', position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse at 100% 0%, rgba(200,184,154,0.07) 0%, transparent 50%)', pointerEvents:'none' }} />
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                  <div style={{ fontFamily:"'Playfair Display',serif", fontSize:14, color:s.accent }}>🧬 State Map</div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => router.push('/dashboard/priorities')} style={{ fontSize:11, color:s.accent, background:'rgba(200,184,154,0.1)', border:`1px solid rgba(200,184,154,0.2)`, borderRadius:8, padding:'4px 10px', cursor:'pointer' }}>
                      Приоритеты →
                    </button>
                    <button onClick={() => router.push('/chat')} style={{ fontSize:11, color:s.dim, background:'none', border:`1px solid ${s.border}`, borderRadius:8, padding:'4px 10px', cursor:'pointer' }}>
                      Обновить
                    </button>
                  </div>
                </div>
                <p style={{ fontSize:13, color:s.dim, lineHeight:1.75, marginBottom: priorities.length ? 14 : 0 }}>{stateMapOverview}</p>
                {priorities.length > 0 && (
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {priorities.map((p, i) => (
                      <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 12px', background:s.surface2, borderRadius:12 }}>
                        <span style={{ fontSize:12, color:s.accent, fontWeight:600, flexShrink:0, marginTop:1, width:16 }}>{i+1}</span>
                        <div>
                          <div style={{ fontSize:13, fontWeight:500, color:s.text }}>{p.name}</div>
                          {p.why && <div style={{ fontSize:11, color:s.dim, marginTop:2 }}>{p.why}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Active sprints */}
            {activeSprints.length > 0 && (
              <div>
                <div style={{ fontSize:11, color:s.muted, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10 }}>
                  Активные спринты
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {activeSprints.map(sprint => (
                    <SprintCard key={sprint.id} sprint={sprint} checkins={checkins} today={today} router={router} />
                  ))}
                </div>
              </div>
            )}

            {activeSprints.length === 0 && (
              <div style={{ textAlign:'center', padding:'28px 20px', border:`1px dashed ${s.border}`, borderRadius:20 }}>
                <p style={{ fontSize:14, color:s.dim, marginBottom:16 }}>Нет активных спринтов</p>
                <button onClick={() => router.push('/dashboard/priorities')} style={{ background:s.accent, color:s.bg, border:'none', borderRadius:100, padding:'10px 24px', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                  Составить план →
                </button>
              </div>
            )}

            {/* Session history toggle */}
            {sessions.length > 0 && (
              <div>
                <button onClick={() => setShowHistory(h => !h)}
                  style={{ width:'100%', padding:'12px', borderRadius:16, background:s.surface, border:`1px solid ${s.border}`, color:s.dim, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  {showHistory ? '▲ Скрыть историю' : '▼ История сессий'}
                </button>
                {showHistory && (
                  <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:10 }}>
                    {sessions.map(sess => (
                      <div key={sess.id} onClick={() => router.push(`/chat?session=${sess.id}`)}
                        style={{ background:s.surface, border:`1px solid ${s.border}`, borderRadius:16, padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer' }}>
                        <div>
                          <div style={{ fontSize:13, fontWeight:500, color:s.text, marginBottom:3 }}>
                            {sess.completed ? '🧬 Диагностика завершена' : '◔ В процессе'}
                          </div>
                          <div style={{ fontSize:12, color:s.dim }}>
                            {new Date(sess.created_at).toLocaleDateString('ru', { day:'numeric', month:'long', year:'numeric' })}
                          </div>
                        </div>
                        <div style={{ fontSize:12, color:s.accent }}>Открыть →</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav router={router} />
    </div>
  )
}
