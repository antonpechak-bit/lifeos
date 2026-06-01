// @ts-nocheck
'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const WELLBEING_DIMS = [
  {
    key: 'energy',
    label: 'Энергия',
    emoji: '⚡',
    question: 'Как физически ощущается тело сегодня?',
    color: '#c8a86e',
    why_title: 'Почему важно отслеживать энергию',
    why_body: 'Энергия — прямой выход физиологии. Она отражает качество сна прошлой ночи, питания, движения и состояния нервной системы. Когда энергия стабильно низкая — это сигнал что один из физиологических слоёв не работает. Отслеживание энергии позволяет видеть какие поведения реально влияют на твоё тело — и действовать точно, а не вслепую.',
    why_source: 'Источник: Longevity science, Attia — VO2max и митохондриальное здоровье как основа энергии'
  },
  {
    key: 'mood',
    label: 'Настроение',
    emoji: '🌊',
    question: 'Какой эмоциональный фон был сегодня?',
    color: '#6ea8c8',
    why_title: 'Почему важно отслеживать настроение',
    why_body: 'Настроение — аффективное благополучие: как ты себя чувствовал эмоционально в течение дня. Это не про «должен быть счастлив», а про честный взгляд на эмоциональный фон. Настроение коррелирует с состоянием ВНС и уровнем тревоги. Отслеживание помогает замечать паттерны — когда настроение стабильно низкое, это сигнал для работы с нервной системой или изменения внешних условий.',
    why_source: 'Источник: Поливагальная теория Порджеса, исследования аффективного благополучия (Kahneman)'
  },
  {
    key: 'meaning',
    label: 'Смысл',
    emoji: '🌱',
    question: 'Было ли ощущение что день имел вес?',
    color: '#7ab87a',
    why_title: 'Почему важно отслеживать смысл',
    why_body: 'Смысл — эвдемоническое благополучие: ощущение что жизнь значима и направлена. Исследования Seligman (PERMA) и Ryff показывают что смысл предсказывает долгосрочное счастье и здоровье точнее, чем сиюминутное настроение. Человек может чувствовать себя усталым, но если день был значимым — это всё равно хороший день. Отслеживание смысла помогает видеть разрыв между активностью и ценностями.',
    why_source: 'Источник: Seligman PERMA model, Ryff Psychological Well-Being Scale, Viktor Frankl'
  },
  {
    key: 'connection',
    label: 'Связь',
    emoji: '🤝',
    question: 'Чувствовал ли себя в контакте — с людьми или собой?',
    color: '#a86ec8',
    why_title: 'Почему важно отслеживать связь',
    why_body: 'Связь — самый мощный предиктор счастья по данным Гарвардского исследования взрослого развития (80 лет наблюдений, 724 участника). Люди с качественными близкими отношениями живут дольше, болеют реже и счастливее в старости. При этом связь — это не только с людьми, но и с собой: ощущение присутствия, контакта с телом, внутренней тишины. Когда связь низкая несколько дней — это сигнал к действию.',
    why_source: 'Источник: Harvard Study of Adult Development (Waldinger), Porges Polyvagal Theory'
  }
]

const REGULATION_TYPES = ['Медитация', 'Дыхание', 'Прогулка', 'NSDR', 'Холодный душ', 'Тренировка', 'Другое']

function InfoModal({ dim, onClose }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--surface,#141416)', border: `1px solid ${dim.color}40`, borderRadius: 20, padding: 28, maxWidth: 420, width: '100%', animation: 'fadeUp 0.2s forwards' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 28, marginBottom: 12 }}>{dim.emoji}</div>
        <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text,#e8e6e0)', marginBottom: 14 }}>{dim.why_title}</div>
        <div style={{ fontSize: 13, color: 'var(--text-dim,#7a7870)', lineHeight: 1.8, marginBottom: 16 }}>{dim.why_body}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted,#3d3d3d)', fontStyle: 'italic', marginBottom: 20 }}>{dim.why_source}</div>
        <button onClick={onClose} style={{ width: '100%', padding: '10px', borderRadius: 10, background: `${dim.color}20`, border: `1px solid ${dim.color}40`, color: dim.color, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          Понятно
        </button>
      </div>
    </div>
  )
}

function ScoreButton({ value, selected, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 36, height: 36, borderRadius: 8,
        background: selected ? color : 'var(--surface2,#1a1a1e)',
        border: `1px solid ${selected ? color : 'rgba(255,255,255,0.07)'}`,
        color: selected ? '#0d0d0f' : 'var(--text-dim,#7a7870)',
        fontSize: 13, fontWeight: selected ? 600 : 400,
        cursor: 'pointer', transition: 'all 0.15s',
        transform: selected ? 'scale(1.1)' : 'scale(1)',
      }}
    >
      {value}
    </button>
  )
}

