// @ts-nocheck
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { analyzeActivity } from '@/lib/activity-analysis'

// ── Dimension config — new emotional color palette ─────────────
const DIM = {
  energy:     { label: 'Энергия',    emoji: '⚡', color: '#6AA8FF' },
  mood:       { label: 'Настроение', emoji: '🌊', color: '#B18DFF' },
  meaning:    { label: 'Смысл',      emoji: '🌱', color: '#52FF9A' },
  connection: { label: 'Связь',      emoji: '🤝', color: '#FFB84D' },
}

// ── Design tokens ──────────────────────────────────────────────
const s = {
  bg:          '#07090D',
  text:        '#F2F0EA',
  dim:         'rgba(255,255,255,0.50)',
  muted:       'rgba(255,255,255,0.28)',
  faint:       'rgba(255,255,255,0.07)',
  // Emotional signals
  energy:      '#6AA8FF',
  recovery:    '#52FF9A',
  mindfulness: '#B18DFF',
  stress:      '#FFB84D',
  overload:    '#FF5A5A',
}

// ── State helpers ──────────────────────────────────────────────
function stateFromIndex(idx) {
  if (!idx)     return { label: 'Нет данных',        sub: '' }
  if (idx >= 8) return { label: 'Пиковое состояние', sub: 'Отличный день' }
  if (idx >= 6.5) return { label: 'Хорошее',         sub: 'Держишься' }
  if (idx >= 5)   return { label: 'Устойчиво',       sub: 'Средний уровень' }
  if (idx >= 3.5) return { label: 'Сниженное',       sub: 'Нужен отдых' }
  return           { label: 'Низкое',                sub: 'Берегите себя' }
}

function heroAccent(idx) {
  if (!idx || idx >= 6.5) return s.energy
  if (idx >= 5)           return s.mindfulness
  return                         s.stress
}

function heroBg(idx) {
  if (!idx)       return 'linear-gradient(145deg,#0D1525 0%,#090C17 55%,#10082A 100%)'
  if (idx >= 6.5) return 'linear-gradient(145deg,#081628 0%,#060D1C 50%,#0A0F22 100%)'
  if (idx >= 5)   return 'linear-gradient(145deg,#0F0820 0%,#08050F 50%,#130A22 100%)'
  return                  'linear-gradient(145deg,#1A0C06 0%,#100606 50%,#160B08 100%)'
}

// ── Smooth SVG path ────────────────────────────────────────────
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

