// @ts-nocheck
'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { VoiceButton } from '@/lib/VoiceButton'

const WELLBEING_DIMS = [
  { key: 'energy',     label: 'Энергия',     emoji: '⚡', color: '#6AA8FF',
    question: 'Как физически ощущается тело?',
    why: 'Энергия — прямой выход физиологии. Отражает качество сна, питания и движения. Когда энергия стабильно низкая — один из физиологических слоёв не работает.' },
  { key: 'mood',       label: 'Настроение',  emoji: '🌊', color: '#B18DFF',
    question: 'Какой эмоциональный фон сегодня?',
    why: 'Настроение коррелирует с состоянием ВНС и уровнем тревоги. Отслеживание помогает замечать паттерны и вовремя работать с нервной системой.' },
  { key: 'meaning',    label: 'Смысл',       emoji: '🌱', color: '#52FF9A',
    question: 'Ощущался ли смысл в дне?',
    why: 'Смысл предсказывает долгосрочное счастье лучше настроения (Seligman PERMA). Можно устать но если день был значимым — это хороший день.' },
  { key: 'connection', label: 'Связь',       emoji: '🤝', color: '#FFB84D',
    question: 'Был ли контакт — с людьми или собой?',
    why: 'Самый мощный предиктор счастья по Гарвардскому исследованию (80 лет, 724 участника). Качество связи важнее количества.' },
]

// ── Date helpers (always local time) ────────────────────────────
function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return localDateStr(date)
}
// ────────────────────────────────────────────────────────────────

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

const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

function formatDateLabel(dateStr, today) {
  if (dateStr === today) return 'Сегодня'
  const yest = new Date(); yest.setDate(yest.getDate() - 1)
  if (dateStr === localDateStr(yest)) return 'Вчера'
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const dayIdx = date.getDay() === 0 ? 6 : date.getDay() - 1
  return `${DAY_LABELS[dayIdx]} ${d} ${MONTH_SHORT[m - 1]}`
}

function InfoModal({ dim, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'linear-gradient(155deg,rgba(255,255,255,0.09) 0%,rgba(255,255,255,0.03) 100%)',
        backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
        border: `1px solid ${dim.color}30`,
        borderRadius: 32, padding: 28, maxWidth: 400, width: '100%',
        boxShadow: `0 0 60px ${dim.color}18, 0 24px 80px rgba(0,0,0,0.5)`,
      }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>{dim.emoji}</div>
        <div style={{ fontSize: 15, fontWeight: 500, color: s.text, marginBottom: 12 }}>
          Почему важно отслеживать {dim.label.toLowerCase()}
        </div>
        <div style={{ fontSize: 13, color: s.dim, lineHeight: 1.8, marginBottom: 20 }}>{dim.why}</div>
        <button onClick={onClose} style={{
          width: '100%', padding: '12px', borderRadius: 14,
          background: `${dim.color}18`, border: `1px solid ${dim.color}35`,
          color: dim.color, fontSize: 13, fontWeight: 500, cursor: 'pointer',
        }}>
          Понятно
        </button>
      </div>
    </div>
  )
}

