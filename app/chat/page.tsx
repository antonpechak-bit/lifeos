// @ts-nocheck
'use client'
import { useEffect, useRef, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase, Message } from '@/lib/supabase'
import { LAYERS, OPENING_MESSAGE } from '@/lib/prompts'
import { VoiceButton } from '@/lib/VoiceButton'

// ── Design tokens ──────────────────────────────────────────────
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

// ── Logic (unchanged) ──────────────────────────────────────────
function detectLayer(text: string): number | null {
  const t = text.toLowerCase()
  if (t.includes('как ты сейчас') || t.includes('вкус') || t.includes('последнее время')) return 1
  if (t.includes('спишь') || t.includes('движени') || t.includes('питани') || t.includes('энерги')) return 2
  if (t.includes('стресс') || t.includes('тревог') || t.includes('восстанавл') || t.includes('нервн')) return 3
  if (t.includes('близ') || t.includes('одиноч') || t.includes('понят') || (t.includes('отношени') && !t.includes('к тебе'))) return 4
  if (t.includes('концентрац') || t.includes('поток') || t.includes('вниман') || t.includes('присутств')) return 5
  if (t.includes('ценност') || t.includes('смысл') || t.includes('направлени') || t.includes('значим')) return 6
  if (t.includes('[state_map_start]') || (t.includes('напиши') && t.includes('готов')) || t.includes('сформиру')) return 7
  return null
}

type Priority = { n: string; name: string; why: string; step: string }
type StateMapData = { sections: Record<string, string>; priorities: Priority[]; nextStep: string }

function parseStateMap(raw: string): StateMapData {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
  const sections: Record<string, string> = {}
  const priorities: Priority[] = []
  let nextStep = ''
  let curKey = ''
  let curVal = ''

  const secKeys: Record<string, string> = {
    'ОБЩАЯ КАРТИНА': 'overview',
    'ЧТО РАБОТАЕТ': 'working',
    'ЧТО ТРЕБУЕТ ВНИМАНИЯ': 'attention',
    'СЛЕПЫЕ ПЯТНА': 'blind',
    'ДЛЯ ТЕРАПЕВТА': 'therapist',
  }

  function flush() {
    if (curKey && curVal.trim()) sections[curKey] = curVal.trim()
    curVal = ''
  }

  lines.forEach(line => {
    const pm = line.match(/^ПРИОРИТЕТ (\d):\s*(.+)/i)
    if (pm) {
      flush(); curKey = ''
      const p = pm[2].split('|').map(s => s.trim())
      priorities.push({ n: pm[1], name: p[0] || '', why: p[1] || '', step: p[2] || '' })
      return
    }
    const nm = line.match(/^СЛЕДУЮЩИЙ ШАГ:\s*(.+)/i)
    if (nm) { flush(); curKey = ''; nextStep = nm[1]; return }
    let hit = false
    for (const [k, v] of Object.entries(secKeys)) {
      if (line.startsWith(k + ':')) {
        flush(); curKey = v; curVal = line.slice(k.length + 1).trim(); hit = true; break
      }
    }
    if (!hit && curKey) curVal += (curVal ? '\n' : '') + line
  })
  flush()
  return { sections, priorities, nextStep }
}

