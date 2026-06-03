// @ts-nocheck
'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { VoiceButton } from '@/lib/VoiceButton'

const WELLBEING_DIMS = [
  { key: 'energy', label: 'Энергия', emoji: '⚡', color: '#c8a86e', question: 'Как физически ощущается тело?',
    why: 'Энергия — прямой выход физиологии. Отражает качество сна, питания и движения. Когда энергия стабильно низкая — один из физиологических слоёв не работает.' },
  { key: 'mood', label: 'Настроение', emoji: '🌊', color: '#6ea8c8', question: 'Какой эмоциональный фон сегодня?',
    why: 'Настроение коррелирует с состоянием ВНС и уровнем тревоги. Отслеживание помогает замечать паттерны и вовремя работать с нервной системой.' },
  { key: 'meaning', label: 'Смысл', emoji: '🌱', color: '#7ab87a', question: 'Ощущался ли смысл в дне?',
    why: 'Смысл предсказывает долгосрочное счастье лучше настроения (Seligman PERMA). Можно устать но если день был значимым — это хороший день.' },
  { key: 'connection', label: 'Связь', emoji: '🤝', color: '#a86ec8', question: 'Был ли контакт — с людьми или собой?',
    why: 'Самый мощный предиктор счастья по Гарвардскому исследованию (80 лет, 724 участника). Качество связи важнее количества.' },
]

function InfoModal({ dim, onClose }) {
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'#141416', border:`1px solid ${dim.color}40`, borderRadius:20, padding:28, maxWidth:400, width:'100%' }}>
        <div style={{ fontSize:28, marginBottom:12 }}>{dim.emoji}</div>
        <div style={{ fontSize:15, fontWeight:500, color:'#e8e6e0', marginBottom:12 }}>Почему важно отслеживать {dim.label.toLowerCase()}</div>
        <div style={{ fontSize:13, color:'#7a7870', lineHeight:1.8, marginBottom:20 }}>{dim.why}</div>
        <button onClick={onClose} style={{ width:'100%', padding:'10px', borderRadius:10, background:`${dim.color}20`, border:`1px solid ${dim.color}40`, color:dim.color, fontSize:13, fontWeight:500, cursor:'pointer' }}>
          Понятно
        </button>
      </div>
    </div>
  )
}