// ── SprintCard: glass style + clickable week strip ───────────────
function SprintCard({ sprint, weekDays, done, barrier, onDoneChange, onBarrierChange, selectedDate, today, onDateSelect }) {
  const isPastDate = selectedDate !== today
  const [selY, selM, selD] = selectedDate.split('-').map(Number)
  const checkinDateLabel = isPastDate
    ? new Date(selY, selM - 1, selD).toLocaleDateString('ru', { day: 'numeric', month: 'long' })
    : 'сегодня'

  const dayNumber = Math.ceil((new Date() - new Date(sprint.started_at)) / 86400000) + 1

  return (
    <div>
      {/* Sprint info glass card */}
      <div style={{
        background: 'linear-gradient(155deg,rgba(255,255,255,0.075) 0%,rgba(255,255,255,0.025) 100%)',
        backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 32, padding: '24px 20px 20px',
        position: 'relative', overflow: 'hidden', marginBottom: 12,
        boxShadow: '0 0 60px rgba(82,255,154,0.05), 0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ position: 'absolute', bottom: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle,rgba(82,255,154,0.1) 0%,transparent 65%)', pointerEvents: 'none', animation: 'orbFloat 7s ease-in-out infinite' }} />

        <div style={{ fontSize: 10, color: s.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
          День {dayNumber} из {sprint.target_days}
        </div>
        <div style={{ fontSize: 17, fontWeight: 600, color: s.text, marginBottom: 6 }}>{sprint.behavior_name}</div>
        {sprint.behavior_description && (
          <div style={{ fontSize: 12, color: s.dim, marginBottom: 8 }}>{sprint.behavior_description}</div>
        )}
        <div style={{ fontSize: 11, color: s.muted }}>⚓ {sprint.anchor}</div>

        {/* Week strip — each square is clickable to select that date */}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize: 10, color: s.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            История
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            {weekDays.map((d, i) => (
              <div
                key={i}
                onClick={() => onDateSelect && onDateSelect(d.dateStr)}
                style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}
              >
                <div style={{
                  width: '100%', aspectRatio: '1', borderRadius: 9,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
                  background: d.done    ? 'rgba(82,255,154,0.18)'
                             : d.missed ? 'rgba(255,90,90,0.13)'
                             : d.isSelected ? 'rgba(106,168,255,0.15)'
                             : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${
                    d.done    ? 'rgba(82,255,154,0.38)'
                    : d.missed ? 'rgba(255,90,90,0.28)'
                    : d.isSelected ? 'rgba(106,168,255,0.45)'
                    : 'rgba(255,255,255,0.05)'
                  }`,
                  color: d.done ? s.recovery : d.missed ? s.overload : s.muted,
                  boxShadow: d.done      ? '0 0 12px rgba(82,255,154,0.3)'
                           : d.isSelected ? '0 0 10px rgba(106,168,255,0.25)'
                           : 'none',
                  transition: 'all 0.15s',
                }}>
                  {d.done ? '✓' : d.missed ? '×' : ''}
                </div>
                <div style={{ fontSize: 9, color: d.isSelected ? s.energy : s.muted, marginTop: 3 }}>{d.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Checkin card */}
      <div style={{
        background: 'linear-gradient(155deg,rgba(255,255,255,0.065) 0%,rgba(255,255,255,0.02) 100%)',
        backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 28, padding: '18px 20px',
      }}>
        <div style={{ fontSize: 10, color: s.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Чекин · {checkinDateLabel}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: (done === 'no' || done === 'partial') ? 12 : 0 }}>
          {([['yes', '✓ Да', s.recovery], ['partial', '≈ Частично', s.stress], ['no', '× Нет', s.overload]] as [string,string,string][]).map(([val, label, color]) => (
            <button
              key={val}
              onClick={() => onDoneChange(val)}
              style={{
                flex: 1, padding: '12px 8px', borderRadius: 14,
                border: `1px solid ${done === val ? color + '60' : 'rgba(255,255,255,0.08)'}`,
                background: done === val ? `${color}18` : 'rgba(255,255,255,0.04)',
                color: done === val ? color : s.dim,
                fontSize: 13, fontWeight: done === val ? 500 : 300,
                cursor: 'pointer', transition: 'all 0.15s',
                boxShadow: done === val ? `0 0 20px ${color}30` : 'none',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {(done === 'no' || done === 'partial') && (
          <div style={{ animation: 'fadeUp 0.2s forwards' }}>
            <div style={{ fontSize: 12, color: s.dim, marginBottom: 8 }}>Что помешало?</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={barrier}
                onChange={e => onBarrierChange(e.target.value)}
                placeholder="Коротко..."
                style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '10px 14px', color: s.text, fontFamily: "'DM Sans',sans-serif", fontSize: 13, outline: 'none' }}
              />
              <VoiceButton size={40} onResult={text => onBarrierChange(text)} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Bottom Nav — floating pill (same as dashboard) ───────────────
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

function CheckinContent() {
  const router = useRouter()
  const [step, setStep] = useState('loading') // loading | sprint | physio | done

  const [user, setUser] = useState(null)
  const [sprints, setSprints] = useState([])
  const [infoModal, setInfoModal] = useState(null)
  const [saving, setSaving] = useState(false)

  // Per-sprint state keyed by sprint.id
  const [sprintDones, setSprintDones] = useState({})
  const [barriers, setBarriers] = useState({})
  const [weekDaysMap, setWeekDaysMap] = useState({})

  // Wellbeing
  const [wellbeing, setWellbeing] = useState({ energy: null, mood: null, meaning: null, connection: null })

  // Physio
  const [sleepQuality, setSleepQuality] = useState(null)
  const [wakeTime, setWakeTime] = useState('07:00')
  const [workout, setWorkout] = useState(null)
  const [steps, setSteps] = useState('')
  const [anxietyLevel, setAnxietyLevel] = useState(null)
  const [regulation, setRegulation] = useState(null)

  const today = localDateStr()
  const [selectedDate, setSelectedDate] = useState(today)

  const dateList = Array.from({ length: 7 }, (_, i) => shiftDate(today, -i))

  useEffect(() => {
    async function init() {
      try {
        const { data: authData } = await supabase.auth.getSession()
        if (!authData?.session) { router.push('/'); return }
        const u = authData.session.user
        setUser(u)

        const { data: sprintData } = await supabase
          .from('sprints').select('*').eq('user_id', u.id).eq('status', 'active')
          .order('created_at', { ascending: false })

        const allSprints = sprintData || []
        setSprints(allSprints)
        await loadData(u, today, allSprints)
        setStep('sprint')
      } catch (e) {
        console.error('Load error:', e)
        setStep('sprint')
      }
    }
    init()
  }, [])

  async function loadData(u, date, sprintList) {
    setSprintDones({})
    setBarriers({})
    setWellbeing({ energy: null, mood: null, meaning: null, connection: null })
    setSleepQuality(null)
    setWakeTime('')
    setWorkout(null)
    setSteps('')
    setAnxietyLevel(null)
    setRegulation(null)

    const weekAgoStr = shiftDate(date, -6)
    const newWeekDaysMap = {}
    const newSprintDones = {}
    const newBarriers = {}

    for (const spr of sprintList) {
      const { data: checks } = await supabase.from('checkins').select('*')
        .eq('sprint_id', spr.id).gte('date', weekAgoStr).lte('date', date)

      const days = []
      for (let i = 6; i >= 0; i--) {
        const dateStr = shiftDate(date, -i)
        const check = checks?.find(c => c.date === dateStr)
        const [y, m, d] = dateStr.split('-').map(Number)
        const dayIdx = new Date(y, m - 1, d).getDay()
        days.push({
          dateStr,
          isSelected: dateStr === date,
          done: check?.completed,
          missed: check && !check.completed,
          label: DAY_LABELS[dayIdx === 0 ? 6 : dayIdx - 1],
        })
      }
      newWeekDaysMap[spr.id] = days

      const dateCheck = checks?.find(c => c.date === date)
      if (dateCheck) {
        newSprintDones[spr.id] = dateCheck.completed ? 'yes' : dateCheck.note ? 'partial' : 'no'
        if (dateCheck.note) newBarriers[spr.id] = dateCheck.note
      }
    }

    setWeekDaysMap(newWeekDaysMap)
    setSprintDones(newSprintDones)
    setBarriers(newBarriers)

    const { data: logData } = await supabase
      .from('daily_logs').select('*').eq('user_id', u.id).eq('date', date).maybeSingle()

    if (logData) {
      setWellbeing({ energy: logData.energy, mood: logData.mood, meaning: logData.meaning, connection: logData.connection })
      setSleepQuality(logData.sleep_quality)
      setWakeTime(logData.wake_time || '07:00')
      setWorkout(logData.workout)
      setSteps(logData.steps?.toString() || '')
      setAnxietyLevel(logData.anxiety_level)
      setRegulation(logData.regulation_practice)
    }
  }

  async function handleDateChange(newDate) {
    if (!user) return
    setSelectedDate(newDate)
    setStep('sprint')
    await loadData(user, newDate, sprints)
  }

  async function saveSprint() {
    if (!user) { setStep('physio'); return }
    for (const spr of sprints) {
      const done = sprintDones[spr.id]
      if (done) {
        await supabase.from('checkins').upsert({
          sprint_id: spr.id, user_id: user.id, date: selectedDate,
          completed: done === 'yes', note: barriers[spr.id] || null,
        }, { onConflict: 'sprint_id,date' })
      }
    }
    setStep('physio')
  }

  async function savePhysio() {
    if (!user) return
    setSaving(true)
    const filled = Object.values(wellbeing).filter(Boolean)
    const wellbeingIndex = filled.length > 0 ? filled.reduce((a, b) => a + b, 0) / filled.length : null

    await supabase.from('daily_logs').upsert({
      user_id: user.id, date: selectedDate,
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

  if (step === 'loading') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: s.bg }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.08)', borderTop: `2px solid ${s.energy}`, animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (step === 'done') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: s.bg }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ textAlign: 'center', animation: 'fadeUp 0.4s ease forwards' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: `${s.recovery}18`, border: `1px solid ${s.recovery}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: `0 0 40px ${s.recovery}30`, fontSize: 28 }}>✓</div>
        <div style={{ fontSize: 20, fontWeight: 600, color: s.text }}>Чекин сохранён</div>
      </div>
    </div>
  )

  const [selY, selM, selD] = selectedDate.split('-').map(Number)
  const dateDisplayLabel = new Date(selY, selM - 1, selD).toLocaleDateString('ru', { day: 'numeric', month: 'long' })

  return (
    <div style={{ minHeight: '100vh', background: s.bg, color: s.text, fontFamily: "'DM Sans',-apple-system,sans-serif", fontWeight: 300, paddingBottom: 160 }}>
      <style>{`
        @keyframes fadeUp    { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin      { to{transform:rotate(360deg)} }
        @keyframes orbFloat  { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(12px,-10px) scale(1.08)} }
        @keyframes orbFloat2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-10px,14px) scale(1.05)} }
        @keyframes glowPulse { 0%,100%{opacity:0.45} 50%{opacity:1} }
        .date-scroll::-webkit-scrollbar{display:none}
        .date-scroll{-ms-overflow-style:none;scrollbar-width:none}
      `}</style>

      {infoModal && <InfoModal dim={infoModal} onClose={() => setInfoModal(null)} />}

      {/* Hero header with orbs */}
      <div style={{
        padding: '28px 24px 24px',
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(145deg,#081628 0%,#060D1C 50%,#0A0F22 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{ position: 'absolute', top: -40, right: -30, width: 220, height: 220, borderRadius: '50%', background: `radial-gradient(circle,${s.energy}20 0%,transparent 65%)`, animation: 'orbFloat 9s ease-in-out infinite', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -60, left: -40, width: 260, height: 260, borderRadius: '50%', background: `radial-gradient(circle,${s.mindfulness}12 0%,transparent 65%)`, animation: 'orbFloat2 12s ease-in-out infinite 1.5s', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => router.push('/dashboard')} style={{ fontSize: 13, color: s.dim, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>← Назад</button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, color: s.text, marginBottom: 2 }}>
              {step === 'sprint' ? '⚡ Спринт' : '📊 Состояние'}
            </div>
            <div style={{ fontSize: 12, color: s.dim }}>{dateDisplayLabel}</div>
          </div>
          <div style={{ width: 50 }} />
        </div>
      </div>

      {/* Date selector pills */}
      <div className="date-scroll" style={{ overflowX: 'auto', display: 'flex', gap: 8, padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {dateList.map(d => {
          const isSelected = d === selectedDate
          return (
            <button
              key={d}
              onClick={() => handleDateChange(d)}
              style={{
                flexShrink: 0, padding: '10px 16px', borderRadius: 999,
                background: isSelected
                  ? `linear-gradient(135deg,${s.energy} 0%,${s.mindfulness} 100%)`
                  : 'rgba(255,255,255,0.05)',
                border: `1px solid ${isSelected ? 'transparent' : 'rgba(255,255,255,0.09)'}`,
                color: isSelected ? '#07090D' : s.dim,
                fontSize: 12, fontWeight: isSelected ? 600 : 300,
                cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                boxShadow: isSelected ? `0 0 24px ${s.energy}40` : 'none',
              }}
            >
              {formatDateLabel(d, today)}
            </button>
          )
        })}
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px 0' }}>

        {/* ── ЭКРАН 1: СПРИНТ ── */}
        {step === 'sprint' && (
          <div style={{ animation: 'fadeUp 0.3s forwards' }}>
            {sprints.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {sprints.map(sprint => {
                  const id = sprint.id
                  return (
                    <SprintCard
                      key={id}
                      sprint={sprint}
                      weekDays={weekDaysMap[id] || []}
                      done={sprintDones[id] ?? null}
                      barrier={barriers[id] ?? ''}
                      onDoneChange={val => setSprintDones(prev => ({ ...prev, [id]: val }))}
                      onBarrierChange={val => setBarriers(prev => ({ ...prev, [id]: val }))}
                      selectedDate={selectedDate}
                      today={today}
                      onDateSelect={handleDateChange}
                    />
                  )
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '48px 20px', background: 'linear-gradient(155deg,rgba(255,255,255,0.06) 0%,rgba(255,255,255,0.02) 100%)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 32 }}>
                <div style={{ fontSize: 14, color: s.dim, marginBottom: 20 }}>Нет активных спринтов</div>
                <button onClick={() => router.push('/dashboard/priorities')} style={{
                  background: `linear-gradient(135deg,${s.energy} 0%,${s.mindfulness} 100%)`,
                  color: '#07090D', border: 'none', borderRadius: 999,
                  padding: '12px 28px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  boxShadow: `0 0 30px ${s.energy}40`,
                }}>
                  Создать спринт →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── ЭКРАН 2: СОСТОЯНИЕ ── */}
        {step === 'physio' && (
          <div style={{ animation: 'fadeUp 0.3s forwards', display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* 4 wellbeing dims */}
            <div style={{
              background: 'linear-gradient(155deg,rgba(255,255,255,0.075) 0%,rgba(255,255,255,0.025) 100%)',
              backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 32, padding: '22px 20px',
              position: 'relative', overflow: 'hidden',
              boxShadow: '0 0 60px rgba(106,168,255,0.05)',
            }}>
              <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: `radial-gradient(circle,${s.energy}12 0%,transparent 65%)`, animation: 'glowPulse 6s ease-in-out infinite', pointerEvents: 'none' }} />

              <div style={{ fontSize: 10, color: s.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 18, position: 'relative' }}>
                Благополучие сегодня
              </div>
              {WELLBEING_DIMS.map(dim => (
                <div key={dim.key} style={{ marginBottom: 20, position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 16 }}>{dim.emoji}</span>
                    <span style={{ fontSize: 14, fontWeight: 500, color: dim.color }}>{dim.label}</span>
                    <span style={{ fontSize: 12, color: s.dim, flex: 1 }}>{dim.question}</span>
                    <button onClick={() => setInfoModal(dim)} style={{
                      width: 22, height: 22, borderRadius: '50%',
                      border: `1px solid ${dim.color}35`, background: `${dim.color}10`,
                      color: dim.color, fontSize: 11, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>?</button>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => (
                      <button key={v} onClick={() => setWellbeing(w => ({ ...w, [dim.key]: v }))}
                        style={{
                          flex: 1, height: 40, borderRadius: 9,
                          background: wellbeing[dim.key] === v ? dim.color : 'rgba(255,255,255,0.05)',
                          border: `1px solid ${wellbeing[dim.key] === v ? dim.color : 'rgba(255,255,255,0.08)'}`,
                          color: wellbeing[dim.key] === v ? '#07090D' : s.dim,
                          fontSize: 12, fontWeight: wellbeing[dim.key] === v ? 700 : 400,
                          cursor: 'pointer', transition: 'all 0.15s',
                          transform: wellbeing[dim.key] === v ? 'scale(1.1)' : 'scale(1)',
                          boxShadow: wellbeing[dim.key] === v ? `0 0 16px ${dim.color}50` : 'none',
                        }}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {Object.values(wellbeing).filter(Boolean).length === 4 && (
                <div style={{
                  marginTop: 4, padding: '12px 16px',
                  background: `${s.energy}10`, border: `1px solid ${s.energy}25`,
                  borderRadius: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: 12, color: s.dim }}>Индекс благополучия</span>
                  <span style={{ fontSize: 22, fontWeight: 700, color: s.energy, textShadow: `0 0 20px ${s.energy}60` }}>
                    {(Object.values(wellbeing).reduce((a, b) => a + b, 0) / 4).toFixed(1)}
                  </span>
                </div>
              )}
            </div>

            {/* Сон */}
            <div style={{
              background: 'linear-gradient(155deg,rgba(255,255,255,0.065) 0%,rgba(255,255,255,0.02) 100%)',
              backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 28, padding: '20px',
            }}>
              <div style={{ fontSize: 10, color: s.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>😴 Сон</div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: s.dim, marginBottom: 6 }}>Время подъёма</div>
                  <input type="time" value={wakeTime} onChange={e => setWakeTime(e.target.value)}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '9px 12px', color: s.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ fontSize: 12, color: s.dim, marginBottom: 8 }}>Качество утра</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['good', '😊 Отдохнул'], ['ok', '😐 Нормально'], ['bad', '😮‍💨 Разбит']].map(([val, label]) => (
                  <button key={val} onClick={() => setSleepQuality(val)} style={{
                    flex: 1, padding: '9px 6px', borderRadius: 12,
                    border: `1px solid ${sleepQuality === val ? `${s.energy}50` : 'rgba(255,255,255,0.08)'}`,
                    background: sleepQuality === val ? `${s.energy}12` : 'rgba(255,255,255,0.04)',
                    color: sleepQuality === val ? s.energy : s.dim,
                    fontSize: 12, cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Движение */}
            <div style={{
              background: 'linear-gradient(155deg,rgba(255,255,255,0.065) 0%,rgba(255,255,255,0.02) 100%)',
              backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 28, padding: '20px',
            }}>
              <div style={{ fontSize: 10, color: s.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>🏃 Движение</div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: s.dim, marginBottom: 6 }}>Шаги</div>
                <input type="number" value={steps} onChange={e => setSteps(e.target.value)} placeholder="—"
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '9px 12px', color: s.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ fontSize: 12, color: s.dim, marginBottom: 8 }}>Тренировка сегодня?</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['true', '✓ Да'], ['false', '× Нет']].map(([val, label]) => (
                  <button key={val} onClick={() => setWorkout(val === 'true')} style={{
                    flex: 1, padding: '9px', borderRadius: 12,
                    border: `1px solid ${String(workout) === val ? (val === 'true' ? `${s.recovery}50` : `${s.overload}40`) : 'rgba(255,255,255,0.08)'}`,
                    background: String(workout) === val ? (val === 'true' ? `${s.recovery}12` : `${s.overload}10`) : 'rgba(255,255,255,0.04)',
                    color: String(workout) === val ? (val === 'true' ? s.recovery : s.overload) : s.dim,
                    fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* ВНС */}
            <div style={{
              background: 'linear-gradient(155deg,rgba(255,255,255,0.065) 0%,rgba(255,255,255,0.02) 100%)',
              backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 28, padding: '20px',
            }}>
              <div style={{ fontSize: 10, color: s.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>🫁 ВНС</div>
              <div style={{ fontSize: 12, color: s.dim, marginBottom: 10 }}>Уровень тревоги за день</div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => (
                  <button key={v} onClick={() => setAnxietyLevel(v)} style={{
                    flex: 1, height: 40, borderRadius: 9,
                    background: anxietyLevel === v ? s.mindfulness : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${anxietyLevel === v ? s.mindfulness : 'rgba(255,255,255,0.08)'}`,
                    color: anxietyLevel === v ? '#07090D' : s.dim,
                    fontSize: 12, fontWeight: anxietyLevel === v ? 700 : 400,
                    cursor: 'pointer', transition: 'all 0.15s',
                    boxShadow: anxietyLevel === v ? `0 0 16px ${s.mindfulness}50` : 'none',
                  }}>
                    {v}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: s.dim, marginBottom: 8 }}>Была практика регуляции?</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['true', '✓ Да'], ['false', '× Нет']].map(([val, label]) => (
                  <button key={val} onClick={() => setRegulation(val === 'true')} style={{
                    flex: 1, padding: '9px', borderRadius: 12,
                    border: `1px solid ${String(regulation) === val ? (val === 'true' ? `${s.recovery}50` : `${s.overload}40`) : 'rgba(255,255,255,0.08)'}`,
                    background: String(regulation) === val ? (val === 'true' ? `${s.recovery}12` : `${s.overload}10`) : 'rgba(255,255,255,0.04)',
                    color: String(regulation) === val ? (val === 'true' ? s.recovery : s.overload) : s.dim,
                    fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* CTA button — floats above bottom nav */}
      <div style={{ position: 'fixed', bottom: 88, left: 16, right: 16, zIndex: 40 }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          {step === 'sprint' && (
            <button onClick={saveSprint} style={{
              width: '100%', padding: '15px',
              borderRadius: 999, border: 'none', cursor: 'pointer',
              background: `linear-gradient(135deg,${s.energy} 0%,${s.mindfulness} 100%)`,
              color: '#07090D', fontSize: 15, fontWeight: 600,
              fontFamily: "'DM Sans',sans-serif",
              boxShadow: `0 0 40px ${s.energy}50, 0 4px 24px ${s.energy}30`,
            }}>
              {sprints.length > 0 ? 'Далее →' : 'Перейти к состоянию →'}
            </button>
          )}
          {step === 'physio' && (
            <button onClick={savePhysio} disabled={saving} style={{
              width: '100%', padding: '15px',
              borderRadius: 999, border: 'none',
              cursor: saving ? 'default' : 'pointer',
              background: saving
                ? 'rgba(255,255,255,0.06)'
                : `linear-gradient(135deg,${s.energy} 0%,${s.mindfulness} 100%)`,
              color: saving ? s.muted : '#07090D',
              fontSize: 15, fontWeight: 600,
              fontFamily: "'DM Sans',sans-serif", transition: 'all 0.3s',
              boxShadow: saving ? 'none' : `0 0 40px ${s.energy}50, 0 4px 24px ${s.energy}30`,
            }}>
              {saving ? 'Сохраняем...' : 'Сохранить чекин'}
            </button>
          )}
        </div>
      </div>

      <BottomNav router={router} />
    </div>
  )
}

export default function CheckinPage() {
  return <Suspense><CheckinContent /></Suspense>
}
