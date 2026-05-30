// @ts-nocheck
'use client'
import { useEffect, useRef, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase, Message } from '@/lib/supabase'
import { LAYERS, OPENING_MESSAGE } from '@/lib/prompts'

function detectLayer(text) {
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

function parseStateMap(raw) {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
  const sections = {}
  const priorities = []
  let nextStep = ''
  let curKey = ''
  let curVal = ''

  const secKeys = {
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

function StateMapCard({ raw }) {
  const { sections, priorities, nextStep } = parseStateMap(raw)

  const sectionList = [
    { key: 'overview', label: 'Общая картина' },
    { key: 'working', label: 'Что работает ✓' },
    { key: 'attention', label: 'Что требует внимания ◎' },
    { key: 'blind', label: 'Слепые пятна ?' },
    { key: 'therapist', label: 'Для терапевта 🔍' },
  ]

  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--accent-border)', borderRadius:16, padding:24, maxWidth:560, fontSize:13, lineHeight:1.8 }}>
      <div style={{ fontFamily:"'Playfair Display', serif", fontSize:16, color:'var(--accent)', marginBottom:16, paddingBottom:14, borderBottom:'1px solid var(--border)' }}>
        🧬 State Map — {new Date().toLocaleDateString('ru', { day:'numeric', month:'long', year:'numeric' })}
      </div>
      {sectionList.map(({ key, label }) => sections[key] ? (
        <div key={key} style={{ marginBottom:16 }}>
          <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'0.12em', color:'var(--text-dim)', marginBottom:6 }}>{label}</div>
          <div style={{ color:'var(--text)', whiteSpace:'pre-wrap' }}>
            {sections[key].split('•').filter(Boolean).map((item, i) => (
              <div key={i} style={{ display:'flex', gap:8, marginBottom:3 }}>
                {(i > 0 || sections[key].startsWith('•')) && <span style={{ color:'var(--accent)', flexShrink:0 }}>•</span>}
                <span>{item.trim()}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null)}
      {priorities.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'0.12em', color:'var(--text-dim)', marginBottom:10 }}>Фокус на 2–3 месяца</div>
          {priorities.map(p => (
            <div key={p.n} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px', marginBottom:8 }}>
              <div style={{ fontSize:10, color:'var(--accent)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:4 }}>Приоритет {p.n}</div>
              <div style={{ fontWeight:500, color:'var(--text)', marginBottom:4 }}>{p.name}</div>
              {p.why && <div style={{ fontSize:12, color:'var(--text-dim)', marginBottom:4 }}>{p.why}</div>}
              {p.step && <div style={{ fontSize:12, color:'var(--text-dim)' }}>→ {p.step}</div>}
            </div>
          ))}
        </div>
      )}
      {nextStep && (
        <div style={{ background:'var(--accent-dim)', border:'1px solid var(--accent-border)', borderRadius:10, padding:'12px 14px', fontSize:13, color:'var(--accent)' }}>
          → {nextStep}
        </div>
      )}
    </div>
  )
}

function ChatContent() {
  const params = useSearchParams()
  const sessionId = params.get('session')
  const [messages, setMessages] = useState([{ role: 'assistant', content: OPENING_MESSAGE }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [currentLayer, setCurrentLayer] = useState(0)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)

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
    const userMsg = { role: 'user', content: input.trim() }
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
      const updated = [...newMessages, { role: 'assistant', content: reply }]
      setMessages(updated)
      const layer = detectLayer(reply)
      if (layer !== null) {
        setCurrentLayer(layer)
        if (sessionId) await supabase.from('sessions').update({ current_layer: layer }).eq('id', sessionId)
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Ошибка соединения. Попробуй ещё раз.' }])
    }
    setLoading(false)
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  function autoResize(e) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
  }

  return (
    <div style={{ display:'flex', height:'100vh', flexDirection:'column' }}>
      <header style={{ padding:'16px 24px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:10 }}>
          <span style={{ fontFamily:"'Playfair Display', serif", fontSize:18, color:'var(--accent)' }}>Life OS</span>
          <span style={{ fontSize:11, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em' }}>Диагностика</span>
        </div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {LAYERS.map((l, i) => (
            <div key={l.id} style={{ width:i===currentLayer?20:6, height:6, borderRadius:3, background:i<currentLayer?'var(--accent)':i===currentLayer?l.color:'var(--surface2)', transition:'all 0.4s', opacity:i>currentLayer?0.3:1 }} title={l.label} />
          ))}
        </div>
      </header>

      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        <aside style={{ width:200, borderRight:'1px solid var(--border)', padding:'20px 12px', display:'flex', flexDirection:'column', gap:2, background:'var(--surface)', flexShrink:0, overflowY:'auto' }}>
          <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--text-muted)', padding:'0 8px', marginBottom:10 }}>Слои</div>
          {LAYERS.map((l, i) => (
            <div key={l.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', borderRadius:8, fontSize:12, background:i===currentLayer?'var(--accent-dim)':'transparent', border:i===currentLayer?'1px solid var(--accent-border)':'1px solid transparent', color:i<currentLayer?'var(--text-muted)':i===currentLayer?'var(--text)':'var(--text-dim)', transition:'all 0.2s' }}>
              <div style={{ width:7, height:7, borderRadius:'50%', flexShrink:0, background:i<currentLayer?'var(--green)':l.color, opacity:i<currentLayer?1:i===currentLayer?1:0.3 }} />
              <span style={{ flex:1, fontWeight:i===currentLayer?500:300 }}>{l.label}</span>
              {i < currentLayer && <span style={{ fontSize:10, color:'var(--green)' }}>✓</span>}
            </div>
          ))}
        </aside>

        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ flex:1, overflowY:'auto', padding:'28px 32px', display:'flex', flexDirection:'column', gap:20 }}>
            {messages.map((msg, i) => {
              const hasMap = msg.role === 'assistant' && msg.content.includes('[STATE_MAP_START]')
              const preText = hasMap ? msg.content.split('[STATE_MAP_START]')[0].trim() : msg.content
              const mapRaw = hasMap ? (msg.content.split('[STATE_MAP_START]')[1]?.split('[STATE_MAP_END]')[0]?.trim() ?? '') : ''
              return (
                <div key={i} style={{ display:'flex', gap:12, flexDirection:msg.role==='user'?'row-reverse':'row' }}>
                  <div style={{ width:30, height:30, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:500, marginTop:2, background:msg.role==='assistant'?'var(--surface2)':'var(--info)', border:`1px solid ${msg.role==='assistant'?'var(--border)':'var(--info-border)'}`, color:msg.role==='assistant'?'var(--text-dim)':'var(--info-text)' }}>
                    {msg.role === 'assistant' ? 'L' : 'Я'}
                  </div>
                  <div style={{ maxWidth:580 }}>
                    {preText && (
                      <div style={{ padding:'12px 16px', borderRadius:msg.role==='assistant'?'4px 14px 14px 14px':'14px 4px 14px 14px', background:msg.role==='assistant'?'var(--surface)':'var(--info)', border:`1px solid ${msg.role==='assistant'?'var(--border)':'var(--info-border)'}`, fontSize:14, lineHeight:1.75, whiteSpace:'pre-wrap', color:msg.role==='assistant'?'var(--text)':'var(--info-text)', textAlign:msg.role==='user'?'right':'left' }}>
                        {preText}
                      </div>
                    )}
                    {hasMap && mapRaw && <div style={{ marginTop:preText?12:0 }}><StateMapCard raw={mapRaw} /></div>}
                  </div>
                </div>
              )
            })}
            {loading && (
              <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                <div style={{ width:30, height:30, borderRadius:'50%', background:'var(--surface2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:'var(--text-dim)' }}>L</div>
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'4px 14px 14px 14px', padding:'12px 16px', display:'flex', gap:5 }}>
                  {[0,1,2].map(i => <div key={i} style={{ width:6, height:6, borderRadius:'50%', background:'var(--text-dim)', animation:`td 1.3s infinite ${i*0.15}s` }} />)}
                </div>
                <style>{`@keyframes td{0%,60%,100%{transform:translateY(0);opacity:0.4}30%{transform:translateY(-5px);opacity:1}}`}</style>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div style={{ padding:'16px 24px', borderTop:'1px solid var(--border)', display:'flex', gap:10, alignItems:'flex-end', background:'var(--bg)', flexShrink:0 }}>
            <div style={{ flex:1, background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:14, display:'flex', alignItems:'flex-end' }}>
              <textarea ref={textareaRef} value={input} onChange={autoResize} onKeyDown={handleKey} placeholder="Напиши свой ответ..." rows={1}
                style={{ flex:1, background:'transparent', border:'none', outline:'none', color:'var(--text)', fontFamily:"'DM Sans', sans-serif", fontSize:14, fontWeight:300, lineHeight:1.6, padding:'12px 14px', resize:'none', maxHeight:160, overflowY:'auto' }} />
              <button onClick={send} disabled={loading || !input.trim()}
                style={{ width:36, height:36, margin:6, borderRadius:10, background:loading||!input.trim()?'var(--surface2)':'var(--accent)', border:'none', cursor:loading||!input.trim()?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.2s', flexShrink:0 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill={loading||!input.trim()?'#444':'#0d0d0f'}><path d="M2 21L23 12 2 3v7l15 2-15 2v7z"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ChatPage() {
  return <Suspense><ChatContent /></Suspense>
}