function CheckinContent() {
  const router = useRouter()
  const [step, setStep] = useState('loading') // loading | sprint | physio | done

  const [user, setUser] = useState(null)
  const [sprint, setSprint] = useState(null)
  const [infoModal, setInfoModal] = useState(null)
  const [saving, setSaving] = useState(false)

  // Sprint checkin
  const [sprintDone, setSprintDone] = useState(null)
  const [barrier, setBarrier] = useState('')
  const [weekDays, setWeekDays] = useState([])

  // Wellbeing
  const [wellbeing, setWellbeing] = useState({ energy: null, mood: null, meaning: null, connection: null })

  // Physio
  const [sleepQuality, setSleepQuality] = useState(null)
  const [wakeTime, setWakeTime] = useState('')
  const [workout, setWorkout] = useState(null)
  const [steps, setSteps] = useState('')
  const [anxietyLevel, setAnxietyLevel] = useState(null)
  const [regulation, setRegulation] = useState(null)

  const today = new Date().toISOString().split('T')[0]
  const dayLabels = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']

  useEffect(() => {
    async function load() {
      try {
        const { data: authData } = await supabase.auth.getSession()
        if (!authData?.session) { router.push('/'); return }
        const u = authData.session.user
        setUser(u)

        const { data: sprintData } = await supabase
          .from('sprints').select('*').eq('user_id', u.id).eq('status', 'active')
          .order('created_at', { ascending: false }).limit(1)

        const spr = sprintData?.[0] || null
        setSprint(spr)

        if (spr) {
          const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 6)
          const { data: checks } = await supabase.from('checkins').select('*')
            .eq('sprint_id', spr.id).gte('date', weekAgo.toISOString().split('T')[0])

          const days = []
          for (let i = 6; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i)
            const dateStr = d.toISOString().split('T')[0]
            const check = checks?.find(c => c.date === dateStr)
            const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1
            days.push({ dateStr, isToday: dateStr === today, done: check?.completed, missed: check && !check.completed, label: dayLabels[dayIdx] })
          }
          setWeekDays(days)

          const todayCheck = checks?.find(c => c.date === today)
          if (todayCheck) setSprintDone(todayCheck.completed ? 'yes' : todayCheck.note ? 'partial' : 'no')
          if (todayCheck?.note) setBarrier(todayCheck.note)
        }

        // Load today's daily log if exists
        const { data: logData } = await supabase
          .from('daily_logs').select('*').eq('user_id', u.id).eq('date', today)
          .maybeSingle()

        if (logData) {
          setWellbeing({ energy: logData.energy, mood: logData.mood, meaning: logData.meaning, connection: logData.connection })
          setSleepQuality(logData.sleep_quality)
          setWakeTime(logData.wake_time || '')
          setWorkout(logData.workout)
          setSteps(logData.steps?.toString() || '')
          setAnxietyLevel(logData.anxiety_level)
          setRegulation(logData.regulation_practice)
        }

        setStep('sprint')
      } catch(e) {
        console.error('Load error:', e)
        setStep('sprint')
      }
    }
    load()
  }, [])

  async function saveSprint() {
    if (!sprintDone || !sprint || !user) { setStep('physio'); return }
    await supabase.from('checkins').upsert({
      sprint_id: sprint.id, user_id: user.id, date: today,
      completed: sprintDone === 'yes', note: barrier || null,
    }, { onConflict: 'sprint_id,date' })
    setStep('physio')
  }

  async function savePhysio() {
    if (!user) return
    setSaving(true)
    const filled = Object.values(wellbeing).filter(Boolean)
    const wellbeingIndex = filled.length > 0 ? filled.reduce((a,b) => a+b, 0) / filled.length : null

    await supabase.from('daily_logs').upsert({
      user_id: user.id, date: today,
      wake_time: wakeTime || null, sleep_quality: sleepQuality,
      steps: steps ? parseInt(steps) : null, workout,
      anxiety_level: anxietyLevel, regulation_practice: regulation,
      energy: wellbeing.energy, mood: wellbeing.mood,
      meaning: wellbeing.meaning, connection: wellbeing.connection,
      wellbeing_index: wellbeingIndex,
    }, { onConflict: 'user_id,date' })

    setSaving(false)
    setStep('done')
    setTimeout(() => router.push('/dashboard'), 1500)
  }

  const s = { bg:'#0d0d0f', surface:'#141416', surface2:'#1a1a1e', border:'rgba(255,255,255,0.07)', text:'#e8e6e0', dim:'#7a7870', muted:'#3d3d3d', accent:'#c8b89a' }

  if (step === 'loading') return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:s.bg }}>
      <div style={{ fontSize:14, color:s.dim }}>Загружаем...</div>
    </div>
  )

  if (step === 'done') return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:s.bg }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>✓</div>
        <div style={{ fontSize:16, color:s.text }}>Чекин сохранён</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:s.bg, color:s.text, fontFamily:"'DM Sans',sans-serif", fontWeight:300 }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {infoModal && <InfoModal dim={infoModal} onClose={() => setInfoModal(null)} />}

      {/* Header */}
      <header style={{ padding:'14px 20px', borderBottom:`1px solid ${s.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <button onClick={() => router.push('/dashboard')} style={{ fontSize:13, color:s.dim, background:'none', border:'none', cursor:'pointer' }}>← Назад</button>
        <span style={{ fontFamily:"'Playfair Display',serif", fontSize:16, color:s.accent }}>
          {step === 'sprint' ? '⚡ Спринт' : '📊 Состояние'} · {new Date().toLocaleDateString('ru', { day:'numeric', month:'long' })}
        </span>
        <div style={{ width:50 }} />
      </header>

      <div style={{ maxWidth:480, margin:'0 auto', padding:'20px 16px 100px' }}>

        {/* ── ЭКРАН 1: СПРИНТ ── */}
        {step === 'sprint' && (
          <div style={{ animation:'fadeUp 0.3s forwards' }}>
            {sprint ? (
              <>
                {/* Sprint info */}
                <div style={{ background:s.surface, border:`1px solid ${s.border}`, borderRadius:16, padding:'18px 20px', marginBottom:20 }}>
                  <div style={{ fontSize:11, color:s.muted, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:8 }}>
                    День {Math.ceil((new Date() - new Date(sprint.started_at)) / 86400000) + 1} из {sprint.target_days}
                  </div>
                  <div style={{ fontSize:17, fontWeight:500, marginBottom:6 }}>{sprint.behavior_name}</div>
                  <div style={{ fontSize:12, color:s.dim, marginBottom:8 }}>{sprint.behavior_description}</div>
                  <div style={{ fontSize:11, color:s.muted }}>⚓ {sprint.anchor}</div>
                </div>

                {/* Week track */}
                <div style={{ marginBottom:24 }}>
                  <div style={{ fontSize:11, color:s.muted, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10 }}>Эта неделя</div>
                  <div style={{ display:'flex', gap:6 }}>
                    {weekDays.map((d, i) => (
                      <div key={i} style={{ flex:1, textAlign:'center' }}>
                        <div style={{ width:'100%', aspectRatio:'1', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, background: d.done ? 'rgba(122,184,122,0.2)' : d.missed ? 'rgba(224,112,112,0.15)' : d.isToday ? s.surface2 : s.surface, border:`1px solid ${d.done ? 'rgba(122,184,122,0.4)' : d.missed ? 'rgba(224,112,112,0.3)' : d.isToday ? 'rgba(200,184,154,0.3)' : 'rgba(255,255,255,0.05)'}` }}>
                          {d.done ? '✓' : d.missed ? '×' : d.isToday ? '·' : ''}
                        </div>
                        <div style={{ fontSize:10, color:s.muted, marginTop:4 }}>{d.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Main question */}
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:15, marginBottom:14, lineHeight:1.5 }}>
                    Выполнил <strong>{sprint.behavior_name}</strong> сегодня?
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    {[['yes','✓ Да','#7ab87a'],['partial','≈ Частично','#c8a86e'],['no','× Нет','#e07070']].map(([val,label,color]) => (
                      <button key={val} onClick={() => setSprintDone(val)} style={{ flex:1, padding:'12px 8px', borderRadius:12, border:`1px solid ${sprintDone===val ? color : s.border}`, background:sprintDone===val ? `${color}20` : s.surface, color:sprintDone===val ? color : s.dim, fontSize:13, fontWeight:sprintDone===val ? 500 : 300, cursor:'pointer', transition:'all 0.15s' }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {(sprintDone === 'no' || sprintDone === 'partial') && (
                  <div style={{ marginBottom:20, animation:'fadeUp 0.2s forwards' }}>
                    <div style={{ fontSize:13, color:s.dim, marginBottom:8 }}>Что помешало?</div>
                    <div style={{ display:'flex', gap:8 }}>
                    <input value={barrier} onChange={e => setBarrier(e.target.value)} placeholder="Коротко..." style={{ flex:1, background:s.surface, border:`1px solid rgba(255,255,255,0.1)`, borderRadius:10, padding:'10px 12px', color:s.text, fontFamily:"'DM Sans',sans-serif", fontSize:13, outline:'none' }} />
                    <VoiceButton size={40} onResult={(text) => setBarrier(text)} />
                  </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign:'center', padding:'40px 20px', border:`1px dashed ${s.border}`, borderRadius:16 }}>
                <div style={{ fontSize:14, color:s.dim, marginBottom:16 }}>Нет активных спринтов</div>
                <button onClick={() => router.push('/dashboard/priorities')} style={{ background:s.accent, color:'#0d0d0f', border:'none', borderRadius:100, padding:'10px 24px', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                  Создать спринт →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── ЭКРАН 2: СОСТОЯНИЕ ── */}
        {step === 'physio' && (
          <div style={{ animation:'fadeUp 0.3s forwards', display:'flex', flexDirection:'column', gap:16 }}>

            {/* 4 измерения */}
            <div style={{ background:s.surface, border:`1px solid ${s.border}`, borderRadius:16, padding:'18px 20px' }}>
              <div style={{ fontSize:11, color:s.muted, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:16 }}>Благополучие сегодня</div>
              {WELLBEING_DIMS.map(dim => (
                <div key={dim.key} style={{ marginBottom:18 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                    <span style={{ fontSize:16 }}>{dim.emoji}</span>
                    <span style={{ fontSize:14, fontWeight:500 }}>{dim.label}</span>
                    <span style={{ fontSize:12, color:s.dim, flex:1 }}>{dim.question}</span>
                    <button onClick={() => setInfoModal(dim)} style={{ width:22, height:22, borderRadius:'50%', border:`1px solid ${dim.color}40`, background:`${dim.color}10`, color:dim.color, fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>?</button>
                  </div>
                  <div style={{ display:'flex', gap:4 }}>
                    {[1,2,3,4,5,6,7,8,9,10].map(v => (
                      <button key={v} onClick={() => setWellbeing(w => ({ ...w, [dim.key]: v }))} style={{ flex:1, height:34, borderRadius:7, background:wellbeing[dim.key]===v ? dim.color : s.surface2, border:`1px solid ${wellbeing[dim.key]===v ? dim.color : s.border}`, color:wellbeing[dim.key]===v ? '#0d0d0f' : s.dim, fontSize:12, fontWeight:wellbeing[dim.key]===v ? 600 : 400, cursor:'pointer', transition:'all 0.15s', transform:wellbeing[dim.key]===v ? 'scale(1.1)' : 'scale(1)' }}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {Object.values(wellbeing).filter(Boolean).length === 4 && (
                <div style={{ marginTop:8, padding:'10px 14px', background:'rgba(200,184,154,0.08)', border:'1px solid rgba(200,184,154,0.2)', borderRadius:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:12, color:s.dim }}>Индекс благополучия</span>
                  <span style={{ fontSize:20, fontWeight:500, color:s.accent }}>
                    {(Object.values(wellbeing).reduce((a,b) => a+b, 0) / 4).toFixed(1)}
                  </span>
                </div>
              )}
            </div>

            {/* Сон */}
            <div style={{ background:s.surface, border:`1px solid ${s.border}`, borderRadius:16, padding:'18px 20px' }}>
              <div style={{ fontSize:11, color:s.muted, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:14 }}>😴 Сон</div>
              <div style={{ display:'flex', gap:10, marginBottom:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, color:s.dim, marginBottom:6 }}>Время подъёма</div>
                  <input type="time" value={wakeTime} onChange={e => setWakeTime(e.target.value)} style={{ width:'100%', background:s.surface2, border:`1px solid ${s.border}`, borderRadius:8, padding:'8px 10px', color:s.text, fontSize:13, outline:'none', boxSizing:'border-box' }} />
                </div>
              </div>
              <div style={{ fontSize:12, color:s.dim, marginBottom:8 }}>Качество утра</div>
              <div style={{ display:'flex', gap:8 }}>
                {[['good','😊 Отдохнул'],['ok','😐 Нормально'],['bad','😮‍💨 Разбит']].map(([val,label]) => (
                  <button key={val} onClick={() => setSleepQuality(val)} style={{ flex:1, padding:'8px 6px', borderRadius:10, border:`1px solid ${sleepQuality===val ? 'rgba(200,184,154,0.4)' : s.border}`, background:sleepQuality===val ? 'rgba(200,184,154,0.12)' : s.surface2, color:sleepQuality===val ? s.accent : s.dim, fontSize:12, cursor:'pointer', transition:'all 0.15s' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Движение */}
            <div style={{ background:s.surface, border:`1px solid ${s.border}`, borderRadius:16, padding:'18px 20px' }}>
              <div style={{ fontSize:11, color:s.muted, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:14 }}>🏃 Движение</div>
              <div style={{ display:'flex', gap:10, marginBottom:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, color:s.dim, marginBottom:6 }}>Шаги</div>
                  <input type="number" value={steps} onChange={e => setSteps(e.target.value)} placeholder="—" style={{ width:'100%', background:s.surface2, border:`1px solid ${s.border}`, borderRadius:8, padding:'8px 10px', color:s.text, fontSize:13, outline:'none', boxSizing:'border-box' }} />
                </div>
              </div>
              <div style={{ fontSize:12, color:s.dim, marginBottom:8 }}>Тренировка сегодня?</div>
              <div style={{ display:'flex', gap:8 }}>
                {[['true','✓ Да'],['false','× Нет']].map(([val,label]) => (
                  <button key={val} onClick={() => setWorkout(val === 'true')} style={{ flex:1, padding:'8px', borderRadius:10, border:`1px solid ${String(workout)===val ? (val==='true' ? 'rgba(122,184,122,0.4)' : 'rgba(224,112,112,0.3)') : s.border}`, background:String(workout)===val ? (val==='true' ? 'rgba(122,184,122,0.12)' : 'rgba(224,112,112,0.1)') : s.surface2, color:String(workout)===val ? (val==='true' ? '#7ab87a' : '#e07070') : s.dim, fontSize:13, cursor:'pointer', transition:'all 0.15s' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* ВНС */}
            <div style={{ background:s.surface, border:`1px solid ${s.border}`, borderRadius:16, padding:'18px 20px' }}>
              <div style={{ fontSize:11, color:s.muted, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:14 }}>🫁 ВНС</div>
              <div style={{ fontSize:12, color:s.dim, marginBottom:8 }}>Уровень тревоги за день</div>
              <div style={{ display:'flex', gap:4, marginBottom:14 }}>
                {[1,2,3,4,5,6,7,8,9,10].map(v => (
                  <button key={v} onClick={() => setAnxietyLevel(v)} style={{ flex:1, height:34, borderRadius:7, background:anxietyLevel===v ? '#6ea8c8' : s.surface2, border:`1px solid ${anxietyLevel===v ? '#6ea8c8' : s.border}`, color:anxietyLevel===v ? '#0d0d0f' : s.dim, fontSize:12, fontWeight:anxietyLevel===v ? 600 : 400, cursor:'pointer', transition:'all 0.15s' }}>
                    {v}
                  </button>
                ))}
              </div>
              <div style={{ fontSize:12, color:s.dim, marginBottom:8 }}>Была практика регуляции?</div>
              <div style={{ display:'flex', gap:8 }}>
                {[['true','✓ Да'],['false','× Нет']].map(([val,label]) => (
                  <button key={val} onClick={() => setRegulation(val === 'true')} style={{ flex:1, padding:'8px', borderRadius:10, border:`1px solid ${String(regulation)===val ? (val==='true' ? 'rgba(122,184,122,0.4)' : 'rgba(224,112,112,0.3)') : s.border}`, background:String(regulation)===val ? (val==='true' ? 'rgba(122,184,122,0.12)' : 'rgba(224,112,112,0.1)') : s.surface2, color:String(regulation)===val ? (val==='true' ? '#7ab87a' : '#e07070') : s.dim, fontSize:13, cursor:'pointer', transition:'all 0.15s' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Fixed bottom button */}
      <div style={{ position:'fixed', bottom:0, left:0, right:0, padding:'14px 20px', background:s.bg, borderTop:`1px solid ${s.border}` }}>
        <div style={{ maxWidth:480, margin:'0 auto' }}>
          {step === 'sprint' && (
            <button onClick={saveSprint} style={{ width:'100%', padding:'13px', borderRadius:14, background:s.accent, color:'#0d0d0f', border:'none', fontSize:14, fontWeight:500, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              {sprint ? 'Далее →' : 'Перейти к состоянию →'}
            </button>
          )}
          {step === 'physio' && (
            <button onClick={savePhysio} disabled={saving} style={{ width:'100%', padding:'13px', borderRadius:14, background:saving ? s.surface2 : s.accent, color:saving ? s.muted : '#0d0d0f', border:'none', fontSize:14, fontWeight:500, cursor:saving ? 'default' : 'pointer', fontFamily:"'DM Sans',sans-serif", transition:'all 0.3s' }}>
              {saving ? 'Сохраняем...' : 'Сохранить чекин'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CheckinPage() {
  return <Suspense><CheckinContent /></Suspense>
}