// ── Glow Sparkline ─────────────────────────────────────────────
function GlowSparkline({ logs, dimKey, color, width = 96, height = 48 }) {
  const pts = (logs || [])
    .filter(l => l[dimKey] != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(l => ({ value: l[dimKey] }))

  if (pts.length < 2) return (
    <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: color, opacity: 0.3 }} />
    </div>
  )

  const vals  = pts.map(p => p.value)
  const min   = Math.min(...vals) - 0.5
  const max   = Math.max(...vals) + 0.5
  const range = max - min || 1
  const padX = 4, padY = 6
  const w = width - padX * 2, h = height - padY * 2
  const coords = pts.map((p, i) => [
    padX + (i / (pts.length - 1)) * w,
    padY + (1 - (p.value - min) / range) * h,
  ])
  const path = smoothPath(coords)
  const last  = coords[coords.length - 1]
  const uid   = color.replace('#', 'c')

  return (
    <svg width={width} height={height} style={{ overflow: 'visible', flexShrink: 0 }}>
      <defs>
        <filter id={`gsp-${uid}`} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <path d={path} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"
        opacity="0.18" filter={`url(#gsp-${uid})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      <circle cx={last[0]} cy={last[1]} r="4" fill={color} style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
    </svg>
  )
}

// ── Dim Card ───────────────────────────────────────────────────
function DimCard({ dimKey, cfg, value, weekLogs }) {
  return (
    <div style={{
      background:   `linear-gradient(150deg,${cfg.color}13 0%,${cfg.color}04 100%)`,
      border:       `1px solid ${cfg.color}1E`,
      borderRadius: 28,
      padding:      '20px 16px 16px',
      position:     'relative',
      overflow:     'hidden',
      minHeight:    148,
      boxShadow:    `0 0 40px ${cfg.color}0C`,
    }}>
      {/* radial glow orb */}
      <div style={{
        position: 'absolute', bottom: -32, right: -32,
        width: 150, height: 150, borderRadius: '50%',
        background: `radial-gradient(circle,${cfg.color}22 0%,transparent 65%)`,
        animation: 'orbFloat 6s ease-in-out infinite',
        pointerEvents: 'none',
      }} />

      <div style={{ fontSize: 11, color: cfg.color, opacity: 0.75, letterSpacing: '0.04em', marginBottom: 10, position: 'relative' }}>
        {cfg.emoji} {cfg.label}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', position: 'relative' }}>
        <div>
          <span style={{
            fontSize: 52, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em',
            color: value ? cfg.color : 'rgba(255,255,255,0.12)',
            textShadow: value ? `0 0 40px ${cfg.color}70` : 'none',
          }}>
            {value ?? '—'}
          </span>
          {value && <span style={{ fontSize: 12, color: s.muted, marginLeft: 3 }}>/10</span>}
        </div>
        <GlowSparkline logs={weekLogs} dimKey={dimKey} color={cfg.color} />
      </div>
    </div>
  )
}

// ── Sprint Card ────────────────────────────────────────────────
function SprintCard({ sprint, checkins, today, router }) {
  const sprintCheckins = checkins.filter(c => c.sprint_id === sprint.id)
  const doneCount = sprintCheckins.filter(c => c.completed).length
  const todayDone = sprintCheckins.some(c => c.date === today && c.completed)
  const target    = sprint.target_days || 14
  const pct       = Math.min(doneCount / target, 1)

  const weekDays  = []
  const dayLabels = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    const check   = sprintCheckins.find(c => c.date === dateStr)
    const dayIdx  = d.getDay() === 0 ? 6 : d.getDay() - 1
    weekDays.push({ dateStr, isToday: dateStr === today, done: check?.completed, missed: check && !check.completed, label: dayLabels[dayIdx] })
  }

  const r = 28, circ = 2 * Math.PI * r, sz = 72

  return (
    <div style={{
      background:        'linear-gradient(155deg,rgba(255,255,255,0.075) 0%,rgba(255,255,255,0.025) 100%)',
      backdropFilter:    'blur(40px)',
      WebkitBackdropFilter: 'blur(40px)',
      borderRadius:      32,
      padding:           '24px 20px 20px',
      border:            '1px solid rgba(255,255,255,0.09)',
      position:          'relative',
      overflow:          'hidden',
      boxShadow:         `0 0 60px rgba(82,255,154,0.05), 0 20px 60px rgba(0,0,0,0.3)`,
    }}>
      <div style={{ position:'absolute', bottom:-50, right:-50, width:200, height:200, borderRadius:'50%', background:'radial-gradient(circle,rgba(82,255,154,0.1) 0%,transparent 65%)', pointerEvents:'none', animation:'orbFloat 7s ease-in-out infinite 1s' }} />

      {/* top row */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:18 }}>
        <div style={{ flex:1, paddingRight:14 }}>
          <div style={{ fontSize:11, color:s.muted, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:6 }}>
            День {Math.ceil((new Date() - new Date(sprint.started_at)) / 86400000) + 1} · {doneCount}/{target}
          </div>
          <div style={{ fontSize:18, fontWeight:600, color:s.text, lineHeight:1.3, marginBottom: sprint.anchor ? 5 : 0 }}>
            {sprint.behavior_name}
          </div>
          {sprint.anchor && <div style={{ fontSize:12, color:s.muted }}>⚓ {sprint.anchor}</div>}
        </div>
        {/* arc ring */}
        <div style={{ position:'relative', width:sz, height:sz, flexShrink:0 }}>
          <svg width={sz} height={sz} style={{ transform:'rotate(-90deg)' }}>
            <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={5} />
            <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke={s.recovery} strokeWidth={5}
              strokeDasharray={circ} strokeDashoffset={circ*(1-pct)} strokeLinecap="round"
              style={{ filter:`drop-shadow(0 0 8px ${s.recovery}99)`, transition:'stroke-dashoffset 0.8s ease' }} />
          </svg>
          <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
            <span style={{ fontSize:15, fontWeight:600, color:s.recovery, lineHeight:1 }}>{doneCount}</span>
            <span style={{ fontSize:9, color:s.muted }}>/{target}</span>
          </div>
        </div>
      </div>

      {/* week strip */}
      <div style={{ display:'flex', gap:5, marginBottom:18 }}>
        {weekDays.map((d, i) => (
          <div key={i} style={{ flex:1, textAlign:'center' }}>
            <div style={{
              width:'100%', aspectRatio:'1', borderRadius:9,
              background:  d.done    ? 'rgba(82,255,154,0.18)'
                         : d.missed  ? 'rgba(255,90,90,0.13)'
                         : d.isToday ? 'rgba(255,255,255,0.1)'
                         : 'rgba(255,255,255,0.04)',
              border:`1px solid ${d.done    ? 'rgba(82,255,154,0.38)'
                                : d.missed  ? 'rgba(255,90,90,0.28)'
                                : d.isToday ? 'rgba(255,255,255,0.18)'
                                : 'rgba(255,255,255,0.05)'}`,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:11, color: d.done ? s.recovery : d.missed ? s.overload : s.muted,
              boxShadow: d.done ? `0 0 12px rgba(82,255,154,0.3)` : 'none',
            }}>
              {d.done ? '✓' : d.missed ? '×' : ''}
            </div>
            <div style={{ fontSize:9, color:s.muted, marginTop:3 }}>{d.label}</div>
          </div>
        ))}
      </div>

      <button onClick={() => router.push('/checkin')} style={{
        width:'100%', padding:'13px', borderRadius:16, border:'none', cursor:'pointer',
        background: todayDone ? 'rgba(82,255,154,0.1)' : 'rgba(255,255,255,0.06)',
        border:`1px solid ${todayDone ? 'rgba(82,255,154,0.28)' : 'rgba(255,255,255,0.1)'}`,
        color: todayDone ? s.recovery : s.dim, fontSize:14, fontWeight:500, transition:'all 0.15s',
      }}>
        {todayDone ? '✓ Отмечено сегодня' : '→ Отметить выполнение'}
      </button>
    </div>
  )
}

// ── Activity Card ──────────────────────────────────────────────
const ACTIVITY_COLOR = '#FFB84D'

function ActivityCard({ analysis, router }) {
  const { weekly, vo2max, gaps } = analysis
  const hasWorkouts = weekly.total_workout_minutes > 0 || weekly.avg_steps > 0

  if (!hasWorkouts && gaps.length === 0) return null

  const severityDot = { high: '#FF5A5A', medium: '#FFB84D', low: 'rgba(255,255,255,0.35)' }

  const stats = [
    { label: 'Сила',      value: weekly.strength_sessions,  unit: 'сес' },
    { label: 'Кардио',    value: weekly.cardio_sessions,     unit: 'сес' },
    { label: 'Моб-ть',    value: weekly.mobility_sessions,   unit: 'сес' },
    { label: 'Zone 2',    value: weekly.zone2_minutes,       unit: 'мин' },
  ].filter(st => st.value > 0)

  return (
    <div style={{
      background:  'linear-gradient(155deg,rgba(255,184,77,0.08) 0%,rgba(255,255,255,0.02) 100%)',
      backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
      borderRadius: 32, padding: '22px 20px 18px',
      border: `1px solid ${ACTIVITY_COLOR}1A`,
      position: 'relative', overflow: 'hidden',
      boxShadow: `0 0 60px ${ACTIVITY_COLOR}08, 0 20px 60px rgba(0,0,0,0.25)`,
      animation: 'fadeUp 0.8s ease forwards',
    }}>
      <div style={{ position: 'absolute', bottom: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: `radial-gradient(circle,${ACTIVITY_COLOR}18 0%,transparent 65%)`, animation: 'orbFloat 8s ease-in-out infinite', pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, position: 'relative' }}>
        <div style={{ fontSize: 11, color: ACTIVITY_COLOR, opacity: 0.8, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          🏃 Активность · неделя
        </div>
        {vo2max.latest && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: `${ACTIVITY_COLOR}12`, border: `1px solid ${ACTIVITY_COLOR}28`, borderRadius: 999, padding: '4px 12px' }}>
            <span style={{ fontSize: 12, color: ACTIVITY_COLOR, fontWeight: 600 }}>VO₂max {vo2max.latest.toFixed(1)}</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
              {vo2max.trend === 'rising' ? '↑' : vo2max.trend === 'falling' ? '↓' : '→'}
            </span>
          </div>
        )}
      </div>

      {/* Workout stats row */}
      {stats.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', position: 'relative' }}>
          {stats.map((st, i) => (
            <div key={i} style={{
              background: `${ACTIVITY_COLOR}0E`, border: `1px solid ${ACTIVITY_COLOR}22`,
              borderRadius: 14, padding: '8px 14px', textAlign: 'center', flex: '1 1 auto',
            }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: ACTIVITY_COLOR, lineHeight: 1 }}>{st.value}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)', marginTop: 3 }}>{st.label}</div>
            </div>
          ))}
          {weekly.avg_steps > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '8px 14px', textAlign: 'center', flex: '1 1 auto' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.7)', lineHeight: 1 }}>{(weekly.avg_steps / 1000).toFixed(1)}k</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 3 }}>Шаги/день</div>
            </div>
          )}
        </div>
      )}

      {/* Gap pills */}
      {gaps.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, position: 'relative' }}>
          {gaps.map((gap, i) => (
            <button
              key={i}
              onClick={() => router.push('/assistant')}
              style={{
                width: '100%', textAlign: 'left', cursor: 'pointer',
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 14, padding: '10px 14px',
                display: 'flex', alignItems: 'flex-start', gap: 10,
                transition: 'all 0.15s',
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: severityDot[gap.severity], flexShrink: 0, marginTop: 5, boxShadow: gap.severity !== 'low' ? `0 0 8px ${severityDot[gap.severity]}80` : 'none' }} />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.50)', lineHeight: 1.55 }}>{gap.message}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Bottom Nav — floating pill ─────────────────────────────────
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
      background:    'rgba(8,10,16,0.92)',
      backdropFilter:'blur(32px)', WebkitBackdropFilter:'blur(32px)',
      border:        '1px solid rgba(255,255,255,0.1)',
      borderRadius:  999,
      display:       'flex', alignItems: 'center', gap: 2,
      padding:       '8px 10px',
      zIndex:        50,
      boxShadow:     '0 8px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
    }}>
      {items.map(item => {
        const active = current === item.route
        return (
          <button key={item.route} onClick={() => router.push(item.route)} style={{
            display:'flex', flexDirection:'column', alignItems:'center', gap:3,
            background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
            border:     active ? '1px solid rgba(255,255,255,0.14)' : '1px solid transparent',
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

// ── Dashboard ──────────────────────────────────────────────────
export default function Dashboard() {
  const router = useRouter()
  const [user, setUser]               = useState(null)
  const [sessions, setSessions]       = useState([])
  const [sprints, setSprints]         = useState([])
  const [todayLog, setTodayLog]       = useState(null)
  const [weekLogs, setWeekLogs]       = useState([])
  const [monthLogs, setMonthLogs]     = useState([])
  const [checkins, setCheckins]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [showHistory, setShowHistory] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  // ── Data loading (unchanged) ───────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const { data } = await supabase.auth.getSession()
        if (!data?.session) { router.push('/'); return }
        const u = data.session.user
        setUser(u)

        const weekAgo  = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
        const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30)
        const weekStr  = weekAgo.toISOString().split('T')[0]
        const monthStr = monthAgo.toISOString().split('T')[0]

        const [
          { data: sess },
          { data: spr },
          { data: logs },
          { data: checkData },
          { data: mLogs },
        ] = await Promise.all([
          supabase.from('sessions').select('*').eq('user_id', u.id).order('created_at', { ascending: false }),
          supabase.from('sprints').select('*').eq('user_id', u.id).eq('status','active').order('created_at', { ascending: false }),
          supabase.from('daily_logs').select('*').eq('user_id', u.id).gte('date', weekStr).order('date'),
          supabase.from('checkins').select('*').eq('user_id', u.id).gte('date', weekStr),
          supabase.from('daily_logs').select('date,steps,workout_minutes,workout_type,vo2max').eq('user_id', u.id).gte('date', monthStr).order('date'),
        ])

        const { data: todayLogData } = await supabase
          .from('daily_logs').select('*').eq('user_id', u.id).eq('date', today).maybeSingle()

        setSessions(sess || [])
        setSprints(spr || [])
        setWeekLogs(logs || [])
        setMonthLogs(mLogs || [])
        setTodayLog(todayLogData || null)
        setCheckins(checkData || [])
      } catch (e) {
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

  // ── Loading state ──────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight:'100vh', background:s.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:28, height:28, borderRadius:'50%', border:'2px solid rgba(255,255,255,0.08)', borderTop:`2px solid ${s.energy}`, animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  // ── Derived state (unchanged logic) ───────────────────────
  const completedSession = sessions.find(sess => sess.completed)
  const activeSprints    = sprints
  const userName         = user?.user_metadata?.name || user?.email?.split('@')[0]

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

  const hasDimData        = todayLog && (todayLog.energy || todayLog.mood || todayLog.meaning || todayLog.connection)
  const activityAnalysis  = analyzeActivity(monthLogs)

  const wellbeingIndex = todayLog?.wellbeing_index
    ? parseFloat(todayLog.wellbeing_index)
    : hasDimData
      ? Object.keys(DIM).filter(k => todayLog[k]).reduce((sum, k, _, arr) => sum + todayLog[k] / arr.length, 0)
      : null

  const { label: stateLabel, sub: stateSub } = stateFromIndex(wellbeingIndex)
  const accent          = heroAccent(wellbeingIndex)
  const accentSecondary = accent === s.energy ? s.mindfulness : s.energy
  const todayStr        = new Date().toLocaleDateString('ru', { weekday:'long', day:'numeric', month:'long' })

  // ── Render ─────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background:s.bg, color:s.text, fontFamily:"'DM Sans',-apple-system,sans-serif", fontWeight:300, paddingBottom:110 }}>
      <style>{`
        @keyframes fadeUp    { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin      { to{transform:rotate(360deg)} }
        @keyframes glowPulse { 0%,100%{opacity:0.45} 50%{opacity:1} }
        @keyframes orbFloat  { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(12px,-10px) scale(1.08)} }
        @keyframes orbFloat2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-10px,14px) scale(1.05)} }
      `}</style>

      {/* ── Header ── */}
      <header style={{ padding:'22px 24px 0', display:'flex', alignItems:'center', justifyContent:'space-between', animation:'fadeUp 0.4s ease forwards' }}>
        <span style={{ fontFamily:"'Playfair Display',serif", fontSize:18, color:s.text, opacity:0.9 }}>Life OS</span>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {userName && <span style={{ fontSize:12, color:s.muted }}>{userName}</span>}
          <button onClick={signOut} style={{ fontSize:11, color:s.muted, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:999, padding:'5px 14px', cursor:'pointer' }}>
            Выйти
          </button>
        </div>
      </header>

      <div style={{ maxWidth:540, margin:'0 auto', padding:'18px 18px 0', display:'flex', flexDirection:'column', gap:14 }}>

        {/* ══════════════════════════════════════════════════ */}
        {/*  NO SESSION — ONBOARDING WELCOME                   */}
        {/* ══════════════════════════════════════════════════ */}
        {!completedSession && (
          <div style={{ animation:'fadeUp 0.5s ease forwards' }}>
            <div style={{
              borderRadius: 40, padding: '48px 28px 44px',
              background: 'linear-gradient(145deg,#0D1525 0%,#090C17 55%,#10082A 100%)',
              position: 'relative', overflow: 'hidden',
              boxShadow: '0 0 120px rgba(106,168,255,0.12)',
            }}>
              <div style={{ position:'absolute', top:-60, right:-40, width:280, height:280, borderRadius:'50%', background:'radial-gradient(circle,rgba(106,168,255,0.22) 0%,transparent 65%)', animation:'orbFloat 9s ease-in-out infinite', pointerEvents:'none' }} />
              <div style={{ position:'absolute', bottom:-80, left:-60, width:320, height:320, borderRadius:'50%', background:'radial-gradient(circle,rgba(177,141,255,0.14) 0%,transparent 65%)', animation:'orbFloat2 11s ease-in-out infinite', pointerEvents:'none' }} />

              <div style={{ position:'relative', zIndex:1 }}>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:34, fontWeight:400, color:s.text, lineHeight:1.15, marginBottom:12, letterSpacing:'-0.01em' }}>
                  Привет{userName ? `, ${userName}` : ''}!
                </div>
                <div style={{ fontSize:14, color:s.dim, lineHeight:1.75, marginBottom:32 }}>
                  Life OS — система для понимания себя как цельного организма. Вот как это работает:
                </div>

                <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:36 }}>
                  {[
                    { n:'1', title:'Диагностика', desc:'Разговор с ИИ о твоём состоянии', color: s.energy },
                    { n:'2', title:'Спринты',     desc:'Небольшие поведенческие шаги',   color: s.mindfulness },
                    { n:'3', title:'Чекины',      desc:'Ежедневное отслеживание',         color: s.recovery },
                  ].map(step => (
                    <div key={step.n} style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      background: `${step.color}0A`, border: `1px solid ${step.color}1C`,
                      borderRadius: 18, padding: '13px 16px',
                    }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                        background: `${step.color}18`, border: `1px solid ${step.color}30`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700, color: step.color,
                      }}>{step.n}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: s.text }}>{step.title}</div>
                        <div style={{ fontSize: 12, color: s.muted }}>{step.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <button onClick={() => router.push('/chat')} style={{
                  width: '100%', padding: '16px',
                  background: `linear-gradient(135deg,${s.energy} 0%,${s.mindfulness} 100%)`,
                  color: '#07090D', border: 'none', borderRadius: 999,
                  fontSize: 15, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.01em',
                  boxShadow: `0 0 50px rgba(106,168,255,0.5),0 4px 24px rgba(106,168,255,0.3)`,
                }}>
                  Начать диагностику →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/*  HAS SESSION                                       */}
        {/* ══════════════════════════════════════════════════ */}
        {completedSession && (
          <>

            {/* ── HERO CARD ─────────────────────────────────── */}
            <div style={{
              borderRadius: 40,
              padding:      hasDimData ? '40px 28px 36px' : '50px 32px 44px',
              background:   heroBg(wellbeingIndex),
              position:     'relative', overflow: 'hidden',
              boxShadow:    `0 0 100px ${accent}14, 0 24px 80px rgba(0,0,0,0.4)`,
              animation:    'fadeUp 0.5s ease forwards',
            }}>
              {/* animated orbs */}
              <div style={{ position:'absolute', top:-50, right:-40, width:260, height:260, borderRadius:'50%', background:`radial-gradient(circle,${accent}22 0%,transparent 65%)`, animation:'orbFloat 9s ease-in-out infinite', pointerEvents:'none' }} />
              <div style={{ position:'absolute', bottom:-70, left:-50, width:300, height:300, borderRadius:'50%', background:`radial-gradient(circle,${accentSecondary}10 0%,transparent 65%)`, animation:'orbFloat2 12s ease-in-out infinite 1.5s', pointerEvents:'none' }} />
              <div style={{ position:'absolute', top:'40%', left:'15%', width:180, height:180, borderRadius:'50%', background:`radial-gradient(circle,${accent}07 0%,transparent 60%)`, animation:'glowPulse 5s ease-in-out infinite 0.8s', pointerEvents:'none' }} />

              <div style={{ position:'relative', zIndex:1 }}>
                <div style={{ fontSize:11, color:s.muted, letterSpacing:'0.15em', textTransform:'uppercase', marginBottom:26 }}>
                  {todayStr}
                </div>

                {hasDimData ? (
                  <>
                    {/* big index number */}
                    <div style={{ marginBottom:6 }}>
                      <span style={{ fontSize:80, fontWeight:700, color:s.text, lineHeight:1, letterSpacing:'-0.04em', textShadow:`0 0 80px ${accent}70` }}>
                        {wellbeingIndex.toFixed(1)}
                      </span>
                      <span style={{ fontSize:20, color:s.dim, marginLeft:8 }}>/10</span>
                    </div>
                    <div style={{ fontSize:30, fontWeight:600, color:s.text, marginBottom:4, lineHeight:1.2, letterSpacing:'-0.01em' }}>
                      {stateLabel}
                    </div>
                    {stateSub && <div style={{ fontSize:14, color:s.dim, marginBottom:28 }}>{stateSub}</div>}

                    {/* dim pills */}
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      {Object.entries(DIM).map(([key, cfg]) => todayLog[key] != null && (
                        <div key={key} style={{
                          display:'flex', alignItems:'center', gap:5,
                          background:`${cfg.color}12`, border:`1px solid ${cfg.color}22`,
                          borderRadius:999, padding:'6px 14px',
                        }}>
                          <span style={{ fontSize:11 }}>{cfg.emoji}</span>
                          <span style={{ fontSize:13, color:cfg.color, fontWeight:500 }}>{todayLog[key]}</span>
                          <span style={{ fontSize:11, color:s.muted }}>{cfg.label}</span>
                        </div>
                      ))}
                    </div>

                    {/* physio extras */}
                    {(todayLog.sleep_quality || todayLog.steps || todayLog.workout != null) && (
                      <div style={{ display:'flex', gap:8, marginTop:14, flexWrap:'wrap' }}>
                        {todayLog.sleep_quality && (
                          <div style={{ display:'flex', alignItems:'center', gap:5, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.09)', borderRadius:999, padding:'5px 12px' }}>
                            <span style={{ fontSize:11 }}>😴</span>
                            <span style={{ fontSize:12, color:s.dim }}>{todayLog.sleep_quality === 'good' ? 'Отдохнул' : todayLog.sleep_quality === 'ok' ? 'Нормально' : 'Разбит'}</span>
                          </div>
                        )}
                        {todayLog.steps && (
                          <div style={{ display:'flex', alignItems:'center', gap:5, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.09)', borderRadius:999, padding:'5px 12px' }}>
                            <span style={{ fontSize:11 }}>👣</span>
                            <span style={{ fontSize:12, color:s.dim }}>{todayLog.steps.toLocaleString()}</span>
                          </div>
                        )}
                        {todayLog.workout != null && (
                          <div style={{ display:'flex', alignItems:'center', gap:5, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.09)', borderRadius:999, padding:'5px 12px' }}>
                            <span style={{ fontSize:11 }}>🏃</span>
                            <span style={{ fontSize:12, color:s.dim }}>{todayLog.workout ? 'Тренировка' : 'Без тренировки'}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ fontSize:48, fontWeight:700, color:s.text, lineHeight:1.1, marginBottom:14, letterSpacing:'-0.025em' }}>
                      Как ты<br />сегодня?
                    </div>
                    <div style={{ fontSize:15, color:s.dim, marginBottom:36, lineHeight:1.75 }}>
                      Чекин займёт 30 секунд
                    </div>
                    <button onClick={() => router.push('/checkin')} style={{
                      display:'inline-flex', alignItems:'center', gap:10,
                      background:`linear-gradient(135deg,${s.energy} 0%,${s.mindfulness} 100%)`,
                      color:'#07090D', border:'none', borderRadius:999,
                      padding:'16px 34px', fontSize:15, fontWeight:600, cursor:'pointer',
                      boxShadow:`0 0 50px rgba(106,168,255,0.45),0 4px 24px rgba(106,168,255,0.28)`,
                    }}>
                      ⚡ Начать чекин
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* checkin update strip */}
            {hasDimData && (
              <button onClick={() => router.push('/checkin')} style={{
                width:'100%', padding:'14px 20px', borderRadius:22,
                background:'rgba(82,255,154,0.07)', border:'1px solid rgba(82,255,154,0.2)',
                color:s.recovery, fontSize:14, fontWeight:500, cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                animation:'fadeUp 0.6s ease forwards',
              }}>
                ✓ Чекин пройден · обновить →
              </button>
            )}

            {/* ── 2×2 DIM GRID ──────────────────────────────── */}
            {hasDimData && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, animation:'fadeUp 0.65s ease forwards' }}>
                {Object.entries(DIM).map(([key, cfg]) => (
                  <DimCard key={key} dimKey={key} cfg={cfg} value={todayLog[key] ?? null} weekLogs={weekLogs} />
                ))}
              </div>
            )}

            {/* ── STATE MAP ─────────────────────────────────── */}
            {stateMapOverview && (
              <div style={{
                background:'linear-gradient(155deg,rgba(255,255,255,0.075) 0%,rgba(255,255,255,0.025) 100%)',
                backdropFilter:'blur(40px)', WebkitBackdropFilter:'blur(40px)',
                borderRadius:32, padding:'24px 22px',
                border:'1px solid rgba(255,255,255,0.09)',
                position:'relative', overflow:'hidden',
                animation:'fadeUp 0.7s ease forwards',
                boxShadow:'0 0 60px rgba(177,141,255,0.07),0 20px 60px rgba(0,0,0,0.25)',
              }}>
                <div style={{ position:'absolute', top:-40, right:-40, width:200, height:200, borderRadius:'50%', background:'radial-gradient(circle,rgba(177,141,255,0.12) 0%,transparent 65%)', animation:'glowPulse 7s ease-in-out infinite', pointerEvents:'none' }} />

                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:s.text }}>🧬 Карта состояния</div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => router.push('/dashboard/priorities')} style={{ fontSize:12, color:s.mindfulness, background:'rgba(177,141,255,0.1)', border:'1px solid rgba(177,141,255,0.22)', borderRadius:999, padding:'5px 14px', cursor:'pointer' }}>
                      Приоритеты
                    </button>
                    <button onClick={() => router.push('/chat')} style={{ fontSize:12, color:s.muted, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.09)', borderRadius:999, padding:'5px 14px', cursor:'pointer' }}>
                      Обновить
                    </button>
                  </div>
                </div>

                <p style={{ fontSize:14, color:s.dim, lineHeight:1.75, marginBottom: priorities.length ? 16 : 0 }}>
                  {stateMapOverview}
                </p>

                {priorities.length > 0 && (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {priorities.map((p, i) => (
                      <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'12px 14px', background:'rgba(255,255,255,0.04)', borderRadius:16, border:'1px solid rgba(255,255,255,0.06)' }}>
                        <span style={{ fontSize:12, color:s.mindfulness, fontWeight:600, flexShrink:0, minWidth:16, paddingTop:1 }}>{i+1}</span>
                        <div>
                          <div style={{ fontSize:13, fontWeight:500, color:s.text }}>{p.name}</div>
                          {p.why && <div style={{ fontSize:12, color:s.muted, marginTop:3 }}>{p.why}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── ACTIVITY CARD ─────────────────────────────── */}
            <ActivityCard analysis={activityAnalysis} router={router} />

            {/* ── ACTIVE SPRINTS ────────────────────────────── */}
            {activeSprints.length > 0 && (
              <div style={{ animation:'fadeUp 0.75s ease forwards' }}>
                <div style={{ fontSize:11, color:s.muted, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:12, paddingLeft:4 }}>
                  Активные спринты
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {activeSprints.map(sprint => (
                    <SprintCard key={sprint.id} sprint={sprint} checkins={checkins} today={today} router={router} />
                  ))}
                </div>
              </div>
            )}

            {activeSprints.length === 0 && (
              <div style={{
                background: 'linear-gradient(155deg,rgba(177,141,255,0.1) 0%,rgba(255,255,255,0.025) 100%)',
                backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
                borderRadius: 32, padding: '28px 24px',
                border: `1px solid rgba(177,141,255,0.22)`,
                position: 'relative', overflow: 'hidden',
                boxShadow: '0 0 60px rgba(177,141,255,0.08),0 20px 60px rgba(0,0,0,0.25)',
                animation: 'fadeUp 0.75s ease forwards',
              }}>
                <div style={{ position:'absolute', top:-40, right:-40, width:200, height:200, borderRadius:'50%', background:'radial-gradient(circle,rgba(177,141,255,0.15) 0%,transparent 65%)', animation:'glowPulse 7s ease-in-out infinite', pointerEvents:'none' }} />
                <div style={{ position:'relative', zIndex:1 }}>
                  <div style={{ fontSize:11, color:s.mindfulness, opacity:0.75, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:14 }}>
                    Следующий шаг
                  </div>
                  <div style={{ fontSize:18, fontWeight:600, color:s.text, lineHeight:1.35, marginBottom:10 }}>
                    Карта состояния готова
                  </div>
                  <div style={{ fontSize:14, color:s.dim, lineHeight:1.7, marginBottom:22 }}>
                    Выбери приоритет и создай первый спринт — небольшой поведенческий шаг на 2 недели.
                  </div>
                  <button onClick={() => router.push('/dashboard/priorities')} style={{
                    width: '100%', padding: '14px',
                    background: `linear-gradient(135deg,${s.mindfulness} 0%,${s.energy} 100%)`,
                    color: '#07090D', border: 'none', borderRadius: 999,
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    boxShadow: `0 0 40px rgba(177,141,255,0.4),0 4px 20px rgba(177,141,255,0.25)`,
                  }}>
                    Выбрать приоритет →
                  </button>
                </div>
              </div>
            )}

            {activeSprints.length > 0 && checkins.length === 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14,
                background: 'rgba(82,255,154,0.05)', border: '1px solid rgba(82,255,154,0.15)',
                borderRadius: 20, padding: '16px 20px',
                animation: 'fadeUp 0.8s ease forwards',
              }}>
                <div style={{ fontSize: 22, flexShrink: 0 }}>💡</div>
                <div style={{ fontSize: 13, color: s.dim, lineHeight: 1.65 }}>
                  Завтра начни день с чекина — это займёт минуту
                </div>
              </div>
            )}

            {/* ── SESSION HISTORY ───────────────────────────── */}
            {sessions.length > 0 && (
              <div style={{ animation:'fadeUp 0.8s ease forwards' }}>
                <button onClick={() => setShowHistory(h => !h)} style={{
                  width:'100%', padding:'13px', borderRadius:20,
                  background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)',
                  color:s.muted, fontSize:13, cursor:'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                }}>
                  {showHistory ? '▲ Скрыть историю' : '▼ История сессий'}
                </button>
                {showHistory && (
                  <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:10 }}>
                    {sessions.map(sess => (
                      <div key={sess.id} onClick={() => router.push(`/chat?session=${sess.id}`)} style={{
                        background:'linear-gradient(155deg,rgba(255,255,255,0.065) 0%,rgba(255,255,255,0.02) 100%)',
                        border:'1px solid rgba(255,255,255,0.08)',
                        borderRadius:20, padding:'16px 20px',
                        display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer',
                      }}>
                        <div>
                          <div style={{ fontSize:13, fontWeight:500, color:s.text, marginBottom:3 }}>
                            {sess.completed ? '🧬 Диагностика завершена' : '◔ В процессе'}
                          </div>
                          <div style={{ fontSize:12, color:s.muted }}>
                            {new Date(sess.created_at).toLocaleDateString('ru', { day:'numeric', month:'long', year:'numeric' })}
                          </div>
                        </div>
                        <div style={{ fontSize:13, color:s.dim }}>→</div>
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