// ── State Map Card — glassmorphism ─────────────────────────────
function StateMapCard({ raw, sessionId }: { raw: string; sessionId: string | null }) {
  const { sections, priorities, nextStep } = parseStateMap(raw)

  const sectionList = [
    { key: 'overview',   label: 'Общая картина',           color: s.energy },
    { key: 'working',    label: 'Что работает ✓',           color: s.recovery },
    { key: 'attention',  label: 'Что требует внимания ◎',   color: s.stress },
    { key: 'blind',      label: 'Слепые пятна ?',           color: s.mindfulness },
    { key: 'therapist',  label: 'Для терапевта 🔍',          color: s.muted },
  ]

  return (
    <div style={{
      background: 'linear-gradient(155deg,rgba(255,255,255,0.09) 0%,rgba(255,255,255,0.03) 100%)',
      backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
      border: `1px solid ${s.energy}28`,
      borderRadius: 28, padding: '22px 20px',
      boxShadow: `0 0 60px ${s.energy}10, 0 20px 60px rgba(0,0,0,0.4)`,
      marginTop: 10,
    }}>
      <div style={{
        fontFamily: "'Playfair Display',serif",
        fontSize: 15, fontWeight: 600, color: s.energy,
        marginBottom: 18, paddingBottom: 14,
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        🧬 State Map — {new Date().toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })}
      </div>

      {sectionList.map(({ key, label, color }) => sections[key] ? (
        <div key={key} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color, opacity: 0.7, marginBottom: 7 }}>
            {label}
          </div>
          <div style={{ fontSize: 13, color: s.dim, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
            {sections[key].split('•').filter(Boolean).map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
                {(i > 0 || sections[key].startsWith('•')) && (
                  <span style={{ color, opacity: 0.6, flexShrink: 0 }}>•</span>
                )}
                <span>{item.trim()}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null)}

      {priorities.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: s.muted, marginBottom: 10 }}>
            Фокус на 2–3 месяца
          </div>
          {priorities.map(p => (
            <div key={p.n} style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 16, padding: '12px 14px', marginBottom: 8,
            }}>
              <div style={{ fontSize: 10, color: s.energy, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
                Приоритет {p.n}
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: s.text, marginBottom: p.why ? 4 : 0 }}>{p.name}</div>
              {p.why  && <div style={{ fontSize: 12, color: s.dim, marginBottom: p.step ? 4 : 0 }}>{p.why}</div>}
              {p.step && <div style={{ fontSize: 12, color: s.muted }}>→ {p.step}</div>}
            </div>
          ))}
        </div>
      )}

      {nextStep && (
        <div style={{
          background: `${s.energy}10`, border: `1px solid ${s.energy}28`,
          borderRadius: 14, padding: '11px 14px',
          fontSize: 13, color: s.energy,
        }}>
          → {nextStep}
        </div>
      )}

      <button
        onClick={() => {
          const url = sessionId ? `/dashboard/priorities?session=${sessionId}` : '/dashboard/priorities'
          window.location.href = url
        }}
        style={{
          width: '100%', marginTop: 16, padding: '13px',
          borderRadius: 999, border: 'none', cursor: 'pointer',
          background: `linear-gradient(135deg,${s.energy} 0%,${s.mindfulness} 100%)`,
          color: '#07090D', fontSize: 14, fontWeight: 600,
          fontFamily: "'DM Sans',sans-serif",
          boxShadow: `0 0 32px ${s.energy}40, 0 4px 20px ${s.energy}28`,
        }}
      >
        Открыть карту приоритетов →
      </button>
    </div>
  )
}