function CheckinContent() {
  const router = useRouter()
  const params = useSearchParams()
  const sprintId = params.get('sprint')

  const [user, setUser] = useState(null)
  const [sprint, setSprint] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState('sprint') // sprint | physio
  const [infoModal, setInfoModal] = useState(null)

  // Экран 1 — Спринт
  const [sprintDone, setSprintDone] = useState(null) // 'yes'|'no'|'partial'
  const [barrier, setBarrier] = useState('')
  const [weekCheckins, setWeekCheckins] = useState([])

  // Экран 2 — Физиология
  const [wakeTime, setWakeTime] = useState('')
  const [sleepQuality, setSleepQuality] = useState(null)
  const [hrv, setHrv] = useState('')
  const [steps, setSteps] = useState('')
  const [workout, setWorkout] = useState(null)
  const [workoutType, setWorkoutType] = useState('')
  const [workoutMins, setWorkoutMins] = useState('')
  const [eatingWindow, setEatingWindow] = useState(null)
  const [nutritionQuality, setNutritionQuality] = useState(null)
  const [anxietyLevel, setAnxietyLevel] = useState(null)
  const [regulation, setRegulation] = useState(null)
  const [regulationTypes, setRegulationTypes] = useState([])

  // 4 измерения благополучия
  const [wellbeing, setWellbeing] = useState({ energy: null, mood: null, meaning: null, connection: null })

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.push('/'); return }
      setUser(data.session.user)

      // Load sprint
      const sid = sprintId || (await supabase.from('sprints').select('id').eq('user_id', data.session.user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).single()).data?.id
      if (sid) {
        const { data: spr } = await supabase.from('sprints').select('*').eq('id', sid).single()
        setSprint(spr)

        // Load week checkins
        const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 6)
        const { data: checks } = await supabase.from('checkins').select('*').eq('sprint_id', sid).gte('date', weekAgo.toISOString().split('T')[0]).order('date')
        setWeekCheckins(checks || [])

        // Check if today already done
        const todayCheck = checks?.find(c => c.date === today)
        if (todayCheck) setSprintDone(todayCheck.completed ? 'yes' : 'no')
      }

      // Load today's daily log if exists
      const { data: log } = await supabase.from('daily_logs').select('*').eq('user_id', data.session.user.id).eq('date', today).single().catch(() => ({ data: null }))
      if (log) {
        setWakeTime(log.wake_time || '')
        setSleepQuality(log.sleep_quality)
        setHrv(log.hrv || '')
        setSteps(log.steps || '')
        setWorkout(log.workout)
        setWorkoutType(log.workout_type || '')
        setWorkoutMins(log.workout_minutes || '')
        setEatingWindow(log.eating_window)
        setNutritionQuality(log.nutrition_quality)
        setAnxietyLevel(log.anxiety_level)
        setRegulation(log.regulation_practice)
        setRegulationTypes(log.regulation_type || [])
        setWellbeing({ energy: log.energy, mood: log.mood, meaning: log.meaning, connection: log.connection })
      }

      setLoading(false)
    })
  }, [])

  // Build week days display
  function buildWeekDays() {
    const days = []
    const dayLabels = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      const isToday = dateStr === today
      const check = weekCheckins.find(c => c.date === dateStr)
      const dayLabel = dayLabels[d.getDay() === 0 ? 6 : d.getDay() - 1]
      days.push({ dateStr, isToday, done: check?.completed, missed: check && !check.completed, label: dayLabel })
    }
    return days
  }

  const weekDays = buildWeekDays()
  const doneCount = weekCheckins.filter(c => c.completed).length

  async function saveAll() {
    if (!user) return
    setSaving(true)

    // Save sprint checkin
    if (sprintDone && sprint) {
      await supabase.from('checkins').upsert({
        sprint_id: sprint.id,
        user_id: user.id,
        date: today,
        completed: sprintDone === 'yes',
        note: barrier || null,
      }, { onConflict: 'sprint_id,date' })
    }

    // Save daily log
    const wellbeingIndex = Object.values(wellbeing).filter(Boolean).length > 0
      ? Object.values(wellbeing).filter(Boolean).reduce((a, b) => a + b, 0) / Object.values(wellbeing).filter(Boolean).length
      : null

    await supabase.from('daily_logs').upsert({
      user_id: user.id,
      date: today,
      wake_time: wakeTime || null,
      sleep_quality: sleepQuality,
      hrv: hrv ? parseInt(hrv) : null,
      steps: steps ? parseInt(steps) : null,
      workout: workout,
      workout_type: workoutType || null,
      workout_minutes: workoutMins ? parseInt(workoutMins) : null,
      eating_window: eatingWindow,
      nutrition_quality: nutritionQuality,
      anxiety_level: anxietyLevel,
      regulation_practice: regulation,
      regulation_type: regulationTypes.length > 0 ? regulationTypes : null,
      energy: wellbeing.energy,
      mood: wellbeing.mood,
      meaning: wellbeing.meaning,
      connection: wellbeing.connection,
      wellbeing_index: wellbeingIndex,
    }, { onConflict: 'user_id,date' })

    setSaving(false)
    setSaved(true)
    setTimeout(() => router.push('/dashboard'), 1500)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 14, color: 'var(--text-dim,#7a7870)' }}>Загружаем...</div>
    </div>
  )

  const sprintDay = sprint ? Math.ceil((new Date() - new Date(sprint.started_at)) / (1000 * 60 * 60 * 24)) + 1 : 1

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 80 }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
      `}</style>

      {infoModal && <InfoModal dim={infoModal} onClose={() => setInfoModal(null)} />}

      {/* Header */}
      <header style={{ padding: '14px 20px', borderBottom: '1px solid var(--border,rgba(255,255,255,0.07))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={() => router.push('/dashboard')} style={{ fontSize: 13, color: 'var(--text-dim,#7a7870)', background: 'none', border: 'none', cursor: 'pointer' }}>← Назад</button>
        <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: 'var(--accent,#c8b89a)' }}>Чекин · {new Date().toLocaleDateString('ru', { day: 'numeric', month: 'long' })}</span>
        <div style={{ width: 60 }} />
      </header>

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '20px 16px' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--surface,#141416)', borderRadius: 12, padding: 4, border: '1px solid var(--border,rgba(255,255,255,0.07))' }}>
          {[['sprint', '⚡ Спринт'], ['physio', '📊 Состояние']].map(([t, l]) => (
            <div key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 13, textAlign: 'center', cursor: 'pointer', background: tab === t ? 'var(--surface2,#1a1a1e)' : 'transparent', color: tab === t ? 'var(--text,#e8e6e0)' : 'var(--text-dim,#7a7870)', fontWeight: tab === t ? 500 : 300, transition: 'all 0.15s' }}>
              {l}
            </div>
          ))}
        </div>

        {/* ── ЭКРАН 1: СПРИНТ ── */}
        {tab === 'sprint' && (
          <div style={{ animation: 'fadeUp 0.3s forwards' }}>
            {sprint ? (
              <>
                {/* Sprint header */}
                <div style={{ background: 'var(--surface,#141416)', border: '1px solid var(--border,rgba(255,255,255,0.07))', borderRadius: 16, padding: '18px 20px', marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted,#3d3d3d)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                    День {sprintDay} из {sprint.target_days}
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 500, color: 'var(--text,#e8e6e0)', marginBottom: 6 }}>{sprint.behavior_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim,#7a7870)', marginBottom: 10 }}>{sprint.behavior_description}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted,#3d3d3d)' }}>⚓ {sprint.anchor}</div>
                </div>

                {/* Week track */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted,#3d3d3d)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Эта неделя</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                    {weekDays.map((d, i) => (
                      <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ width: '100%', aspectRatio: '1', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, background: d.done ? 'rgba(122,184,122,0.2)' : d.missed ? 'rgba(224,112,112,0.15)' : d.isToday ? 'var(--surface2,#1a1a1e)' : 'var(--surface,#141416)', border: `1px solid ${d.done ? 'rgba(122,184,122,0.4)' : d.missed ? 'rgba(224,112,112,0.3)' : d.isToday ? 'rgba(200,184,154,0.3)' : 'rgba(255,255,255,0.05)'}`, animation: d.isToday ? 'pulse 2s ease-in-out infinite' : 'none' }}>
                          {d.done ? '✓' : d.missed ? '×' : d.isToday ? '·' : ''}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted,#3d3d3d)', marginTop: 4 }}>{d.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-dim,#7a7870)', marginTop: 8 }}>{doneCount}/7</div>
                </div>

                {/* Main question */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 15, color: 'var(--text,#e8e6e0)', marginBottom: 14, lineHeight: 1.5 }}>
                    Выполнил <strong>{sprint.behavior_name}</strong> сегодня?
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[['yes', '✓ Да', '#7ab87a'], ['partial', '≈ Частично', '#c8a86e'], ['no', '× Нет', '#e07070']].map(([val, label, color]) => (
                      <button key={val} onClick={() => setSprintDone(val)} style={{ flex: 1, padding: '12px 8px', borderRadius: 12, border: `1px solid ${sprintDone === val ? color : 'rgba(255,255,255,0.07)'}`, background: sprintDone === val ? `${color}20` : 'var(--surface,#141416)', color: sprintDone === val ? color : 'var(--text-dim,#7a7870)', fontSize: 13, fontWeight: sprintDone === val ? 500 : 300, cursor: 'pointer', transition: 'all 0.15s' }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Barrier if no */}
                {(sprintDone === 'no' || sprintDone === 'partial') && (
                  <div style={{ marginBottom: 20, animation: 'fadeUp 0.2s forwards' }}>
                    <div style={{ fontSize: 13, color: 'var(--text-dim,#7a7870)', marginBottom: 8 }}>Что помешало?</div>
                    <input value={barrier} onChange={e => setBarrier(e.target.value)} placeholder="Коротко..." style={{ width: '100%', background: 'var(--surface,#141416)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 12px', color: 'var(--text,#e8e6e0)', fontFamily: "'DM Sans',sans-serif", fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 20px', border: '1px dashed rgba(255,255,255,0.07)', borderRadius: 16 }}>
                <div style={{ fontSize: 14, color: 'var(--text-dim,#7a7870)', marginBottom: 16 }}>Нет активных спринтов</div>
                <button onClick={() => router.push('/dashboard/priorities')} style={{ background: 'var(--accent,#c8b89a)', color: '#0d0d0f', border: 'none', borderRadius: 100, padding: '10px 24px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  Создать спринт →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── ЭКРАН 2: СОСТОЯНИЕ ── */}
        {tab === 'physio' && (
          <div style={{ animation: 'fadeUp 0.3s forwards', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* 4 измерения благополучия */}
            <div style={{ background: 'var(--surface,#141416)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '18px 20px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted,#3d3d3d)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Благополучие сегодня</div>
              {WELLBEING_DIMS.map(dim => (
                <div key={dim.key} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>{dim.emoji}</span>
                      <span style={{ fontSize: 14, color: 'var(--text,#e8e6e0)', fontWeight: 500 }}>{dim.label}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-dim,#7a7870)' }}>{dim.question}</span>
                    </div>
                    <button onClick={() => setInfoModal(dim)} style={{ width: 22, height: 22, borderRadius: '50%', border: `1px solid ${dim.color}40`, background: `${dim.color}10`, color: dim.color, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>?</button>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {[1,2,3,4,5,6,7,8,9,10].map(v => (
                      <ScoreButton key={v} value={v} selected={wellbeing[dim.key] === v} color={dim.color} onClick={() => setWellbeing(w => ({ ...w, [dim.key]: v }))} />
                    ))}
                  </div>
                </div>
              ))}
              {/* Wellbeing index */}
              {Object.values(wellbeing).filter(Boolean).length === 4 && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(200,184,154,0.08)', border: '1px solid rgba(200,184,154,0.2)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-dim,#7a7870)' }}>Индекс благополучия</span>
                  <span style={{ fontSize: 20, fontWeight: 500, color: 'var(--accent,#c8b89a)' }}>
                    {(Object.values(wellbeing).reduce((a, b) => a + b, 0) / 4).toFixed(1)}
                  </span>
                </div>
              )}
            </div>

            {/* Сон */}
            <div style={{ background: 'var(--surface,#141416)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '18px 20px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted,#3d3d3d)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>😴 Сон</div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-dim,#7a7870)', marginBottom: 6 }}>Время подъёма</div>
                  <input type="time" value={wakeTime} onChange={e => setWakeTime(e.target.value)} style={{ width: '100%', background: 'var(--surface2,#1a1a1e)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 10px', color: 'var(--text,#e8e6e0)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-dim,#7a7870)', marginBottom: 6 }}>HRV (мс)</div>
                  <input type="number" value={hrv} onChange={e => setHrv(e.target.value)} placeholder="—" style={{ width: '100%', background: 'var(--surface2,#1a1a1e)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 10px', color: 'var(--text,#e8e6e0)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim,#7a7870)', marginBottom: 8 }}>Качество утра</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['good', '😊 Отдохнул'], ['ok', '😐 Нормально'], ['bad', '😮‍💨 Разбит']].map(([val, label]) => (
                  <button key={val} onClick={() => setSleepQuality(val)} style={{ flex: 1, padding: '8px 6px', borderRadius: 10, border: `1px solid ${sleepQuality === val ? 'rgba(200,184,154,0.4)' : 'rgba(255,255,255,0.07)'}`, background: sleepQuality === val ? 'rgba(200,184,154,0.12)' : 'var(--surface2,#1a1a1e)', color: sleepQuality === val ? 'var(--accent,#c8b89a)' : 'var(--text-dim,#7a7870)', fontSize: 12, cursor: 'pointer', transition: 'all 0.15s' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Движение */}
            <div style={{ background: 'var(--surface,#141416)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '18px 20px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted,#3d3d3d)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>🏃 Движение</div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-dim,#7a7870)', marginBottom: 6 }}>Шаги</div>
                  <input type="number" value={steps} onChange={e => setSteps(e.target.value)} placeholder="—" style={{ width: '100%', background: 'var(--surface2,#1a1a1e)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 10px', color: 'var(--text,#e8e6e0)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim,#7a7870)', marginBottom: 8 }}>Тренировка / Zone 2</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: workout ? 12 : 0 }}>
                {[['true', '✓ Да'], ['false', '× Нет']].map(([val, label]) => (
                  <button key={val} onClick={() => setWorkout(val === 'true')} style={{ flex: 1, padding: '8px', borderRadius: 10, border: `1px solid ${String(workout) === val ? (val === 'true' ? 'rgba(122,184,122,0.4)' : 'rgba(224,112,112,0.3)') : 'rgba(255,255,255,0.07)'}`, background: String(workout) === val ? (val === 'true' ? 'rgba(122,184,122,0.12)' : 'rgba(224,112,112,0.1)') : 'var(--surface2,#1a1a1e)', color: String(workout) === val ? (val === 'true' ? '#7ab87a' : '#e07070') : 'var(--text-dim,#7a7870)', fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}>
                    {label}
                  </button>
                ))}
              </div>
              {workout && (
                <div style={{ display: 'flex', gap: 8, animation: 'fadeUp 0.2s forwards' }}>
                  <input value={workoutType} onChange={e => setWorkoutType(e.target.value)} placeholder="Тип (ходьба, зал...)" style={{ flex: 2, background: 'var(--surface2,#1a1a1e)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 10px', color: 'var(--text,#e8e6e0)', fontSize: 12, outline: 'none' }} />
                  <input type="number" value={workoutMins} onChange={e => setWorkoutMins(e.target.value)} placeholder="мин" style={{ flex: 1, background: 'var(--surface2,#1a1a1e)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 10px', color: 'var(--text,#e8e6e0)', fontSize: 12, outline: 'none' }} />
                </div>
              )}
            </div>

            {/* Питание */}
            <div style={{ background: 'var(--surface,#141416)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '18px 20px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted,#3d3d3d)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>🥦 Питание</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim,#7a7870)', marginBottom: 8 }}>Окно питания соблюдал?</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {[['true', '✓ Да'], ['false', '× Нет'], ['null', '≈ Частично']].map(([val, label]) => (
                  <button key={val} onClick={() => setEatingWindow(val === 'null' ? null : val === 'true')} style={{ flex: 1, padding: '8px 4px', borderRadius: 10, border: `1px solid ${String(eatingWindow) === val ? 'rgba(200,184,154,0.4)' : 'rgba(255,255,255,0.07)'}`, background: String(eatingWindow) === val ? 'rgba(200,184,154,0.1)' : 'var(--surface2,#1a1a1e)', color: String(eatingWindow) === val ? 'var(--accent,#c8b89a)' : 'var(--text-dim,#7a7870)', fontSize: 12, cursor: 'pointer', transition: 'all 0.15s' }}>
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim,#7a7870)', marginBottom: 8 }}>Оценка питания сегодня</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['good', '😊 Хорошо'], ['neutral', '😐 Нейтрально'], ['chaotic', '🌀 Хаотично']].map(([val, label]) => (
                  <button key={val} onClick={() => setNutritionQuality(val)} style={{ flex: 1, padding: '8px 4px', borderRadius: 10, border: `1px solid ${nutritionQuality === val ? 'rgba(200,184,154,0.4)' : 'rgba(255,255,255,0.07)'}`, background: nutritionQuality === val ? 'rgba(200,184,154,0.1)' : 'var(--surface2,#1a1a1e)', color: nutritionQuality === val ? 'var(--accent,#c8b89a)' : 'var(--text-dim,#7a7870)', fontSize: 12, cursor: 'pointer', transition: 'all 0.15s' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* ВНС */}
            <div style={{ background: 'var(--surface,#141416)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '18px 20px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted,#3d3d3d)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>🫁 ВНС / Восстановление</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim,#7a7870)', marginBottom: 8 }}>Тревожность за день</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 14 }}>
                {[1,2,3,4,5,6,7,8,9,10].map(v => (
                  <ScoreButton key={v} value={v} selected={anxietyLevel === v} color="#6ea8c8" onClick={() => setAnxietyLevel(v)} />
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim,#7a7870)', marginBottom: 8 }}>Была регулирующая практика?</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: regulation ? 12 : 0 }}>
                {[['true', '✓ Да'], ['false', '× Нет']].map(([val, label]) => (
                  <button key={val} onClick={() => setRegulation(val === 'true')} style={{ flex: 1, padding: '8px', borderRadius: 10, border: `1px solid ${String(regulation) === val ? (val === 'true' ? 'rgba(122,184,122,0.4)' : 'rgba(224,112,112,0.3)') : 'rgba(255,255,255,0.07)'}`, background: String(regulation) === val ? (val === 'true' ? 'rgba(122,184,122,0.12)' : 'rgba(224,112,112,0.1)') : 'var(--surface2,#1a1a1e)', color: String(regulation) === val ? (val === 'true' ? '#7ab87a' : '#e07070') : 'var(--text-dim,#7a7870)', fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}>
                    {label}
                  </button>
                ))}
              </div>
              {regulation && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, animation: 'fadeUp 0.2s forwards' }}>
                  {REGULATION_TYPES.map(t => (
                    <button key={t} onClick={() => setRegulationTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])} style={{ padding: '6px 12px', borderRadius: 100, border: `1px solid ${regulationTypes.includes(t) ? 'rgba(110,168,200,0.4)' : 'rgba(255,255,255,0.07)'}`, background: regulationTypes.includes(t) ? 'rgba(110,168,200,0.12)' : 'var(--surface2,#1a1a1e)', color: regulationTypes.includes(t) ? '#6ea8c8' : 'var(--text-dim,#7a7870)', fontSize: 12, cursor: 'pointer', transition: 'all 0.15s' }}>
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* Save button */}
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '16px 20px', background: 'var(--bg,#0d0d0f)', borderTop: '1px solid var(--border,rgba(255,255,255,0.07))' }}>
          <div style={{ maxWidth: 520, margin: '0 auto' }}>
            <button onClick={saveAll} disabled={saving || saved} style={{ width: '100%', padding: '13px', borderRadius: 14, background: saved ? 'rgba(122,184,122,0.2)' : 'var(--accent,#c8b89a)', color: saved ? '#7ab87a' : '#0d0d0f', border: `1px solid ${saved ? 'rgba(122,184,122,0.4)' : 'transparent'}`, fontSize: 14, fontWeight: 500, cursor: saving || saved ? 'default' : 'pointer', transition: 'all 0.3s', fontFamily: "'DM Sans',sans-serif" }}>
              {saved ? '✓ Сохранено' : saving ? 'Сохраняем...' : 'Сохранить чекин'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

export default function CheckinPage() {
  return <Suspense><CheckinContent /></Suspense>
}
