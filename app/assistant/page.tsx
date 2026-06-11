// @ts-nocheck
'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const s = {
  bg:'#0d0d0f', surface:'#141416', surface2:'#1a1a1e',
  border:'rgba(255,255,255,0.07)', border2:'rgba(255,255,255,0.12)',
  text:'#e8e6e0', dim:'#7a7870', muted:'#3d3d3d', accent:'#c8b89a',
  green:'#7ab87a', red:'#e07070', info:'#6ea8c8', purple:'#a86ec8',
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
    <div style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 10px', borderRadius:100, background:`${color}15`, border:`1px solid ${color}30`, fontSize:11, color }}>
      {label}
    </div>
  )
}

function RecommendationCard({ rec }) {
  const layerColors = ['','#1D9E75','#378ADD','#D4537E','#BA7517','#7F77DD','#D85A30','#888780']
  const priorityColor = { high: s.red, medium: s.accent, low: s.dim }
  const color = rec.layer ? layerColors[rec.layer] : s.accent
  return (
    <div style={{ marginTop:10, padding:'12px 14px', borderRadius:12, background:`${color}10`, border:`1px solid ${color}25` }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
        <div style={{ width:6, height:6, borderRadius:'50%', background:color, flexShrink:0 }} />
        <span style={{ fontSize:13, fontWeight:500, color:s.text }}>{rec.title}</span>
        <span style={{ marginLeft:'auto', fontSize:11, color: priorityColor[rec.priority] || s.dim }}>{rec.priority}</span>
      </div>
      <div style={{ fontSize:13, color:s.dim, lineHeight:1.7 }}>{rec.body}</div>
      {rec.layer && (
        <div style={{ marginTop:8, fontSize:11, color }}>Layer {rec.layer}</div>
      )}
    </div>
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

    const userMsg = { role: 'user', content: msg }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)

    try {
      // История без первого системного обмена (он добавляется в route)
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
      setMessages(prev => [...prev, { role: 'assistant', content: 'Ошибка соединения. Попробуй ещё раз.' }])
    }
    setSending(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', background:s.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ fontSize:14, color:s.dim }}>Загружаем...</div>
    </div>
  )

  const isEmptyChat = messages.length === 0

  return (
    <div style={{ minHeight:'100vh', background:s.bg, color:s.text, fontFamily:"'DM Sans',sans-serif", fontWeight:300, display:'flex', flexDirection:'column' }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
        @keyframes pulse { 0%,100% { opacity:0.4 } 50% { opacity:1 } }
        textarea:focus { outline:none; }
        textarea { resize:none; }
      `}</style>

      {/* Header */}
      <header style={{ padding:'14px 20px', borderBottom:`1px solid ${s.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <button onClick={() => router.push('/dashboard')} style={{ fontSize:13, color:s.dim, background:'none', border:'none', cursor:'pointer' }}>← Dashboard</button>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
          <span style={{ fontFamily:"'Playfair Display',serif", fontSize:16, color:s.accent }}>Ассистент</span>
          {contextSummary && (
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'center' }}>
              {contextSummary.has_state_map && <ContextBadge label="State Map" color={s.accent} />}
              {contextSummary.active_sprints > 0 && <ContextBadge label={`${contextSummary.active_sprints} спринт`} color={s.green} />}
              {contextSummary.biomarkers_count > 0 && <ContextBadge label={`${contextSummary.biomarkers_count} биомаркеров`} color={s.info} />}
              {contextSummary.danger_biomarkers?.length > 0 && (
                <ContextBadge label={`⚠ ${contextSummary.danger_biomarkers.join(', ')}`} color={s.red} />
              )}
            </div>
          )}
        </div>
        <div style={{ width:60 }} />
      </header>

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'20px 16px', display:'flex', flexDirection:'column', gap:16 }}>

        {isEmptyChat && (
          <div style={{ animation:'fadeUp 0.4s forwards' }}>
            <div style={{ textAlign:'center', padding:'32px 20px 24px' }}>
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:22, color:s.accent, marginBottom:8 }}>Что хочешь исследовать?</div>
              <div style={{ fontSize:13, color:s.dim, lineHeight:1.7 }}>
                Я вижу твою State Map, биомаркеры, чекины и спринты.<br/>
                Могу найти связи между ними и предложить фокус.
              </div>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:8, maxWidth:480, margin:'0 auto' }}>
              {STARTER_PROMPTS.map((p, i) => (
                <button key={i} onClick={() => send(p)} style={{ padding:'12px 16px', borderRadius:12, background:s.surface, border:`1px solid ${s.border}`, color:s.dim, fontSize:13, textAlign:'left', cursor:'pointer', transition:'all 0.15s', lineHeight:1.5 }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = s.border2; e.currentTarget.style.color = s.text }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = s.border; e.currentTarget.style.color = s.dim }}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{ display:'flex', flexDirection:'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', animation:'fadeUp 0.3s forwards' }}>
            <div style={{
              maxWidth: msg.role === 'user' ? '80%' : '100%',
              padding: msg.role === 'user' ? '10px 14px' : '14px 16px',
              borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
              background: msg.role === 'user' ? 'rgba(200,184,154,0.12)' : s.surface,
              border: `1px solid ${msg.role === 'user' ? 'rgba(200,184,154,0.2)' : s.border}`,
              fontSize:14, lineHeight:1.75, color: msg.role === 'user' ? s.accent : s.text,
              whiteSpace:'pre-wrap',
            }}>
              {msg.content}
            </div>
            {msg.recommendations?.length > 0 && (
              <div style={{ width:'100%', marginTop:4 }}>
                {msg.recommendations.map((rec, j) => (
                  <RecommendationCard key={j} rec={rec} />
                ))}
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 16px', borderRadius:'4px 16px 16px 16px', background:s.surface, border:`1px solid ${s.border}`, maxWidth:120 }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ width:6, height:6, borderRadius:'50%', background:s.dim, animation:`pulse 1.2s ease-in-out ${i*0.2}s infinite` }} />
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ flexShrink:0, padding:'12px 16px 20px', borderTop:`1px solid ${s.border}`, background:s.bg }}>
        <div style={{ maxWidth:640, margin:'0 auto', display:'flex', gap:10, alignItems:'flex-end', background:s.surface, border:`1px solid ${s.border2}`, borderRadius:16, padding:'10px 10px 10px 16px' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Спроси о своём состоянии, анализах, паттернах..."
            rows={1}
            style={{ flex:1, background:'transparent', border:'none', color:s.text, fontSize:14, fontFamily:"'DM Sans',sans-serif", fontWeight:300, lineHeight:1.6, maxHeight:120, overflowY:'auto' }}
            onInput={e => {
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || sending}
            style={{ width:36, height:36, borderRadius:10, background: input.trim() && !sending ? s.accent : s.muted, border:'none', cursor: input.trim() && !sending ? 'pointer' : 'default', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'background 0.2s' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={s.bg} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
            </svg>
          </button>
        </div>
        <div style={{ textAlign:'center', fontSize:11, color:s.muted, marginTop:8 }}>
          Enter — отправить · Shift+Enter — перенос строки
        </div>
      </div>
    </div>
  )
}

export default function AssistantPage() {
  return <Suspense><AssistantContent /></Suspense>
}