// ── Chat ───────────────────────────────────────────────────────
function ChatContent() {
  const params = useSearchParams()
  const sessionId = params.get('session')
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: OPENING_MESSAGE }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [currentLayer, setCurrentLayer] = useState(0)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const initRef = useRef<boolean>(false)
  const creatingRef = useRef<boolean>(false)
  const [resumeOption, setResumeOption] = useState<{id: string; updatedAt: string} | null>(null)

  // ── Init: create session or offer resume when no ?session= in URL ──
  useEffect(() => {
    if (sessionId) return
    if (initRef.current) return
    initRef.current = true

    async function init() {
      const { data: authData } = await supabase.auth.getSession()
      if (!authData?.session) return
      const u = authData.session.user

      const { data: existing } = await supabase
        .from('sessions')
        .select('id, updated_at, messages')
        .eq('user_id', u.id)
        .eq('completed', false)
        .order('updated_at', { ascending: false })
        .limit(1)

      const found = existing?.[0]
      const hasConversation = found && Array.isArray(found.messages) && found.messages.length > 1

      if (hasConversation) {
        setResumeOption({ id: found.id, updatedAt: found.updated_at })
      } else {
        await startNewSession(u.id)
      }
    }
    init()
  }, [sessionId])

  // ── Load existing session when ?session= is present ──
  useEffect(() => {
    if (sessionId && !sessionLoaded) {
      supabase.from('sessions').select('messages, current_layer').eq('id', sessionId).single()
        .then(({ data }) => {
          if (data?.messages?.length > 0) {
            setMessages(data.messages)
            setCurrentLayer(data.current_layer || 0)
          }
          setSessionLoaded(true)
        })
    }
  }, [sessionId, sessionLoaded])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send() {
    if (!input.trim() || loading) return
    const userMsg: Message = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, sessionId }),
      })
      const data = await res.json()
      const reply = data.reply || 'Что-то пошло не так.'
      const aiMsg: Message = { role: 'assistant', content: reply }
      const updated = [...newMessages, aiMsg]
      setMessages(updated)

      const layer = detectLayer(reply)
      if (layer !== null) {
        setCurrentLayer(layer)
        if (sessionId) {
          await supabase.from('sessions').update({ current_layer: layer }).eq('id', sessionId)
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Ошибка соединения. Попробуй ещё раз.' }])
    }
    setLoading(false)
  }

  async function startNewSession(userId: string) {
    if (creatingRef.current) return
    creatingRef.current = true
    const { data: newSess } = await supabase
      .from('sessions')
      .insert({ user_id: userId, messages: [], completed: false, current_layer: 0 })
      .select('id')
      .single()
    creatingRef.current = false
    if (newSess?.id) router.replace(`/chat?session=${newSess.id}`)
  }

  async function handleStartFresh() {
    const { data: authData } = await supabase.auth.getSession()
    if (!authData?.session) return
    // Clear messages on old session so it won't resurface in future resume checks
    if (resumeOption) {
      await supabase.from('sessions').update({ messages: [] }).eq('id', resumeOption.id)
    }
    setResumeOption(null)
    await startNewSession(authData.session.user.id)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  function autoResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
  }

  const canSend = !loading && input.trim().length > 0

  if (!sessionId && !resumeOption) return (
    <div style={{ minHeight: '100dvh', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.08)', borderTop: `2px solid ${s.energy}`, animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100dvh',
      background: s.bg, color: s.text,
      fontFamily: "'DM Sans',-apple-system,sans-serif", fontWeight: 300,
    }}>
      <style>{`
        @keyframes td   { 0%,60%,100%{transform:translateY(0);opacity:0.35} 30%{transform:translateY(-5px);opacity:1} }
        @keyframes orbFloat { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(10px,-8px) scale(1.06)} }
        @keyframes fadeUp   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        textarea::placeholder { color: rgba(255,255,255,0.25) }
        textarea:focus { outline: none }
        .msg-scroll::-webkit-scrollbar { width: 3px }
        .msg-scroll::-webkit-scrollbar-track { background: transparent }
        .msg-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 999px }
      `}</style>

      {/* ── Resume modal ── */}
      {resumeOption && (
        <div style={{ position:'fixed', inset:0, background:'rgba(7,9,13,0.94)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{
            background:'linear-gradient(155deg,rgba(255,255,255,0.09) 0%,rgba(255,255,255,0.03) 100%)',
            backdropFilter:'blur(40px)', WebkitBackdropFilter:'blur(40px)',
            border:'1px solid rgba(255,255,255,0.09)',
            borderRadius:32, padding:'32px 24px', maxWidth:400, width:'100%',
            boxShadow:'0 24px 80px rgba(0,0,0,0.6)',
          }}>
            <div style={{ fontSize:32, textAlign:'center', marginBottom:16 }}>◔</div>
            <div style={{ fontSize:17, fontWeight:600, color:s.text, marginBottom:10, textAlign:'center' }}>
              Незавершённый разговор
            </div>
            <div style={{ fontSize:14, color:s.dim, lineHeight:1.8, marginBottom:28, textAlign:'center' }}>
              Есть разговор от {new Date(resumeOption.updatedAt).toLocaleDateString('ru', { day:'numeric', month:'long' })}.{'\n'}
              Продолжить с того места или начать заново?
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <button
                onClick={() => { router.replace(`/chat?session=${resumeOption.id}`); setResumeOption(null) }}
                style={{
                  width:'100%', padding:'14px', borderRadius:999, border:'none', cursor:'pointer',
                  background:`linear-gradient(135deg,${s.energy} 0%,${s.mindfulness} 100%)`,
                  color:'#07090D', fontSize:15, fontWeight:600, fontFamily:"'DM Sans',sans-serif",
                  boxShadow:`0 0 32px ${s.energy}40`,
                }}
              >Продолжить →</button>
              <button
                onClick={handleStartFresh}
                style={{
                  width:'100%', padding:'14px', borderRadius:999, cursor:'pointer',
                  background:'transparent', border:'1px solid rgba(255,255,255,0.12)',
                  color:s.dim, fontSize:14, fontFamily:"'DM Sans',sans-serif",
                }}
              >Начать заново</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header style={{
        padding: '14px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(7,9,13,0.85)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0, position: 'relative', zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, color: s.text, opacity: 0.9 }}>Life OS</span>
          <span style={{ fontSize: 10, color: s.muted, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Диагностика</span>
        </div>

        {/* Layer progress dots */}
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {LAYERS.map((l, i) => (
            <div
              key={l.id}
              title={l.label}
              style={{
                width: i === currentLayer ? 18 : 5,
                height: 5, borderRadius: 999,
                background: i < currentLayer
                  ? s.recovery
                  : i === currentLayer
                    ? s.energy
                    : 'rgba(255,255,255,0.12)',
                transition: 'all 0.4s',
                boxShadow: i === currentLayer ? `0 0 8px ${s.energy}80` : 'none',
              }}
            />
          ))}
        </div>
      </header>

      {/* ── Messages ── */}
      <div
        className="msg-scroll"
        style={{ flex: 1, overflowY: 'auto', padding: '24px 16px 8px', display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <div style={{ maxWidth: 560, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {messages.map((msg, i) => {
            const hasMap = msg.role === 'assistant' && msg.content.includes('[STATE_MAP_START]')
            const preText = hasMap ? msg.content.split('[STATE_MAP_START]')[0].trim() : msg.content
            const mapRaw = hasMap
              ? (msg.content.split('[STATE_MAP_START]')[1]?.split('[STATE_MAP_END]')[0]?.trim() ?? '')
              : ''

            const isUser = msg.role === 'user'

            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  flexDirection: isUser ? 'row-reverse' : 'row',
                  gap: 10,
                  animation: 'fadeUp 0.25s ease forwards',
                }}
              >
                {/* Avatar dot */}
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 600,
                  background: isUser
                    ? `linear-gradient(135deg,${s.energy},${s.mindfulness})`
                    : 'rgba(255,255,255,0.07)',
                  border: isUser ? 'none' : '1px solid rgba(255,255,255,0.1)',
                  color: isUser ? '#07090D' : s.muted,
                }}>
                  {isUser ? 'Я' : '✦'}
                </div>

                <div style={{ maxWidth: 'calc(100% - 80px)', display: 'flex', flexDirection: 'column', gap: 8, alignItems: isUser ? 'flex-end' : 'flex-start' }}>
                  {preText && (
                    <div style={{
                      padding: '11px 15px',
                      borderRadius: isUser ? '18px 4px 18px 18px' : '4px 18px 18px 18px',
                      background: isUser
                        ? `linear-gradient(135deg,${s.energy}22,${s.mindfulness}18)`
                        : 'linear-gradient(155deg,rgba(255,255,255,0.075) 0%,rgba(255,255,255,0.03) 100%)',
                      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                      border: isUser
                        ? `1px solid ${s.energy}30`
                        : '1px solid rgba(255,255,255,0.08)',
                      fontSize: 14, lineHeight: 1.75,
                      whiteSpace: 'pre-wrap',
                      color: isUser ? s.text : s.dim,
                      boxShadow: isUser
                        ? `0 4px 24px ${s.energy}12`
                        : '0 4px 20px rgba(0,0,0,0.2)',
                    }}>
                      {preText}
                    </div>
                  )}

                  {hasMap && mapRaw && (
                    <StateMapCard raw={mapRaw} sessionId={sessionId} />
                  )}
                </div>
              </div>
            )
          })}

          {/* Typing indicator */}
          {loading && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, color: s.muted, flexShrink: 0,
              }}>✦</div>
              <div style={{
                background: 'linear-gradient(155deg,rgba(255,255,255,0.07) 0%,rgba(255,255,255,0.025) 100%)',
                backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '4px 18px 18px 18px',
                padding: '13px 16px', display: 'flex', gap: 5, alignItems: 'center',
              }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: s.energy, opacity: 0.6,
                    animation: `td 1.3s infinite ${i * 0.15}s`,
                  }} />
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Input bar ── */}
      <div style={{
        padding: '12px 16px 20px',
        background: 'rgba(7,9,13,0.92)',
        backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
      }}>
        <div style={{
          maxWidth: 560, margin: '0 auto',
          display: 'flex', gap: 8, alignItems: 'flex-end',
        }}>
          {/* Textarea wrapper */}
          <div style={{
            flex: 1,
            background: 'linear-gradient(155deg,rgba(255,255,255,0.07) 0%,rgba(255,255,255,0.025) 100%)',
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: `1px solid ${input.trim() ? `${s.energy}35` : 'rgba(255,255,255,0.09)'}`,
            borderRadius: 18, display: 'flex', alignItems: 'flex-end',
            transition: 'border-color 0.2s',
            boxShadow: input.trim() ? `0 0 24px ${s.energy}12` : 'none',
          }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={autoResize}
              onKeyDown={handleKey}
              placeholder="Напиши свой ответ..."
              rows={1}
              style={{
                flex: 1, background: 'transparent', border: 'none',
                color: s.text, fontFamily: "'DM Sans',sans-serif",
                fontSize: 14, fontWeight: 300, lineHeight: 1.6,
                padding: '12px 14px', resize: 'none',
                maxHeight: 160, overflowY: 'auto',
              }}
            />
            {/* Send button */}
            <button
              onClick={send}
              disabled={!canSend}
              style={{
                width: 34, height: 34, margin: '7px 7px',
                borderRadius: 12, border: 'none', flexShrink: 0,
                background: canSend
                  ? `linear-gradient(135deg,${s.energy},${s.mindfulness})`
                  : 'rgba(255,255,255,0.06)',
                cursor: canSend ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s',
                boxShadow: canSend ? `0 0 16px ${s.energy}50` : 'none',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill={canSend ? '#07090D' : 'rgba(255,255,255,0.2)'}>
                <path d="M2 21L23 12 2 3v7l15 2-15 2v7z"/>
              </svg>
            </button>
          </div>

          {/* Voice button */}
          <VoiceButton
            size={48}
            onResult={text => {
              setInput(prev => (prev + ' ' + text).trim())
              if (textareaRef.current) {
                textareaRef.current.style.height = 'auto'
                textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px'
              }
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatContent />
    </Suspense>
  )
}
