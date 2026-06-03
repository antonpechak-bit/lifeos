// @ts-nocheck
'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { VoiceButton } from '@/lib/VoiceButton'

const LAYER_COLORS = {
  sleep: '#6ea8c8', ans: '#a86ec8', movement: '#c8a86e',
  nutrition: '#7ab87a', connection: '#c86e6e', attention: '#6ec8a8', values: '#c8c86e'
}

const LAYER_LABELS = {
  sleep: 'Сон', ans: 'Нервная система', movement: 'Движение',
  nutrition: 'Питание', connection: 'Связь', attention: 'Внимание', values: 'Ценности'
}

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

  // Chat state
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

    // Opening message
    const layerKey = guessLayer(pri.name)
    const opening = `Хорошо, давай разберём «${pri.name}» подробнее.\n\n${pri.why}\n\nЧтобы предложить тебе подходящий шаг — пару вопросов:\n\nЧто сейчас происходит с ${LAYER_LABELS[layerKey] || pri.name.toLowerCase()}? Как это выглядит в твоей реальной жизни прямо сейчас?`

    setMessages([{ role: 'assistant', content: opening }])
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

  async function sendMessage() {
    if (!input.trim() || chatLoading) return
    const userMsg = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    if (taRef.current) taRef.current.style.height = 'auto'
    setChatLoading(true)

    try {
      const res = await fetch('/api/sprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          stateMap: session?.state_map,
          priority: activePri ? `${activePri.name}: ${activePri.why}` : '',
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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 14, color: 'var(--text-dim,#7a7870)' }}>Загружаем...</div>
    </div>
  )

  const activeSprints = sprints.filter(s => s.status === 'active')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Header */}
      <header style={{ padding: '14px 24px', borderBottom: '1px solid var(--border,rgba(255,255,255,0.07))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.push('/dashboard')} style={{ fontSize: 13, color: 'var(--text-dim,#7a7870)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            ← Dashboard
          </button>
          <span style={{ fontSize: 11, color: 'var(--text-muted,#3d3d3d)' }}>|</span>
          <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: 'var(--accent,#c8b89a)' }}>Карта приоритетов</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim,#7a7870)' }}>
          {new Date(session?.created_at).toLocaleDateString('ru', { day: 'numeric', month: 'long' })}
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left panel */}
        <div style={{ width: activePri ? '380px' : '100%', flexShrink: 0, borderRight: activePri ? '1px solid var(--border,rgba(255,255,255,0.07))' : 'none', overflowY: 'auto', padding: '24px', transition: 'width 0.3s' }}>

          {/* Overview */}
          {parsed?.overview && (
            <div style={{ background: 'var(--surface,#141416)', border: '1px solid rgba(200,184,154,0.15)', borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim,#7a7870)', marginBottom: 8 }}>Общая картина</div>
              <div style={{ fontSize: 13, color: 'var(--text,#e8e6e0)', lineHeight: 1.75 }}>{parsed.overview}</div>
            </div>
          )}

          {/* Priorities */}
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted,#3d3d3d)', marginBottom: 12 }}>Три приоритета</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {parsed?.priorities?.map((pri, idx) => {
              const layerKey = guessLayer(pri.name)
              const color = LAYER_COLORS[layerKey] || '#888'
              const isActive = activePri?.n === pri.n
              const hasSprint = sprints.some(s => s.layer === layerKey && s.status === 'active')

              return (
                <div key={idx}
                  onClick={() => selectPriority(pri, idx)}
                  style={{ background: isActive ? 'var(--surface2,#1a1a1e)' : 'var(--surface,#141416)', border: isActive ? `2px solid ${color}` : '1px solid var(--border,rgba(255,255,255,0.07))', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.2s', animation: 'fadeIn 0.3s forwards' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <div style={{ fontSize: 10, color: 'var(--text-dim,#7a7870)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Приоритет {pri.n}</div>
                    {hasSprint && <div style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(122,184,122,0.15)', color: '#7ab87a' }}>Спринт активен</div>}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text,#e8e6e0)', marginBottom: 6 }}>{pri.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim,#7a7870)', lineHeight: 1.6, marginBottom: hasSprint ? 0 : 8 }}>{pri.why}</div>
                  {!hasSprint && (
                    <div style={{ fontSize: 12, color: color, display: 'flex', alignItems: 'center', gap: 5 }}>
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
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted,#3d3d3d)', marginBottom: 12 }}>Активные спринты</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeSprints.map(sprint => (
                  <div key={sprint.id} style={{ background: 'var(--surface,#141416)', border: '1px solid var(--border,rgba(255,255,255,0.07))', borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text,#e8e6e0)' }}>{sprint.behavior_name}</div>
                      <div style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(110,168,200,0.15)', color: '#6ea8c8' }}>{LAYER_LABELS[sprint.layer] || sprint.layer}</div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim,#7a7870)' }}>⚓ {sprint.anchor}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right panel — chat */}
        {activePri && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'fadeIn 0.3s forwards' }}>

            {/* Chat header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border,rgba(255,255,255,0.07))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: LAYER_COLORS[guessLayer(activePri.name)] || '#888' }} />
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text,#e8e6e0)' }}>{activePri.name}</span>
              </div>
              <button onClick={() => setActivePri(null)} style={{ fontSize: 18, color: 'var(--text-dim,#7a7870)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {messages.map((msg, i) => {
                const hasSprint = msg.role === 'assistant' && msg.content.includes('[SPRINT_START]')
                const text = hasSprint ? msg.content.split('[SPRINT_START]')[0].trim() : msg.content
                const sprintRaw = hasSprint ? msg.content.split('[SPRINT_START]')[1]?.split('[SPRINT_END]')[0]?.trim() : ''

                const getField = (key) => sprintRaw?.split('\n').find(l => l.startsWith(key + ':'))?.slice(key.length + 1).trim() || ''

                return (
                  <div key={i} style={{ display: 'flex', gap: 10, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', animation: 'fadeIn 0.25s forwards', opacity: 0 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 500, marginTop: 2, background: msg.role === 'assistant' ? 'var(--surface2,#1a1a1e)' : 'rgba(110,168,200,0.15)', border: `1px solid ${msg.role === 'assistant' ? 'rgba(255,255,255,0.07)' : 'rgba(110,168,200,0.25)'}`, color: msg.role === 'assistant' ? 'var(--text-dim,#7a7870)' : '#6ea8c8' }}>
                      {msg.role === 'assistant' ? 'L' : 'Я'}
                    </div>
                    <div style={{ maxWidth: 480 }}>
                      {text && (
                        <div style={{ padding: '10px 14px', borderRadius: msg.role === 'assistant' ? '4px 12px 12px 12px' : '12px 4px 12px 12px', background: msg.role === 'assistant' ? 'var(--surface,#141416)' : 'rgba(110,168,200,0.12)', border: `1px solid ${msg.role === 'assistant' ? 'rgba(255,255,255,0.07)' : 'rgba(110,168,200,0.2)'}`, fontSize: 13, lineHeight: 1.75, whiteSpace: 'pre-wrap', color: msg.role === 'assistant' ? 'var(--text,#e8e6e0)' : '#6ea8c8', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                          {text}
                        </div>
                      )}
                      {hasSprint && sprintRaw && (
                        <div style={{ marginTop: 10, background: 'rgba(122,184,122,0.08)', border: '1px solid rgba(122,184,122,0.25)', borderRadius: 12, padding: '14px 16px' }}>
                          <div style={{ fontSize: 11, color: '#7ab87a', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>✓ Спринт записан</div>
                          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text,#e8e6e0)', marginBottom: 6 }}>{getField('NAME')}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-dim,#7a7870)', marginBottom: 4 }}>{getField('DESCRIPTION')}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted,#3d3d3d)' }}>⚓ {getField('ANCHOR')} · {getField('DAYS')} дней</div>
                          <button onClick={() => router.push('/dashboard')} style={{ marginTop: 12, width: '100%', padding: '8px', borderRadius: 8, background: '#7ab87a', color: '#0d0d0f', border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
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
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--surface2,#1a1a1e)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-dim,#7a7870)' }}>L</div>
                  <div style={{ background: 'var(--surface,#141416)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '4px 12px 12px 12px', padding: '10px 14px', display: 'flex', gap: 4 }}>
                    {[0, 1, 2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--text-dim,#7a7870)', animation: `td 1.3s infinite ${i * 0.15}s` }} />)}
                  </div>
                  <style>{`@keyframes td{0%,60%,100%{transform:translateY(0);opacity:0.4}30%{transform:translateY(-4px);opacity:1}}`}</style>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border,rgba(255,255,255,0.07))', display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
              <div style={{ flex: 1, background: 'var(--surface,#141416)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, display: 'flex', alignItems: 'flex-end' }}>
                <textarea
                  ref={taRef}
                  value={input}
                  onChange={autoResize}
                  onKeyDown={handleKey}
                  placeholder="Напиши ответ..."
                  rows={1}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text,#e8e6e0)', fontFamily: "'DM Sans',sans-serif", fontSize: 13, lineHeight: 1.5, padding: '10px 12px', resize: 'none', maxHeight: 120, overflowY: 'auto' }}
                />
                <div style={{ margin:'5px 0 5px 5px' }}>
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
                  style={{ width:32, height:32, margin:'5px 5px 5px 0', borderRadius:8, background:chatLoading||!input.trim()?'var(--surface2,#1a1a1e)':'var(--accent,#c8b89a)', border:'none', cursor:chatLoading||!input.trim()?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill={chatLoading||!input.trim()?'#444':'#0d0d0f'}><path d="M2 21L23 12 2 3v7l15 2-15 2v7z"/></svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function PrioritiesPage() {
  return <Suspense><PrioritiesContent /></Suspense>
}

