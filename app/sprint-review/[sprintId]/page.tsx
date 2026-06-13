// @ts-nocheck
'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useParams } from 'next/navigation'
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

const LAYER_NAMES: Record<number, string> = {
  1: 'Телесная основа',
  2: 'Безопасность / ВНС',
  3: 'Связь',
  4: 'Внимание',
  5: 'Ценности',
  6: 'Смысл',
  7: 'Трансценденция',
}

function InsightsSavedCard({ count, insights, router }) {
  return (
    <div style={{
      margin: '8px 0',
      padding: '18px 20px',
      borderRadius: 24,
      background: 'linear-gradient(155deg,rgba(82,255,154,0.08) 0%,rgba(177,141,255,0.04) 100%)',
      backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
      border: '1px solid rgba(82,255,154,0.2)',
      boxShadow: '0 0 40px rgba(82,255,154,0.06)',
      animation: 'fadeUp 0.4s forwards',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.recovery, boxShadow: `0 0 10px ${s.recovery}80` }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: s.recovery }}>
          Сохранено: {count} {count === 1 ? 'наблюдение' : count < 5 ? 'наблюдения' : 'наблюдений'}
        </span>
      </div>
      {insights.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {insights.map((ins, i) => (
            <div key={i} style={{
              fontSize: 12, color: s.dim, lineHeight: 1.6,
              padding: '8px 12px', borderRadius: 12,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              {ins.layer && ins.layer > 0 && (
                <span style={{ fontSize: 10, color: s.recovery, display: 'block', marginBottom: 3 }}>
                  Слой {ins.layer}{LAYER_NAMES[ins.layer] ? ` · ${LAYER_NAMES[ins.layer]}` : ''}
                </span>
              )}
              {ins.content}
            </div>
          ))}
        </div>
      )}
      <button
        onClick={() => router.push('/dashboard/priorities')}
        style={{
          width: '100%', padding: '11px 0', borderRadius: 14, border: 'none',
          background: `linear-gradient(135deg,${s.recovery} 0%,${s.mindfulness} 100%)`,
          color: '#07090D', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          letterSpacing: '0.01em',
        }}>
        Создать следующий спринт →
      </button>
    </div>
  )
}

function SprintReviewContent() {
  const router = useRouter()
  const params = useParams()
  const sprintId = params.sprintId as string

  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sprintName, setSprintName] = useState('')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [lastFailedMsg, setLastFailedMsg] = useState(null)
  const [savedInsights, setSavedInsights] = useState<any[]>([])
  const [insightsShown, setInsightsShown] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const openingFired = useRef(false)

  useEffect(() => {
    async function load() {
      try {
        const { data: authData } = await supabase.auth.getSession()
        if (!authData?.session) { router.push('/'); return }
        setUser(authData.session.user)

        // Fetch sprint name for header
        const { data: sprint } = await supabase
          .from('sprints')
          .select('behavior_name')
          .eq('id', sprintId)
          .single()
        if (sprint) setSprintName(sprint.behavior_name)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Fire opening message once user is loaded
  useEffect(() => {
    if (user && !openingFired.current) {
      openingFired.current = true
      sendMessage(null)
    }
  }, [user])

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

      // History: exclude the just-added user message (API adds it via the empty-messages opening)
      const historyForApi = isOpening
        ? []
        : newMessages.slice(0, -1).map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/sprint-review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          userId: user.id,
          sprintId,
          messages: historyForApi,
        }),
      })

      if (!res.ok) {
        let errText = `Ошибка сервера (${res.status})`
        try {
          const errData = await res.json()
          if (errData.error) errText = errData.error
        } catch {}
        setLastFailedMsg(isOpening ? '__opening__' : msg)
        setMessages(prev => [...prev, { role: 'error', content: errText }])
        setSending(false)
        return
      }

      const data = await res.json()

      const assistantMsg = {
        role: 'assistant',
        content: data.text || 'Не удалось получить ответ.',
      }
      setMessages(prev => [...prev, assistantMsg])

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

  if (loading) return (
    <div style={{ minHeight: '100vh', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.08)', borderTop: `2px solid ${s.energy}`, animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: s.bg, color: s.text, fontFamily: "'DM Sans',sans-serif", fontWeight: 300, display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
        @keyframes pulse { 0%,100% { opacity:0.4 } 50% { opacity:1 } }
        @keyframes spin { to { transform:rotate(360deg) } }
        textarea:focus { outline:none; }
        textarea { resize:none; }
      `}</style>

      {/* Header */}
      <header style={{
        padding: '20px 24px 14px',
        background: 'rgba(7,9,13,0.85)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        flexShrink: 0, position: 'sticky', top: 0, zIndex: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', maxWidth: 640 }}>
          <button
            onClick={() => router.push('/dashboard')}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10, padding: '6px 10px', cursor: 'pointer', color: s.dim,
              fontSize: 13, flexShrink: 0,
            }}>
            ←
          </button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: s.text, opacity: 0.9 }}>
              Итоги спринта
            </div>
            {sprintName && (
              <div style={{ fontSize: 11, color: s.muted, marginTop: 2 }}>«{sprintName}»</div>
            )}
          </div>
          <div style={{ width: 40 }} />
        </div>
      </header>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 18px 160px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Opening shimmer while first message loads */}
        {messages.length === 0 && sending && (
          <div style={{ animation: 'fadeUp 0.3s forwards' }}>
            <div style={{
              padding: '18px 20px', borderRadius: '4px 20px 20px 20px',
              background: 'linear-gradient(155deg,rgba(177,141,255,0.06) 0%,rgba(255,255,255,0.02) 100%)',
              backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(177,141,255,0.1)',
              fontSize: 13, color: s.muted, lineHeight: 1.75, maxWidth: 380,
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

        {/* Typing indicator (after at least one message) */}
        {sending && messages.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderRadius: '4px 20px 20px 20px', background: 'linear-gradient(155deg,rgba(177,141,255,0.06) 0%,rgba(255,255,255,0.02) 100%)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(177,141,255,0.1)', maxWidth: 100 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: s.mindfulness, animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
            ))}
          </div>
        )}

        {/* Insights saved card */}
        {insightsShown && savedInsights.length > 0 && (
          <InsightsSavedCard
            count={savedInsights.length}
            insights={savedInsights}
            router={router}
          />
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        padding: '10px 18px calc(18px + env(safe-area-inset-bottom))',
        background: 'rgba(7,9,13,0.80)',
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
    </div>
  )
}

export default function SprintReviewPage() {
  return <Suspense><SprintReviewContent /></Suspense>
}
