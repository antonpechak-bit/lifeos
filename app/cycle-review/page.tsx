// @ts-nocheck
'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { VoiceButton } from '@/lib/VoiceButton'

const s = {
  bg:          '#07090D',
  text:        '#F2F0EA',
  dim:         'rgba(255,255,255,0.50)',
  muted:       'rgba(255,255,255,0.28)',
  energy:      '#6AA8FF',
  recovery:    '#52FF9A',
  mindfulness: '#B18DFF',
  stress:      '#FFB84D',
  overload:    '#FF5A5A',
}

const LAYER_COLORS: Record<string, string> = {
  sleep:      '#6AA8FF',
  nutrition:  '#52FF9A',
  movement:   '#FFB84D',
  ans:        '#B18DFF',
  connection: '#FFB84D',
  attention:  '#6AA8FF',
  values:     '#C89EFF',
}

const LAYER_LABELS: Record<string, string> = {
  sleep:      'Сон',
  nutrition:  'Питание',
  movement:   'Движение',
  ans:        'ВНС',
  connection: 'Связь',
  attention:  'Внимание',
  values:     'Ценности',
}

function InsightsSavedCard({ count, insights }) {
  return (
    <div style={{
      margin: '8px 0', padding: '18px 20px', borderRadius: 24,
      background: 'linear-gradient(155deg,rgba(82,255,154,0.08) 0%,rgba(177,141,255,0.04) 100%)',
      backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
      border: '1px solid rgba(82,255,154,0.2)', boxShadow: '0 0 40px rgba(82,255,154,0.06)',
      animation: 'fadeUp 0.4s forwards',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: insights.length ? 12 : 0 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.recovery, boxShadow: `0 0 10px ${s.recovery}80` }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: s.recovery }}>
          Сохранено {count} {count === 1 ? 'наблюдение' : count < 5 ? 'наблюдения' : 'наблюдений'}
        </span>
      </div>
      {insights.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {insights.map((ins, i) => (
            <div key={i} style={{
              fontSize: 12, color: s.dim, lineHeight: 1.6,
              padding: '8px 12px', borderRadius: 12,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            }}>
              {ins.content}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CycleCompletedCard({ summary, completedSprints, router }) {
  return (
    <div style={{
      margin: '8px 0', padding: '22px 22px', borderRadius: 24,
      background: 'linear-gradient(155deg,rgba(82,255,154,0.1) 0%,rgba(177,141,255,0.04) 100%)',
      backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
      border: '1px solid rgba(82,255,154,0.25)', boxShadow: '0 0 50px rgba(82,255,154,0.1)',
      animation: 'fadeUp 0.4s forwards',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          background: `${s.recovery}20`, border: `1px solid ${s.recovery}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
        }}>✓</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: s.recovery }}>Цикл завершён</div>
          <div style={{ fontSize: 12, color: s.muted, marginTop: 2 }}>
            {completedSprints.length} {completedSprints.length === 1 ? 'спринт закрыт' : completedSprints.length < 5 ? 'спринта закрыто' : 'спринтов закрыто'}
          </div>
        </div>
      </div>

      {/* Sprint stats */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: summary ? 14 : 16 }}>
        {completedSprints.map((sp, i) => {
          const pct = sp.total_days > 0 ? Math.round(sp.success_count / sp.total_days * 100) : 0
          const color = LAYER_COLORS[sp.layer] || s.muted
          return (
            <div key={sp.id || i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', borderRadius: 12,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}80` }} />
                <span style={{ fontSize: 13, color: s.dim }}>{sp.behavior_name}</span>
              </div>
              <span style={{ fontSize: 12, color, fontWeight: 600 }}>
                {sp.success_count}/{sp.total_days} · {pct}%
              </span>
            </div>
          )
        })}
      </div>

      {summary && (
        <div style={{
          fontSize: 13, color: s.dim, lineHeight: 1.75,
          padding: '12px 14px', borderRadius: 14,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
          marginBottom: 16, fontStyle: 'italic',
        }}>
          {summary}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => router.push('/dashboard/sprints')} style={{
          flex: 1, padding: '11px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
          background: `linear-gradient(135deg,${s.recovery} 0%,${s.mindfulness} 100%)`,
          color: '#07090D', fontSize: 13, fontWeight: 600,
        }}>
          Архив →
        </button>
        <button onClick={() => router.push('/dashboard/priorities')} style={{
          flex: 1, padding: '11px 0', borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(255,255,255,0.05)', cursor: 'pointer',
          color: s.dim, fontSize: 13,
        }}>
          Новый цикл →
        </button>
      </div>
    </div>
  )
}

function CycleReviewContent() {
  const router = useRouter()

  const [user, setUser]             = useState(null)
  const [loading, setLoading]       = useState(true)
  const [sprints, setSprints]       = useState<any[]>([])
  const [messages, setMessages]     = useState([])
  const [input, setInput]           = useState('')
  const [sending, setSending]       = useState(false)
  const [lastFailedMsg, setLastFailedMsg] = useState(null)
  const [savedInsights, setSavedInsights] = useState<any[]>([])
  const [insightsShown, setInsightsShown] = useState(false)
  const [isCompleted, setIsCompleted]     = useState(false)
  const [completing, setCompleting]       = useState(false)
  const [completionResult, setCompletionResult] = useState<any>(null)

  const bottomRef    = useRef(null)
  const inputRef     = useRef(null)
  const openingFired = useRef(false)

  useEffect(() => {
    async function load() {
      try {
        const { data: authData } = await supabase.auth.getSession()
        if (!authData?.session) { router.push('/'); return }
        setUser(authData.session.user)

        const { data: sprintsData } = await supabase
          .from('sprints')
          .select('id, behavior_name, layer, target_days, started_at, created_at')
          .eq('user_id', authData.session.user.id)
          .eq('status', 'active')
          .order('created_at')

        setSprints(sprintsData || [])
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (user && sprints.length > 0 && !openingFired.current) {
      openingFired.current = true
      sendMessage(null)
    }
  }, [user, sprints])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  async function sendMessage(text: string | null) {
    const isOpening = text === null
    const msg = isOpening ? null : (text || input.trim())
    if (!isOpening && (!msg || sending)) return

    if (!isOpening) setInput('')
    setSending(true)
    setLastFailedMsg(null)

    const newMessages = isOpening
      ? messages
      : [...messages, { role: 'user', content: msg }]

    if (!isOpening) setMessages(newMessages)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token ?? ''

      const historyForApi = isOpening
        ? []
        : newMessages.slice(0, -1).map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/cycle-review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ userId: user.id, messages: historyForApi }),
      })

      if (!res.ok) {
        let errText = `Ошибка сервера (${res.status})`
        try { const d = await res.json(); if (d.error) errText = d.error } catch {}
        setLastFailedMsg(isOpening ? '__opening__' : msg)
        setMessages(prev => [...prev, { role: 'error', content: errText }])
        setSending(false)
        return
      }

      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.text || 'Не удалось получить ответ.' }])

      if (data.insights_saved && !insightsShown) {
        setSavedInsights(data.insights || [])
        setInsightsShown(true)
      }
    } catch (e) {
      console.error(e)
      setLastFailedMsg(isOpening ? '__opening__' : msg)
      setMessages(prev => [...prev, { role: 'error', content: 'Ошибка соединения. Проверь интернет и попробуй снова.' }])
    }

    setSending(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function handleComplete() {
    if (completing || isCompleted) return
    setCompleting(true)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token ?? ''

      const cleanMsgs = messages
        .filter(m => m.role !== 'error')
        .map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/cycle-complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ userId: user.id, messages: cleanMsgs }),
      })

      if (res.ok) {
        const data = await res.json()
        setIsCompleted(true)
        setCompletionResult(data)
      } else {
        setMessages(prev => [...prev, { role: 'error', content: 'Не удалось завершить цикл. Попробуй ещё раз.' }])
      }
    } catch (e) {
      console.error(e)
      setMessages(prev => [...prev, { role: 'error', content: 'Ошибка соединения при завершении цикла.' }])
    }

    setCompleting(false)
  }

  function retry() {
    if (!lastFailedMsg) return
    setMessages(prev => prev.filter((m, i) => !(i === prev.length - 1 && m.role === 'error')))
    if (lastFailedMsg === '__opening__') {
      openingFired.current = false
      sendMessage(null)
    } else {
      sendMessage(lastFailedMsg)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
  }

  const hasUserMessages = messages.some(m => m.role === 'user')

  if (loading) return (
    <div style={{ minHeight: '100vh', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.08)', borderTop: `2px solid ${s.energy}`, animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (sprints.length === 0) return (
    <div style={{ minHeight: '100vh', background: s.bg, color: s.text, fontFamily: "'DM Sans',sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ fontSize: 40, marginBottom: 20, opacity: 0.4 }}>🏁</div>
      <div style={{ fontSize: 16, color: s.dim, marginBottom: 10 }}>Нет активных спринтов</div>
      <div style={{ fontSize: 13, color: s.muted, lineHeight: 1.7, marginBottom: 28, maxWidth: 320 }}>
        Ревью цикла доступно когда есть активные спринты.
      </div>
      <button onClick={() => router.push('/dashboard')} style={{
        padding: '12px 24px', borderRadius: 999, border: 'none', cursor: 'pointer',
        background: `linear-gradient(135deg,${s.energy} 0%,${s.mindfulness} 100%)`,
        color: '#07090D', fontSize: 13, fontWeight: 600,
      }}>
        На дашборд →
      </button>
    </div>
  )

  const headerSubtitle = sprints.length === 1
    ? `«${sprints[0].behavior_name}»`
    : `${sprints.length} спринта`

  return (
    <div style={{ minHeight: '100vh', background: s.bg, color: s.text, fontFamily: "'DM Sans',sans-serif", fontWeight: 300, display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
        @keyframes pulse  { 0%,100% { opacity:0.4 } 50% { opacity:1 } }
        @keyframes spin   { to { transform:rotate(360deg) } }
        textarea:focus { outline:none; }
        textarea { resize:none; }
      `}</style>

      {/* Header */}
      <header style={{
        padding: '20px 24px 14px',
        background: 'rgba(7,9,13,0.85)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        flexShrink: 0, position: 'sticky', top: 0, zIndex: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', maxWidth: 640, marginBottom: 14 }}>
          <button onClick={() => router.push('/dashboard')} style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10, padding: '6px 10px', cursor: 'pointer', color: s.dim, fontSize: 13, flexShrink: 0,
          }}>←</button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: s.text, opacity: 0.9 }}>
              Ревью цикла
            </div>
            <div style={{ fontSize: 11, color: s.muted, marginTop: 2 }}>{headerSubtitle}</div>
          </div>
          <div style={{ width: 40 }} />
        </div>

        {/* Sprint pill row */}
        {sprints.length > 1 && (
          <div style={{ width: '100%', maxWidth: 640, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {sprints.map((sp, i) => {
              const color = LAYER_COLORS[sp.layer] || s.muted
              return (
                <div key={sp.id} style={{
                  padding: '4px 10px', borderRadius: 999,
                  background: `${color}12`, border: `1px solid ${color}25`,
                  fontSize: 11, color,
                }}>
                  [{i}] {sp.behavior_name}
                </div>
              )
            })}
          </div>
        )}
      </header>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 18px 180px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Opening shimmer */}
        {messages.length === 0 && sending && (
          <div style={{ animation: 'fadeUp 0.3s forwards' }}>
            <div style={{
              padding: '18px 20px', borderRadius: '4px 20px 20px 20px', maxWidth: 380,
              background: 'linear-gradient(155deg,rgba(177,141,255,0.06) 0%,rgba(255,255,255,0.02) 100%)',
              backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(177,141,255,0.1)',
            }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: s.mindfulness, opacity: 0.5, animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                ))}
                <span style={{ marginLeft: 4, fontSize: 12, color: s.muted }}>Открываю разговор…</span>
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === 'error') {
            return (
              <div key={i} style={{ animation: 'fadeUp 0.3s forwards' }}>
                <div style={{
                  padding: '12px 16px', borderRadius: '4px 20px 20px 20px',
                  background: 'rgba(255,90,90,0.07)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,90,90,0.2)', fontSize: 13, color: s.overload, lineHeight: 1.65,
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                }}>
                  <span>⚠ {msg.content}</span>
                  {lastFailedMsg && (
                    <button onClick={retry} style={{
                      fontSize: 12, color: s.energy, background: `${s.energy}15`,
                      border: `1px solid ${s.energy}30`, borderRadius: 999, padding: '4px 14px', cursor: 'pointer', flexShrink: 0,
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
                  : 'linear-gradient(155deg,rgba(177,141,255,0.07) 0%,rgba(255,255,255,0.025) 100%)',
                backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                border: `1px solid ${msg.role === 'user' ? 'rgba(106,168,255,0.2)' : 'rgba(177,141,255,0.12)'}`,
                boxShadow: msg.role === 'user' ? '0 4px 24px rgba(106,168,255,0.08)' : '0 4px 24px rgba(177,141,255,0.06)',
                fontSize: 14, lineHeight: 1.8,
                color: msg.role === 'user' ? s.energy : s.text,
                whiteSpace: 'pre-wrap',
              }}>
                {msg.content}
              </div>
            </div>
          )
        })}

        {/* Typing indicator */}
        {sending && messages.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderRadius: '4px 20px 20px 20px', background: 'linear-gradient(155deg,rgba(177,141,255,0.06) 0%,rgba(255,255,255,0.02) 100%)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(177,141,255,0.1)', maxWidth: 100 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: s.mindfulness, animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
            ))}
          </div>
        )}

        {/* Insights saved */}
        {insightsShown && savedInsights.length > 0 && (
          <InsightsSavedCard count={savedInsights.length} insights={savedInsights} />
        )}

        {/* Complete cycle button */}
        {hasUserMessages && !isCompleted && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0 4px', animation: 'fadeUp 0.5s forwards' }}>
            <button
              onClick={handleComplete}
              disabled={completing}
              style={{
                padding: '12px 32px', borderRadius: 999, border: 'none',
                cursor: completing ? 'not-allowed' : 'pointer',
                background: completing
                  ? 'rgba(255,255,255,0.05)'
                  : `linear-gradient(135deg,${s.recovery} 0%,${s.mindfulness} 100%)`,
                color: completing ? s.muted : '#07090D',
                fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
                boxShadow: completing ? 'none' : `0 0 30px rgba(82,255,154,0.3), 0 4px 20px rgba(82,255,154,0.15)`,
                transition: 'all 0.2s',
              }}>
              {completing ? 'Завершаем цикл...' : 'Завершить цикл →'}
            </button>
            <div style={{ fontSize: 11, color: s.muted, marginTop: 6 }}>
              Закроет все активные спринты и запишет итог
            </div>
          </div>
        )}

        {/* Cycle completion card */}
        {isCompleted && completionResult && (
          <CycleCompletedCard
            summary={completionResult.reflection_summary}
            completedSprints={completionResult.completed_sprints || []}
            router={router}
          />
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar — hidden after cycle completed */}
      {!isCompleted ? (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          padding: '10px 18px calc(18px + env(safe-area-inset-bottom))',
          background: 'rgba(7,9,13,0.80)',
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          borderTop: '1px solid rgba(255,255,255,0.05)', zIndex: 30,
        }}>
          <div style={{
            maxWidth: 640, margin: '0 auto', display: 'flex', gap: 10, alignItems: 'flex-end',
            background: 'linear-gradient(155deg,rgba(255,255,255,0.07) 0%,rgba(255,255,255,0.03) 100%)',
            backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24,
            padding: '10px 10px 10px 18px', boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ответь или поделись мыслью…"
              rows={1}
              style={{
                flex: 1, background: 'transparent', border: 'none',
                color: s.text, fontSize: 14, fontFamily: "'DM Sans',sans-serif",
                fontWeight: 300, lineHeight: 1.6, maxHeight: 120, overflowY: 'auto',
              }}
              onInput={e => {
                const t = e.target as HTMLTextAreaElement
                t.style.height = 'auto'
                t.style.height = Math.min(t.scrollHeight, 120) + 'px'
              }}
            />
            <VoiceButton size={38} onResult={text => {
              setInput(prev => prev ? prev + ' ' + text : text)
              if (inputRef.current) {
                inputRef.current.style.height = 'auto'
                inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px'
              }
            }} />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || sending}
              style={{
                width: 38, height: 38, borderRadius: 14, border: 'none',
                background: input.trim() && !sending
                  ? `linear-gradient(135deg,${s.mindfulness} 0%,${s.energy} 100%)`
                  : 'rgba(255,255,255,0.08)',
                cursor: input.trim() && !sending ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'all 0.2s',
                boxShadow: input.trim() && !sending ? `0 0 24px rgba(177,141,255,0.4)` : 'none',
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
      ) : (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          padding: '12px 18px calc(18px + env(safe-area-inset-bottom))',
          background: 'rgba(7,9,13,0.85)',
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          borderTop: '1px solid rgba(255,255,255,0.05)', zIndex: 30,
        }}>
          <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', gap: 10 }}>
            <button onClick={() => router.push('/dashboard/sprints')} style={{
              flex: 1, padding: '12px', borderRadius: 14, border: 'none', cursor: 'pointer',
              background: `linear-gradient(135deg,${s.recovery} 0%,${s.mindfulness} 100%)`,
              color: '#07090D', fontSize: 13, fontWeight: 600,
            }}>
              Архив спринтов →
            </button>
            <button onClick={() => router.push('/dashboard/priorities')} style={{
              flex: 1, padding: '12px', borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.05)', cursor: 'pointer',
              color: s.dim, fontSize: 13,
            }}>
              Новый спринт →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CycleReviewPage() {
  return <Suspense><CycleReviewContent /></Suspense>
}
