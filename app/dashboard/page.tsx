// @ts-nocheck
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [sessions, setSessions] = useState([])
  const [sprints, setSprints] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('sprints')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.push('/'); return }
      const u = data.session.user
      setUser(u)

      const [{ data: sess }, { data: spr }] = await Promise.all([
        supabase.from('sessions').select('*').eq('user_id', u.id).order('created_at', { ascending: false }),
        supabase.from('sprints').select('*').eq('user_id', u.id).order('created_at', { ascending: false }),
      ])
      setSessions(sess || [])
      setSprints(spr || [])
      setLoading(false)
    })
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  async function startDiagnosis() {
    const { data } = await supabase.auth.getSession()
    const userId = data.session?.user.id
    const userName = data.session?.user.user_metadata?.name

    const { data: session } = await supabase.from('sessions').insert({
      user_id: userId,
      user_name: userName,
      messages: [],
      current_layer: 0,
      completed: false,
    }).select('id').single()

    if (session) router.push(`/chat?session=${session.id}`)
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ fontSize:14, color:'var(--text-dim,#7a7870)' }}>Загружаем...</div>
    </div>
  )

  const completedSession = sessions.find(s => s.completed)
  const activeSprints = sprints.filter(s => s.status === 'active')
  const userName = user?.user_metadata?.name || user?.email?.split('@')[0]

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column' }}>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Header */}
      <header style={{ padding:'16px 32px', borderBottom:'1px solid var(--border,rgba(255,255,255,0.07))', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:10 }}>
          <span style={{ fontFamily:"'Playfair Display',serif", fontSize:18, color:'var(--accent,#c8b89a)' }}>Life OS</span>
          <span style={{ fontSize:11, color:'var(--text-muted,#3d3d3d)', textTransform:'uppercase', letterSpacing:'0.1em' }}>Dashboard</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <span style={{ fontSize:13, color:'var(--text-dim,#7a7870)' }}>{userName}</span>
          <button onClick={signOut} style={{ fontSize:12, color:'var(--text-dim,#7a7870)', background:'none', border:'1px solid var(--border,rgba(255,255,255,0.07))', borderRadius:8, padding:'6px 12px', cursor:'pointer' }}>
            Выйти
          </button>
        </div>
      </header>

      <div style={{ flex:1, padding:'32px', maxWidth:900, margin:'0 auto', width:'100%', animation:'fadeIn 0.4s forwards' }}>

        {/* No diagnosis yet */}
        {!completedSession ? (
          <div style={{ textAlign:'center', padding:'60px 20px' }}>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:48, color:'var(--accent,#c8b89a)', opacity:0.3, marginBottom:24 }}>◎</div>
            <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:24, fontWeight:400, marginBottom:12 }}>
              Привет{userName ? `, ${userName}` : ''}
            </h2>
            <p style={{ fontSize:14, color:'var(--text-dim,#7a7870)', lineHeight:1.8, maxWidth:360, margin:'0 auto 32px' }}>
              Ты ещё не прошёл диагностику. Начни — и получишь карту своего состояния и план на 2–3 месяца.
            </p>
            <button onClick={startDiagnosis} style={{ background:'var(--accent,#c8b89a)', color:'var(--bg,#0d0d0f)', border:'none', borderRadius:100, padding:'13px 36px', fontFamily:"'DM Sans',sans-serif", fontSize:14, fontWeight:500, cursor:'pointer' }}>
              Начать диагностику
            </button>
          </div>
        ) : (
          <>
            {/* State Map summary */}
            <div style={{ background:'var(--surface,#141416)', border:'1px solid rgba(200,184,154,0.2)', borderRadius:16, padding:'20px 24px', marginBottom:24 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:16, color:'var(--accent,#c8b89a)' }}>🧬 State Map</div>
                <div style={{ display:'flex', gap:8 }}>
                  <span style={{ fontSize:11, color:'var(--text-dim,#7a7870)' }}>
                    {new Date(completedSession.created_at).toLocaleDateString('ru', { day:'numeric', month:'long' })}
                  </span>
                  <button onClick={startDiagnosis} style={{ fontSize:12, color:'var(--accent,#c8b89a)', background:'none', border:'1px solid rgba(200,184,154,0.2)', borderRadius:8, padding:'4px 10px', cursor:'pointer' }}>
                    Новая диагностика
                  </button>
                </div>
              </div>
              <p style={{ fontSize:13, color:'var(--text-dim,#7a7870)', lineHeight:1.75 }}>
                {completedSession.state_map?.split('\n')[0]?.replace('ОБЩАЯ КАРТИНА:', '').trim() || 'Диагностика завершена.'}
              </p>
            </div>

            {/* Tabs */}
            <div style={{ display:'flex', gap:4, marginBottom:24, background:'var(--surface,#141416)', borderRadius:12, padding:4, border:'1px solid var(--border,rgba(255,255,255,0.07))' }}>
              {[['sprints','Спринты'],['history','История']].map(([t,l]) => (
                <div key={t} onClick={() => setTab(t)} style={{ flex:1, padding:'8px 12px', borderRadius:8, fontSize:13, textAlign:'center', cursor:'pointer', background:tab===t?'var(--surface2,#1a1a1e)':'transparent', color:tab===t?'var(--text,#e8e6e0)':'var(--text-dim,#7a7870)', fontWeight:tab===t?500:300, transition:'all 0.15s' }}>
                  {l}
                </div>
              ))}
            </div>

            {tab === 'sprints' && (
              <div>
                <div style={{ display:'flex', gap:8, marginBottom:20 }}>
  <button onClick={() => router.push('/checkin')} style={{ flex:1, padding:'11px', borderRadius:12, background:'rgba(200,184,154,0.1)', border:'1px solid rgba(200,184,154,0.25)', color:'var(--accent,#c8b89a)', fontSize:13, fontWeight:500, cursor:'pointer' }}>
    ⚡ Чекин сегодня
  </button>
  <button onClick={() => router.push('/dashboard/insights')} style={{ flex:1, padding:'11px', borderRadius:12, background:'var(--surface,#141416)', border:'1px solid var(--border,rgba(255,255,255,0.07))', color:'var(--text-dim,#7a7870)', fontSize:13, cursor:'pointer' }}>
    📊 Аналитика
  </button>
</div>
                {activeSprints.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'40px 20px', border:'1px dashed var(--border,rgba(255,255,255,0.07))', borderRadius:16 }}>
                    <p style={{ fontSize:14, color:'var(--text-dim,#7a7870)', marginBottom:20 }}>Нет активных спринтов. Начни разговор чтобы составить первый.</p>
                    <button onClick={() => router.push(`/chat?session=${completedSession.id}`)} style={{ background:'var(--accent,#c8b89a)', color:'var(--bg,#0d0d0f)', border:'none', borderRadius:100, padding:'11px 28px', fontFamily:"'DM Sans',sans-serif", fontSize:13, fontWeight:500, cursor:'pointer' }}>
                      Составить план спринтов
                    </button>
                  </div>
                ) : (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:12 }}>
                    {activeSprints.map(sprint => (
                      <SprintCard key={sprint.id} sprint={sprint} onCheckin={() => router.push(`/checkin?sprint=${sprint.id}`)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'history' && (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {sessions.map(s => (
                  <div key={s.id} style={{ background:'var(--surface,#141416)', border:'1px solid var(--border,rgba(255,255,255,0.07))', borderRadius:12, padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer' }} onClick={() => router.push(`/chat?session=${s.id}`)}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:500, color:'var(--text,#e8e6e0)', marginBottom:3 }}>
                        {s.completed ? '🧬 Диагностика завершена' : '◔ В процессе'}
                      </div>
                      <div style={{ fontSize:12, color:'var(--text-dim,#7a7870)' }}>
                        {new Date(s.created_at).toLocaleDateString('ru', { day:'numeric', month:'long', year:'numeric' })}
                      </div>
                    </div>
                    <div style={{ fontSize:12, color:'var(--accent,#c8b89a)' }}>Открыть →</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function SprintCard({ sprint, onCheckin }) {
  const [todayDone, setTodayDone] = useState(false)
  const [checkins, setCheckins] = useState([])

  useEffect(() => {
    supabase.from('checkins').select('*').eq('sprint_id', sprint.id)
      .then(({ data }) => {
        if (!data) return
        setCheckins(data)
        const today = new Date().toISOString().split('T')[0]
        setTodayDone(data.some(c => c.date === today && c.completed))
      })
  }, [sprint.id])

  const daysTotal = sprint.target_days || 14
  const doneCount = checkins.filter(c => c.completed).length
  const pct = Math.round((doneCount / daysTotal) * 100)

  async function markToday() {
    const today = new Date().toISOString().split('T')[0]
    const { data: { session } } = await supabase.auth.getSession()
    await supabase.from('checkins').upsert({ sprint_id: sprint.id, user_id: session.user.id, date: today, completed: true }, { onConflict: 'sprint_id,date' })
    setTodayDone(true)
    setCheckins(prev => [...prev.filter(c => c.date !== today), { date: today, completed: true }])
  }

  return (
    <div style={{ background:'var(--surface,#141416)', border:'1px solid var(--border,rgba(255,255,255,0.07))', borderRadius:14, padding:'16px 18px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <div style={{ fontSize:14, fontWeight:500, color:'var(--text,#e8e6e0)' }}>{sprint.behavior_name}</div>
        <div style={{ fontSize:11, padding:'3px 8px', borderRadius:6, background:'rgba(110,168,200,0.15)', color:'#6ea8c8' }}>Активен</div>
      </div>
      <div style={{ fontSize:12, color:'var(--text-dim,#7a7870)', marginBottom:6, lineHeight:1.5 }}>{sprint.behavior_description}</div>
      <div style={{ fontSize:11, color:'var(--text-muted,#3d3d3d)', marginBottom:12, display:'flex', alignItems:'center', gap:5 }}>
        ⚓ {sprint.anchor}
      </div>
      <div style={{ height:4, background:'var(--surface2,#1a1a1e)', borderRadius:2, marginBottom:6 }}>
        <div style={{ height:'100%', width:`${pct}%`, background:'#6ea8c8', borderRadius:2, transition:'width 0.3s' }} />
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--text-muted,#3d3d3d)', marginBottom:14 }}>
        <span>{doneCount} из {daysTotal} дней</span>
        <span>{pct}%</span>
      </div>
      <button
        onClick={markToday}
        disabled={todayDone}
        style={{ width:'100%', padding:'9px', borderRadius:10, border:'none', background:todayDone?'rgba(122,184,122,0.15)':'var(--accent,#c8b89a)', color:todayDone?'#7ab87a':'var(--bg,#0d0d0f)', fontSize:13, fontWeight:500, cursor:todayDone?'default':'pointer', transition:'all 0.2s' }}
      >
        {todayDone ? '✓ Сегодня выполнено' : 'Отметить сегодня'}
      </button>
    </div>
  )
}
