// @ts-nocheck
'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { VoiceButton } from '@/lib/VoiceButton'

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

const LAYER_COLORS = {
  sleep:      '#6AA8FF',
  ans:        '#B18DFF',
  movement:   '#FFB84D',
  nutrition:  '#52FF9A',
  connection: '#FFB84D',
  attention:  '#52FF9A',
  values:     '#B18DFF',
}

const LAYER_LABELS = {
  sleep: 'Сон', ans: 'Нервная система', movement: 'Движение',
  nutrition: 'Питание', connection: 'Связь', attention: 'Внимание', values: 'Ценности',
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

// ── State map parser (unchanged) ───────────────────────────────
function parseStateMap(raw) {
  if (!raw) return { overview: '', working: [], attention: [], priorities: [], nextStep: '' }
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
  const result = { overview: '', working: [], attention: [], blind: [], therapist: [], priorities: [], nextStep: '' }
  let curKey = ''

  lines.forEach(line => {
    const pm = line.match(/^ПРИОРИТЕТ (\d):\s*(.+)/i)
    if (pm) {
      curKey = ''
      const p = pm[2].split('|').map(s => s.trim())
      result.priorities.push({ n: pm[1], name: p[0] || '', why: p[1] || '', step: p[2] || '' })
      return
    }
    const nm = line.match(/^СЛЕДУЮЩИЙ ШАГ:\s*(.+)/i)
    if (nm) { curKey = ''; result.nextStep = nm[1]; return }

    const secMap = { 'ОБЩАЯ КАРТИНА': 'overview', 'ЧТО РАБОТАЕТ': 'working', 'ЧТО ТРЕБУЕТ ВНИМАНИЯ': 'attention', 'СЛЕПЫЕ ПЯТНА': 'blind', 'ДЛЯ ТЕРАПЕВТА': 'therapist' }
    let hit = false
    for (const [k, v] of Object.entries(secMap)) {
      if (line.startsWith(k + ':')) { curKey = v; const val = line.slice(k.length + 1).trim(); if (val) { if (Array.isArray(result[v])) result[v].push(val); else result[v] = val; } hit = true; break }
    }
    if (!hit && curKey) {
      const val = line.replace(/^•\s*/, '').trim()
      if (val) { if (Array.isArray(result[curKey])) result[curKey].push(val); else result[curKey] += ' ' + val }
    }
  })
  return result
}

function guessLayer(name) {
  const n = name.toLowerCase()
  if (n.includes('сон') || n.includes('sleep')) return 'sleep'
  if (n.includes('нервн') || n.includes('внс') || n.includes('стресс') || n.includes('дыхан')) return 'ans'
  if (n.includes('движ') || n.includes('зона') || n.includes('zone') || n.includes('спорт')) return 'movement'
  if (n.includes('питан') || n.includes('еда')) return 'nutrition'
  if (n.includes('связ') || n.includes('отношен')) return 'connection'
  if (n.includes('вниман')) return 'attention'
  if (n.includes('ценност') || n.includes('смысл')) return 'values'
  return 'sleep'
}

// ── Main content ───────────────────────────────────────────────
function PrioritiesContent() {
  const router = useRouter()
  const params = useSearchParams()
  const sessionId = params.get('session')

  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activePri, setActivePri] = useState(null)
  const [sprints, setSprints] = useState([])

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [sprintSaved, setSprintSaved] = useState(false)
  const messagesEndRef = useRef(null)
  const taRef = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.push('/'); return }
      setUser(data.session.user)

      const sid = sessionId || (await supabase.from('sessions').select('id').eq('user_id', data.session.user.id).eq('completed', true).order('created_at', { ascending: false }).limit(1).single()).data?.id
      if (!sid) { router.push('/dashboard'); return }

      const { data: sess } = await supabase.from('sessions').select('*').eq('id', sid).single()
      const { data: spr } = await supabase.from('sprints').select('*').eq('user_id', data.session.user.id)

      setSession(sess)
      setParsed(parseStateMap(sess?.state_map))
      setSprints(spr || [])
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, chatLoading])

  function selectPriority(pri, idx) {
    setActivePri({ ...pri, idx })
    setMessages([])
    setSprintSaved(false)

    const layerKey = guessLayer(pri.name)
    const opening = `Хорошо, давай разберём «${pri.name}» подробнее.\n\n${pri.why}\n\nЧтобы предложить тебе подходящий шаг — пару вопросов:\n\nЧто сейчас происходит с ${LAYER_LABELS[layerKey] || pri.name.toLowerCase()}? Как это выглядит в твоей реальной жизни прямо сейчас?`
    setMessages([{ role: 'assistant', content: opening }])
  }

  async function sendMessage() {
    if (!input.trim() || chatLoading) return
    const userMsg = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    if (taRef.current) taRef.current.style.height = 'auto'
    setChatLoading(true)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token ?? ''

      const res = await fetch('/api/sprint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messages: newMessages,
          stateMap: session?.state_map,
          priority: activePri
            ? `${activePri.name} [слой: ${LAYER_LABELS[guessLayer(activePri.name)] || guessLayer(activePri.name)}]\nПочему важно: ${activePri.why}${activePri.step ? `\nПредложенный шаг: ${activePri.step}` : ''}`
            : '',
          sessionId: session?.id,
          userId: user?.id,
        }),
      })
      const data = await res.json()
      const reply = data.reply || 'Что-то пошло не так.'
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])

      if (reply.includes('[SPRINT_START]')) {
        setSprintSaved(true)
        const { data: spr } = await supabase.from('sprints').select('*').eq('user_id', user.id)
        setSprints(spr || [])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Ошибка соединения.' }])
    }
    setChatLoading(false)
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  function autoResize(e) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.08)', borderTop: `2px solid ${s.energy}`, animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const activeSprints = sprints.filter(sp => sp.status === 'active')

  return (
    <div style={{ minHeight: '100vh', background: s.bg, color: s.text, fontFamily: "'DM Sans',-apple-system,sans-serif", fontWeight: 300, display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes fadeUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        @keyframes orbFloat{ 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(10px,-8px) scale(1.06)} }
        @keyframes td      { 0%,60%,100%{transform:translateY(0);opacity:0.4} 30%{transform:translateY(-4px);opacity:1} }
        @media (max-width: 520px) {
          .pri-left.has-active { display: none !important; }
          .pri-right {
            position: fixed !important;
            top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
            z-index: 55 !important;
            background: #07090D !important;
            overflow: hidden !important;
            display: flex !important;
            flex-direction: column !important;
          }
        }
      `}</style>

      {/* Header */}
      <header style={{
        padding: '22px 24px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, animation: 'fadeUp 0.4s ease forwards',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => router.push('/dashboard')} style={{ fontSize: 13, color: s.muted, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>←</button>
          <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, color: s.text, opacity: 0.9 }}>Карта приоритетов</span>
        </div>
        {session?.created_at && (
          <div style={{ fontSize: 12, color: s.muted }}>
            {new Date(session.created_at).toLocaleDateString('ru', { day: 'numeric', month: 'long' })}
          </div>
        )}
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Left panel ── */}
        <div className={`pri-left${activePri ? ' has-active' : ''}`} style={{
          width: activePri ? 380 : '100%', flexShrink: 0,
          borderRight: activePri ? '1px solid rgba(255,255,255,0.07)' : 'none',
          overflowY: 'auto', padding: activePri ? '20px 18px 120px' : '20px 18px 120px',
          transition: 'width 0.3s',
          maxWidth: activePri ? 380 : 600, margin: activePri ? 0 : '0 auto',
        }}>

          {/* Overview card */}
          {parsed?.overview && (
            <div style={{
              background: 'linear-gradient(155deg,rgba(177,141,255,0.08) 0%,rgba(255,255,255,0.02) 100%)',
              backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
              border: '1px solid rgba(177,141,255,0.15)', borderRadius: 28,
              padding: '20px 20px', marginBottom: 18,
              position: 'relative', overflow: 'hidden',
              boxShadow: '0 0 60px rgba(177,141,255,0.06)',
              animation: 'fadeUp 0.45s ease forwards',
            }}>
              <div style={{ position: 'absolute', top: -30, right: -30, width: 130, height: 130, borderRadius: '50%', background: 'radial-gradient(circle,rgba(177,141,255,0.15) 0%,transparent 65%)', animation: 'orbFloat 8s ease-in-out infinite', pointerEvents: 'none' }} />
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: s.muted, marginBottom: 10, position: 'relative' }}>Общая картина</div>
              <div style={{ fontSize: 13, color: s.dim, lineHeight: 1.75, position: 'relative' }}>{parsed.overview}</div>
            </div>
          )}

          {/* Section label */}
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: s.muted, marginBottom: 12, paddingLeft: 4 }}>Три приоритета</div>

          {/* Priority cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {parsed?.priorities?.map((pri, idx) => {
              const layerKey = guessLayer(pri.name)
              const color = LAYER_COLORS[layerKey] || s.energy
              const isActive = activePri?.n === pri.n
              const hasSprint = sprints.some(sp => sp.layer === layerKey && sp.status === 'active')

              return (
                <div key={idx}
                  onClick={() => selectPriority(pri, idx)}
                  style={{
                    background: isActive
                      ? `linear-gradient(155deg,${color}12 0%,rgba(255,255,255,0.03) 100%)`
                      : 'linear-gradient(155deg,rgba(255,255,255,0.065) 0%,rgba(255,255,255,0.02) 100%)',
                    backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
                    border: isActive ? `1px solid ${color}35` : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 24, padding: '18px 18px',
                    cursor: 'pointer', transition: 'all 0.2s',
                    animation: 'fadeIn 0.35s forwards',
                    boxShadow: isActive ? `0 0 40px ${color}12` : '0 4px 20px rgba(0,0,0,0.2)',
                    position: 'relative', overflow: 'hidden',
                  }}>
                  {isActive && (
                    <div style={{ position: 'absolute', bottom: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: `radial-gradient(circle,${color}18 0%,transparent 65%)`, pointerEvents: 'none' }} />
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, position: 'relative' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: `0 0 8px ${color}80` }} />
                    <div style={{ fontSize: 10, color: color, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Приоритет {pri.n}</div>
                    {hasSprint && (
                      <div style={{ marginLeft: 'auto', fontSize: 10, padding: '3px 10px', borderRadius: 999, background: `${s.meaning}15`, color: s.meaning, border: `1px solid ${s.meaning}28` }}>
                        ✓ Спринт активен
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: s.text, marginBottom: 7, position: 'relative' }}>{pri.name}</div>
                  <div style={{ fontSize: 12, color: s.dim, lineHeight: 1.65, marginBottom: hasSprint ? 0 : 10, position: 'relative' }}>{pri.why}</div>
                  {!hasSprint && pri.step && (
                    <div style={{ fontSize: 12, color: color, display: 'flex', alignItems: 'center', gap: 5, position: 'relative' }}>
                      → {pri.step}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Active sprints */}
          {activeSprints.length > 0 && (
            <>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: s.muted, marginBottom: 12, paddingLeft: 4 }}>Активные спринты</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeSprints.map(sprint => (
                  <div key={sprint.id} style={{
                    background: 'linear-gradient(155deg,rgba(82,255,154,0.07) 0%,rgba(255,255,255,0.02) 100%)',
                    backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
                    border: `1px solid ${s.meaning}20`, borderRadius: 20, padding: '14px 16px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: s.text }}>{sprint.behavior_name}</div>
                      <div style={{ fontSize: 10, padding: '3px 10px', borderRadius: 999, background: `${s.energy}12`, color: s.energy, border: `1px solid ${s.energy}22` }}>
                        {LAYER_LABELS[sprint.layer] || sprint.layer}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: s.muted }}>⚓ {sprint.anchor}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Right panel — chat ── */}
        {activePri && (
          <div className="pri-right" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'fadeIn 0.3s forwards' }}>

            {/* Chat header */}
            <div style={{
              padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
              borderBottom: '1px solid rgba(255,255,255,0.07)',
              background: 'rgba(255,255,255,0.02)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: LAYER_COLORS[guessLayer(activePri.name)] || s.energy, boxShadow: `0 0 8px ${LAYER_COLORS[guessLayer(activePri.name)] || s.energy}80` }} />
                <span style={{ fontSize: 14, fontWeight: 500, color: s.text }}>{activePri.name}</span>
              </div>
              <button onClick={() => setActivePri(null)} style={{ fontSize: 20, color: s.muted, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 100px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {messages.map((msg, i) => {
                const hasSprint = msg.role === 'assistant' && msg.content.includes('[SPRINT_START]')
                const text = hasSprint ? msg.content.split('[SPRINT_START]')[0].trim() : msg.content
                const sprintRaw = hasSprint ? msg.content.split('[SPRINT_START]')[1]?.split('[SPRINT_END]')[0]?.trim() : ''
                const getField = (key) => sprintRaw?.split('\n').find(l => l.startsWith(key + ':'))?.slice(key.length + 1).trim() || ''

                return (
                  <div key={i} style={{ display: 'flex', gap: 10, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', animation: 'fadeIn 0.25s forwards', opacity: 0 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 500, marginTop: 2,
                      background: msg.role === 'assistant' ? 'rgba(255,255,255,0.06)' : `${s.energy}18`,
                      border: `1px solid ${msg.role === 'assistant' ? 'rgba(255,255,255,0.1)' : `${s.energy}30`}`,
                      color: msg.role === 'assistant' ? s.muted : s.energy,
                    }}>
                      {msg.role === 'assistant' ? 'L' : 'Я'}
                    </div>
                    <div style={{ maxWidth: 480 }}>
                      {text && (
                        <div style={{
                          padding: '11px 15px',
                          borderRadius: msg.role === 'assistant' ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
                          background: msg.role === 'assistant'
                            ? 'linear-gradient(155deg,rgba(255,255,255,0.07) 0%,rgba(255,255,255,0.025) 100%)'
                            : `${s.energy}12`,
                          border: `1px solid ${msg.role === 'assistant' ? 'rgba(255,255,255,0.09)' : `${s.energy}25`}`,
                          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                          fontSize: 13, lineHeight: 1.75, whiteSpace: 'pre-wrap',
                          color: msg.role === 'assistant' ? s.text : s.energy,
                          textAlign: msg.role === 'user' ? 'right' : 'left',
                        }}>
                          {text}
                        </div>
                      )}
                      {hasSprint && sprintRaw && (
                        <div style={{
                          marginTop: 10,
                          background: `${s.meaning}0D`, border: `1px solid ${s.meaning}30`,
                          borderRadius: 18, padding: '16px 18px',
                        }}>
                          <div style={{ fontSize: 11, color: s.meaning, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>✓ Спринт записан</div>
                          <div style={{ fontSize: 14, fontWeight: 500, color: s.text, marginBottom: 6 }}>{getField('NAME')}</div>
                          <div style={{ fontSize: 12, color: s.dim, marginBottom: 4 }}>{getField('DESCRIPTION')}</div>
                          <div style={{ fontSize: 11, color: s.muted }}>⚓ {getField('ANCHOR')} · {getField('DAYS')} дней</div>
                          <button onClick={() => router.push('/dashboard')} style={{
                            marginTop: 14, width: '100%', padding: '10px', borderRadius: 12,
                            background: `linear-gradient(135deg,${s.meaning},${s.energy})`,
                            color: '#07090D', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            boxShadow: `0 0 24px ${s.meaning}40`,
                          }}>
                            Перейти к чекинам →
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {chatLoading && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: s.muted }}>L</div>
                  <div style={{
                    background: 'linear-gradient(155deg,rgba(255,255,255,0.07) 0%,rgba(255,255,255,0.025) 100%)',
                    border: '1px solid rgba(255,255,255,0.09)',
                    borderRadius: '4px 16px 16px 16px', padding: '11px 15px',
                    display: 'flex', gap: 5,
                  }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: s.muted, animation: `td 1.3s infinite ${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{
              padding: '14px 18px 24px', flexShrink: 0,
              borderTop: '1px solid rgba(255,255,255,0.07)',
              background: 'rgba(0,0,0,0.2)',
            }}>
              <div style={{
                display: 'flex', gap: 8, alignItems: 'flex-end',
                background: 'linear-gradient(155deg,rgba(255,255,255,0.07) 0%,rgba(255,255,255,0.025) 100%)',
                backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
                border: '1px solid rgba(255,255,255,0.12)', borderRadius: 18,
                padding: '4px 6px 4px 4px',
              }}>
                <textarea
                  ref={taRef}
                  value={input}
                  onChange={autoResize}
                  onKeyDown={handleKey}
                  placeholder="Напиши ответ..."
                  rows={1}
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    color: s.text, fontFamily: "'DM Sans',sans-serif", fontSize: 13,
                    lineHeight: 1.5, padding: '9px 10px', resize: 'none',
                    maxHeight: 120, overflowY: 'auto',
                  }}
                />
                <div style={{ margin: '4px 0 4px 2px' }}>
                  <VoiceButton size={32} onResult={(text) => {
                    setInput(prev => prev ? prev + ' ' + text : text)
                    if (taRef.current) {
                      taRef.current.style.height = 'auto'
                      taRef.current.style.height = Math.min(taRef.current.scrollHeight, 120) + 'px'
                    }
                  }} />
                </div>
                <button
                  onClick={sendMessage}
                  disabled={chatLoading || !input.trim()}
                  style={{
                    width: 34, height: 34, margin: '4px 0',
                    borderRadius: 12, border: 'none', cursor: chatLoading || !input.trim() ? 'not-allowed' : 'pointer',
                    background: chatLoading || !input.trim() ? 'rgba(255,255,255,0.06)' : `linear-gradient(135deg,${s.energy},${s.mood})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    boxShadow: !chatLoading && input.trim() ? `0 0 20px ${s.energy}40` : 'none',
                    transition: 'all 0.15s',
                  }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill={chatLoading || !input.trim() ? 'rgba(255,255,255,0.25)' : '#07090D'}>
                    <path d="M2 21L23 12 2 3v7l15 2-15 2v7z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <BottomNav router={router} />
    </div>
  )
}

export default function PrioritiesPage() {
  return <Suspense><PrioritiesContent /></Suspense>
}
