// @ts-nocheck
'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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

const STARTER_PROMPTS = [
  'Покажи полную картину моего состояния — что связано между собой?',
  'Какие закономерности видны между моими анализами и самочувствием?',
  'Что сейчас важнее всего улучшить и почему?',
  'Как мои биомаркеры соотносятся с тем что я описывал в диагностике?',
  'Что говорят мои чекины за последние недели?',
]

function ContextBadge({ label, color }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 12px', borderRadius: 999,
      background: `${color}15`, border: `1px solid ${color}30`,
      fontSize: 11, color,
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    }}>
      {label}
    </div>
  )
}

function RecommendationCard({ rec }) {
  const layerColors = ['', '#1D9E75', '#378ADD', '#D4537E', '#BA7517', '#7F77DD', '#D85A30', '#888780']
  const priorityColor = { high: s.overload, medium: s.stress, low: s.muted }
  const color = rec.layer ? (layerColors[rec.layer] || s.recovery) : s.recovery

  return (
    <div style={{
      marginTop: 10, padding: '14px 16px', borderRadius: 20,
      background: `linear-gradient(155deg, ${s.recovery}08 0%, rgba(255,255,255,0.02) 100%)`,
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      border: `1px solid ${s.recovery}22`,
      boxShadow: `0 0 24px ${s.recovery}06`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.recovery, flexShrink: 0, boxShadow: `0 0 8px ${s.recovery}80` }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: s.text }}>{rec.title}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: priorityColor[rec.priority] || s.muted }}>{rec.priority}</span>
      </div>
      <div style={{ fontSize: 13, color: s.dim, lineHeight: 1.75 }}>{rec.body}</div>
      {rec.layer && (
        <div style={{ marginTop: 8, fontSize: 11, color: s.recovery }}>Layer {rec.layer}</div>
      )}
    </div>
  )
}

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

