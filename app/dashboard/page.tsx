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

function MiniRing({ value, max=10, color, size=48 }) {
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const pct = value ? (value / max) : 0
  return (
    <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={4} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round" style={{ transition:'stroke-dashoffset 0.6s' }} />
    </svg>
  )
}

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [sessions, setSessions] = useState([])
  const [sprints, setSprints] = useState([])
  const [todayLog, setTodayLog] = useState(null)
  const [weekLogs, setWeekLogs] = useState([])
  const [checkins, setCheckins] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('home')

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.push('/'); return }
      const u = data.session.user
      setUser(u)

      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
      const weekStr = weekAgo.toISOString().split('T')[0]

      const [
        { data: sess },
        { data: spr },
        { data: logs },
        { data: todayLogData },
        { data: checkData },
      ] = await Promise.all([
        supabase.from('sessions').select('*').eq('user_id', u.id).order('created_at', { ascending: false }),
        supabase.from('sprints').select('*').eq('user_id', u.id).eq('status','active').order('created_at', { ascending: false }),
        supabase.from('daily_logs').select('*').eq('user_id', u.id).gte('date', weekStr).order('date'),
        supabase.from('daily_logs').select('*').eq('user_id', u.id).eq('date', today).single().catch(() => ({ data: null })),
        supabase.from('checkins').select('*').eq('user_id', u.id).gte('date', weekStr),
      ])

      setSessions(sess || [])
      setSprints(spr || [])
      setWeekLogs(logs || [])
      setTodayLog(todayLogData)
      setCheckins(checkData || [])
      setLoading(false)
    })
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
  const activeSprints = sprints
  const userName = user?.user_metadata?.name || user?.email?.split('@')[0]
  const todayCheckinDone = todayLog !== null

  // Parse state map overview
  const stateMapOverview = completedSession?.state_map
    ?.split('\n').find(l => l.startsWith('ОБЩАЯ КАРТИНА:'))
    ?.replace('ОБЩАЯ КАРТИНА:', '').trim() || ''

  // Parse priorities
  const priorities = completedSession?.state_map
    ?.split('\n')
    .filter(l => l.match(/^ПРИОРИТЕТ \d:/i))
    .map(l => {
      const parts = l.replace(/^ПРИОРИТЕТ \d:\s*/i, '').split('|').map(p => p.trim())
      return { name: parts[0], why: parts[1] }
    }) || []

  // Week avg for each dim
  const weekAvg = (key) => {
    const vals = weekLogs.filter(l => l[key]).map(l => l[key])
    return vals.length ? (vals.reduce((a,b) => a+b, 0) / vals.length).toFixed(1) : null
  }

  return (
    <div style={{ minHeight:'100vh', background:s.bg, color:s.text, fontFamily:"'DM Sans',sans-serif", fontWeight:300 }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Header */}
      <header style={{ padding:'14px 24px', borderBottom:`1px solid ${s.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:10 }}>
          <span style={{ fontFamily:"'Playfair Display',serif", fontSize:18, color:s.accent }}>Life OS</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:12, color:s.dim }}>{userName}</span>
          <button onClick={signOut} style={{ fontSize:12, color:s.dim, background:'none', border:`1px solid ${s.border}`, borderRadius:8, padding:'5px 10px', cursor:'pointer' }}>Выйти</button>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ display:'flex', gap:0, borderBottom:`1px solid ${s.border}`, padding:'0 24px' }}>
        {[['home','Главная'],['history','История']].map(([t,l]) => (
          <div key={t} onClick={() => setTab(t)} style={{ padding:'12px 16px', fontSize:13, cursor:'pointer', color:tab===t ? s.text : s.dim, borderBottom:tab===t ? `2px solid ${s.accent}` : '2px solid transparent', fontWeight:tab===t ? 500 : 300, transition:'all 0.15s' }}>
            {l}
          </div>
        ))}
      </div>

      <div style={{ maxWidth:640, margin:'0 auto', padding:'20px 16px' }}>

        {/* ── ГЛАВНАЯ ── */}
        {tab === 'home' && (
          <div style={{ display:'flex', flexDirection:'column', gap:16, animation:'fadeUp 0.3s forwards' }}>

            {!completedSession ? (
              /* No diagnosis */
              <div style={{ textAlign:'center', padding:'60px 20px' }}>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:56, color:s.accent, opacity:0.2, marginBottom:24 }}>◎</div>
                <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:400, marginBottom:10 }}>
                  Привет{userName ? `, ${userName}` : ''}
                </h2>
                <p style={{ fontSize:14, color:s.dim, lineHeight:1.8, maxWidth:320, margin:'0 auto 28px' }}>
                  Начни с диагностики — и получишь карту своего состояния и план на 2–3 месяца.
                </p>
                <button onClick={() => router.push('/chat')} style={{ background:s.accent, color:s.bg, border:'none', borderRadius:100, padding:'12px 32px', fontSize:14, fontWeight:500, cursor:'pointer' }}>
                  Начать диагностику
                </button>
              </div>
            ) : (
              <>
                {/* State Map overview */}
                {stateMapOverview && (
                  <div style={{ background:s.surface, border:`1px solid rgba(200,184,154,0.15)`, borderRadius:16, padding:'16px 20px' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                      <div style={{ fontFamily:"'Playfair Display',serif", fontSize:14, color:s.accent }}>🧬 State Map</div>
                      <div style={{ display:'flex', gap:8 }}>
                        <button onClick={() => router.push('/dashboard/priorities')} style={{ fontSize:11, color:s.accent, background:'rgba(200,184,154,0.1)', border:`1px solid rgba(200,184,154,0.2)`, borderRadius:6, padding:'4px 10px', cursor:'pointer' }}>
                          Приоритеты →
                        </button>
                        <button onClick={() => router.push('/chat')} style={{ fontSize:11, color:s.dim, background:'none', border:`1px solid ${s.border}`, borderRadius:6, padding:'4px 10px', cursor:'pointer' }}>
                          Новая
                        </button>
                      </div>
                    </div>
                    <p style={{ fontSize:13, color:s.dim, lineHeight:1.75, marginBottom: priorities.length ? 14 : 0 }}>{stateMapOverview}</p>
                    {priorities.length > 0 && (
                      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                        {priorities.map((p, i) => (
                          <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'8px 10px', background:s.surface2, borderRadius:8 }}>
                            <span style={{ fontSize:11, color:s.accent, fontWeight:500, flexShrink:0, marginTop:1 }}>{i+1}</span>
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

                {/* Quick actions */}
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => router.push('/checkin')} style={{ flex:2, padding:'13px', borderRadius:12, background: todayCheckinDone ? 'rgba(122,184,122,0.12)' : 'rgba(200,184,154,0.12)', border:`1px solid ${todayCheckinDone ? 'rgba(122,184,122,0.3)' : 'rgba(200,184,154,0.25)'}`, color: todayCheckinDone ? s.green : s.accent, fontSize:14, fontWeight:500, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                    {todayCheckinDone ? '✓ Чекин пройден' : '⚡ Чекин сегодня'}
                  </button>
                  <button onClick={() => router.push('/dashboard/insights')} style={{ flex:1, padding:'13px', borderRadius:12, background:s.surface, border:`1px solid ${s.border}`, color:s.dim, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                    📊
                  </button>
                </div>

                {/* Today wellbeing */}
                {todayLog && (todayLog.energy || todayLog.mood || todayLog.meaning || todayLog.connection) && (
                  <div style={{ background:s.surface, border:`1px solid ${s.border}`, borderRadius:16, padding:'16px 20px' }}>
                    <div style={{ fontSize:11, color:s.muted, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:14 }}>
                      Сегодня · {todayLog.wellbeing_index ? `Индекс ${parseFloat(todayLog.wellbeing_index).toFixed(1)}` : ''}
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
                      {Object.entries(DIM).map(([key, cfg]) => (
                        <div key={key} style={{ textAlign:'center' }}>
                          <div style={{ position:'relative', display:'inline-block', marginBottom:4 }}>
                            <MiniRing value={todayLog[key]} color={cfg.color} size={52} />
                            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:500, color: todayLog[key] ? cfg.color : s.muted }}>
                              {todayLog[key] || '—'}
                            </div>
                          </div>
                          <div style={{ fontSize:10, color:s.dim }}>{cfg.emoji} {cfg.label}</div>
                        </div>
                      ))}
                    </div>
                    {todayLog.sleep_quality && (
                      <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid ${s.border}`, display:'flex', gap:16, fontSize:12, color:s.dim }}>
                        {todayLog.sleep_quality && <span>😴 {todayLog.sleep_quality === 'good' ? 'Отдохнул' : todayLog.sleep_quality === 'ok' ? 'Нормально' : 'Разбит'}</span>}
                        {todayLog.workout !== null && <span>🏃 {todayLog.workout ? 'Тренировка' : 'Без тренировки'}</span>}
                        {todayLog.steps && <span>👣 {todayLog.steps.toLocaleString()}</span>}
                        {todayLog.anxiety_level && <span>🫁 Тревога {todayLog.anxiety_level}</span>}
                      </div>
                    )}
                  </div>
                )}

                {/* Week trend */}
                {weekLogs.length > 0 && (
                  <div style={{ background:s.surface, border:`1px solid ${s.border}`, borderRadius:16, padding:'16px 20px' }}>
                    <div style={{ fontSize:11, color:s.muted, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:14 }}>Средние за неделю</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      {Object.entries(DIM).map(([key, cfg]) => {
                        const avg = weekAvg(key)
                        return avg ? (
                          <div key={key} style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <span style={{ fontSize:14, width:20 }}>{cfg.emoji}</span>
                            <span style={{ fontSize:12, color:s.dim, width:90 }}>{cfg.label}</span>
                            <div style={{ flex:1, height:4, background:s.surface2, borderRadius:2, overflow:'hidden' }}>
                              <div style={{ height:'100%', width:`${(parseFloat(avg)/10)*100}%`, background:cfg.color, borderRadius:2, transition:'width 0.6s' }} />
                            </div>
                            <span style={{ fontSize:14, fontWeight:500, color:cfg.color, width:28, textAlign:'right' }}>{avg}</span>
                          </div>
                        ) : null
                      })}
                    </div>
                  </div>
                )}

                {/* Active sprints */}
                {activeSprints.length > 0 && (
                  <div>
                    <div style={{ fontSize:11, color:s.muted, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:12 }}>Активные спринты</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      {activeSprints.map(sprint => (
                        <SprintCard key={sprint.id} sprint={sprint} checkins={checkins} today={today} router={router} />
                      ))}
                    </div>
                  </div>
                )}

                {activeSprints.length === 0 && (
                  <div style={{ textAlign:'center', padding:'32px 20px', border:`1px dashed ${s.border}`, borderRadius:16 }}>
                    <p style={{ fontSize:14, color:s.dim, marginBottom:16 }}>Нет активных спринтов</p>
                    <button onClick={() => router.push('/dashboard/priorities')} style={{ background:s.accent, color:s.bg, border:'none', borderRadius:100, padding:'10px 24px', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                      Составить план →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── ИСТОРИЯ ── */}
        {tab === 'history' && (
          <div style={{ display:'flex', flexDirection:'column', gap:8, animation:'fadeUp 0.3s forwards' }}>
            {sessions.map(s => (
              <div key={s.id} onClick={() => router.push(`/chat?session=${s.id}`)} style={{ background:'#141416', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:500, color:'#e8e6e0', marginBottom:3 }}>
                    {s.completed ? '🧬 Диагностика завершена' : '◔ В процессе'}
                  </div>
                  <div style={{ fontSize:12, color:'#7a7870' }}>
                    {new Date(s.created_at).toLocaleDateString('ru', { day:'numeric', month:'long', year:'numeric' })}
                  </div>
                </div>
                <div style={{ fontSize:12, color:'#c8b89a' }}>Открыть →</div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}

function SprintCard({ sprint, checkins, today, router }) {
  const sprintCheckins = checkins.filter(c => c.sprint_id === sprint.id)
  const doneCount = sprintCheckins.filter(c => c.completed).length
  const todayDone = sprintCheckins.some(c => c.date === today && c.completed)
  const pct = Math.round((doneCount / (sprint.target_days || 14)) * 100)

  const weekDays = []
  const dayLabels = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    const check = sprintCheckins.find(c => c.date === dateStr)
    const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1
    weekDays.push({ dateStr, isToday: dateStr === today, done: check?.completed, missed: check && !check.completed, label: dayLabels[dayIdx] })
  }

  return (
    <div style={{ background:'#141416', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'14px 16px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
        <div style={{ fontSize:14, fontWeight:500, color:'#e8e6e0' }}>{sprint.behavior_name}</div>
        <div style={{ fontSize:11, padding:'2px 8px', borderRadius:6, background:'rgba(110,168,200,0.12)', color:'#6ea8c8' }}>
          {doneCount}/{sprint.target_days || 14}
        </div>
      </div>
      <div style={{ fontSize:11, color:'#3d3d3d', marginBottom:10 }}>⚓ {sprint.anchor}</div>

      {/* Week dots */}
      <div style={{ display:'flex', gap:4, marginBottom:10 }}>
        {weekDays.map((d, i) => (
          <div key={i} style={{ flex:1, textAlign:'center' }}>
            <div style={{ width:'100%', aspectRatio:'1', borderRadius:5, background: d.done ? 'rgba(122,184,122,0.25)' : d.missed ? 'rgba(224,112,112,0.15)' : d.isToday ? 'rgba(200,184,154,0.12)' : '#1a1a1e', border:`1px solid ${d.done ? 'rgba(122,184,122,0.4)' : d.missed ? 'rgba(224,112,112,0.25)' : d.isToday ? 'rgba(200,184,154,0.25)' : 'transparent'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color: d.done ? '#7ab87a' : d.missed ? '#e07070' : '#3d3d3d' }}>
              {d.done ? '✓' : d.missed ? '×' : ''}
            </div>
            <div style={{ fontSize:9, color:'#3d3d3d', marginTop:2 }}>{d.label}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ height:3, background:'#1a1a1e', borderRadius:2, marginBottom:10 }}>
        <div style={{ height:'100%', width:`${pct}%`, background:'#6ea8c8', borderRadius:2, transition:'width 0.4s' }} />
      </div>

      <button onClick={() => router.push('/checkin')} style={{ width:'100%', padding:'8px', borderRadius:8, border:'none', background: todayDone ? 'rgba(122,184,122,0.12)' : 'rgba(200,184,154,0.12)', color: todayDone ? '#7ab87a' : '#c8b89a', fontSize:12, fontWeight:500, cursor:'pointer', border:`1px solid ${todayDone ? 'rgba(122,184,122,0.25)' : 'rgba(200,184,154,0.2)'}` }}>
        {todayDone ? '✓ Чекин сегодня пройден' : '→ Открыть чекин'}
      </button>
    </div>
  )
}