function AssistantContent() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [contextSummary, setContextSummary] = useState(null)
  const [lastFailedMsg, setLastFailedMsg] = useState(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    async function load() {
      try {
        const { data: authData } = await supabase.auth.getSession()
        if (!authData?.session) { router.push('/'); return }
        setUser(authData.session.user)
      } catch(e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(text) {
    const msg = text || input.trim()
    if (!msg || !user || sending) return
    setInput('')
    setSending(true)
    setLastFailedMsg(null)

    const userMsg = { role: 'user', content: msg }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)

    try {
      const historyForApi = newMessages.slice(0, -1).map(m => ({
        role: m.role,
        content: m.content,
      }))

      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token ?? ''

      const res = await fetch('/api/deep-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: msg,
          history: historyForApi,
          userId: user.id,
        }),
      })

      if (!res.ok) {
        let errText = `Ошибка сервера (${res.status})`
        try {
          const errData = await res.json()
          if (errData.message) errText = errData.message
          else if (errData.error) errText = errData.error
        } catch {}
        setLastFailedMsg(msg)
        setMessages(prev => [...prev, { role: 'error', content: errText }])
        setSending(false)
        return
      }

      const data = await res.json()
      if (data.context_summary) setContextSummary(data.context_summary)

      const assistantMsg = {
        role: 'assistant',
        content: data.text || 'Не удалось получить ответ.',
        recommendations: data.recommendations || [],
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch(e) {
      console.error(e)
      setLastFailedMsg(msg)
      setMessages(prev => [...prev, { role: 'error', content: 'Ошибка соединения. Проверь интернет и попробуй снова.' }])
    }
    setSending(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  function retry() {
    if (!lastFailedMsg) return
    setMessages(prev => prev.filter((m, i) => !(i === prev.length - 1 && m.role === 'error')))
    send(lastFailedMsg)
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.08)', borderTop: `2px solid ${s.energy}`, animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const isEmptyChat = messages.length === 0

  return (
    <div style={{ minHeight: '100vh', background: s.bg, color: s.text, fontFamily: "'DM Sans',sans-serif", fontWeight: 300, display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
        @keyframes pulse { 0%,100% { opacity:0.4 } 50% { opacity:1 } }
        @keyframes spin { to { transform:rotate(360deg) } }
        @keyframes orbFloat { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(8px,-6px) scale(1.05)} }
        textarea:focus { outline:none; }
        textarea { resize:none; }
      `}</style>

      {/* Sticky glass header */}
      <header style={{
        padding: '20px 24px 14px',
        background: 'rgba(7,9,13,0.85)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        flexShrink: 0, position: 'sticky', top: 0, zIndex: 20,
      }}>
        <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, color: s.text, opacity: 0.9 }}>Ассистент</span>
        {contextSummary && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            {contextSummary.has_state_map && <ContextBadge label="State Map" color={s.mindfulness} />}
            {contextSummary.active_sprints > 0 && <ContextBadge label={`${contextSummary.active_sprints} спринт`} color={s.recovery} />}
            {contextSummary.biomarkers_count > 0 && <ContextBadge label={`${contextSummary.biomarkers_count} биомаркеров`} color={s.energy} />}
            {contextSummary.danger_biomarkers?.length > 0 && (
              <ContextBadge label={`⚠ ${contextSummary.danger_biomarkers.join(', ')}`} color={s.overload} />
            )}
          </div>
        )}
      </header>

      {/* Messages scroll area — padded below for fixed input + nav */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 18px 180px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {isEmptyChat && (
          <div style={{ animation: 'fadeUp 0.4s forwards' }}>
            {/* Welcome glass card */}
            <div style={{
              borderRadius: 36, padding: '36px 28px 32px',
              background: 'linear-gradient(145deg,rgba(106,168,255,0.08) 0%,rgba(177,141,255,0.04) 100%)',
              backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
              border: '1px solid rgba(255,255,255,0.08)',
              textAlign: 'center', marginBottom: 20,
              position: 'relative', overflow: 'hidden',
              boxShadow: '0 0 80px rgba(106,168,255,0.06), 0 20px 60px rgba(0,0,0,0.3)',
            }}>
              <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle,rgba(106,168,255,0.18) 0%,transparent 65%)', animation: 'orbFloat 8s ease-in-out infinite', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', bottom: -50, left: -30, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle,rgba(177,141,255,0.12) 0%,transparent 65%)', animation: 'orbFloat 10s ease-in-out infinite 2s', pointerEvents: 'none' }} />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 24, color: s.text, marginBottom: 10 }}>
                  Что хочешь исследовать?
                </div>
                <div style={{ fontSize: 13, color: s.dim, lineHeight: 1.8, maxWidth: 320, margin: '0 auto' }}>
                  Я вижу твою State Map, биомаркеры, чекины и спринты.<br />
                  Могу найти связи между ними и предложить фокус.
                </div>
              </div>
            </div>

            {/* Starter prompt glass pills */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 480, margin: '0 auto' }}>
              {STARTER_PROMPTS.map((p, i) => (
                <button key={i} onClick={() => send(p)} style={{
                  padding: '13px 18px', borderRadius: 20,
                  background: 'linear-gradient(155deg,rgba(255,255,255,0.065) 0%,rgba(255,255,255,0.02) 100%)',
                  backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: s.dim, fontSize: 13, textAlign: 'left', cursor: 'pointer',
                  transition: 'all 0.15s', lineHeight: 1.5,
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)'; e.currentTarget.style.color = s.text }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = s.dim }}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === 'error') {
            return (
              <div key={i} style={{ animation: 'fadeUp 0.3s forwards' }}>
                <div style={{
                  padding: '12px 16px', borderRadius: '4px 20px 20px 20px',
                  background: 'rgba(255,90,90,0.07)',
                  backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,90,90,0.2)',
                  fontSize: 13, color: s.overload, lineHeight: 1.65,
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                }}>
                  <span>⚠ {msg.content}</span>
                  {lastFailedMsg && (
                    <button onClick={retry} style={{
                      fontSize: 12, color: s.energy,
                      background: `${s.energy}15`, border: `1px solid ${s.energy}30`,
                      borderRadius: 999, padding: '4px 14px', cursor: 'pointer', flexShrink: 0,
                    }}>
                      Повторить
                    </button>
                  )}
                </div>
              </div>
            )
          }

          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', animation: 'fadeUp 0.3s forwards' }}>
              <div style={{
                maxWidth: msg.role === 'user' ? '80%' : '100%',
                padding: msg.role === 'user' ? '11px 16px' : '14px 18px',
                borderRadius: msg.role === 'user' ? '20px 20px 4px 20px' : '4px 20px 20px 20px',
                background: msg.role === 'user'
                  ? 'linear-gradient(155deg,rgba(106,168,255,0.14) 0%,rgba(106,168,255,0.05) 100%)'
                  : 'linear-gradient(155deg,rgba(255,255,255,0.075) 0%,rgba(255,255,255,0.025) 100%)',
                backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                border: `1px solid ${msg.role === 'user' ? 'rgba(106,168,255,0.2)' : 'rgba(255,255,255,0.08)'}`,
                boxShadow: msg.role === 'user' ? '0 4px 24px rgba(106,168,255,0.08)' : '0 4px 24px rgba(0,0,0,0.2)',
                fontSize: 14, lineHeight: 1.75,
                color: msg.role === 'user' ? s.energy : s.text,
                whiteSpace: 'pre-wrap',
              }}>
                {msg.content}
              </div>
              {msg.recommendations?.length > 0 && (
                <div style={{ width: '100%', marginTop: 6 }}>
                  {msg.recommendations.map((rec, j) => (
                    <RecommendationCard key={j} rec={rec} />
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {sending && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 18px', borderRadius: '4px 20px 20px 20px',
            background: 'linear-gradient(155deg,rgba(255,255,255,0.06) 0%,rgba(255,255,255,0.02) 100%)',
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.08)', maxWidth: 100,
          }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: s.dim, animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Glass input bar — fixed above BottomNav */}
      <div style={{
        position: 'fixed', bottom: 88, left: 0, right: 0,
        padding: '10px 18px',
        background: 'rgba(7,9,13,0.75)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        zIndex: 30,
      }}>
        <div style={{
          maxWidth: 640, margin: '0 auto',
          display: 'flex', gap: 10, alignItems: 'flex-end',
          background: 'linear-gradient(155deg,rgba(255,255,255,0.07) 0%,rgba(255,255,255,0.03) 100%)',
          backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 24, padding: '10px 10px 10px 18px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Спроси о своём состоянии, анализах, паттернах..."
            rows={1}
            style={{
              flex: 1, background: 'transparent', border: 'none',
              color: s.text, fontSize: 14, fontFamily: "'DM Sans',sans-serif",
              fontWeight: 300, lineHeight: 1.6, maxHeight: 120, overflowY: 'auto',
            }}
            onInput={e => {
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || sending}
            style={{
              width: 38, height: 38, borderRadius: 14, border: 'none',
              background: input.trim() && !sending
                ? `linear-gradient(135deg, ${s.energy} 0%, ${s.mindfulness} 100%)`
                : 'rgba(255,255,255,0.08)',
              cursor: input.trim() && !sending ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'all 0.2s',
              boxShadow: input.trim() && !sending ? `0 0 24px rgba(106,168,255,0.4)` : 'none',
            }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke={input.trim() && !sending ? '#07090D' : 'rgba(255,255,255,0.3)'}
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
            </svg>
          </button>
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.18)', marginTop: 6 }}>
          Enter — отправить · Shift+Enter — перенос строки
        </div>
      </div>

      <BottomNav router={router} />
    </div>
  )
}

export default function AssistantPage() {
  return <Suspense><AssistantContent /></Suspense>
}
