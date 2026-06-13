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
  values:      '#C89EFF',
}

const QUESTIONS = [
  'Если бы здоровье было стабильным и страх ниже — что было бы важнее всего?',
  'Каким человеком ты хочешь быть в отношениях с близкими?',
  'Что ты уважаешь в других — то, что замечаешь и в себе хочешь?',
  'Что делает жизнь осмысленной для тебя?',
]

const LAYER_LABEL = { 5: 'Ценности', 6: 'Смысл' }
const LAYER_COLOR = { 5: '#B18DFF', 6: '#52FF9A' }

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

function ValueCard({ value }) {
  const scoreColor = value.alignment_score == null ? s.muted
    : value.alignment_score >= 70 ? s.recovery
    : value.alignment_score >= 40 ? s.stress
    : s.overload
  const layerColor = LAYER_COLOR[value.layer] || s.values

  return (
    <div style={{
      background: `linear-gradient(155deg,${layerColor}10 0%,rgba(255,255,255,0.02) 100%)`,
      border: `1px solid ${layerColor}22`,
      borderRadius: 24, padding: '18px 20px',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: `radial-gradient(circle,${layerColor}15 0%,transparent 65%)`, pointerEvents: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, position: 'relative' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: s.text }}>{value.value_name}</span>
            <span style={{ fontSize: 10, color: layerColor, background: `${layerColor}15`, border: `1px solid ${layerColor}25`, borderRadius: 999, padding: '2px 8px' }}>
              {LAYER_LABEL[value.layer] || `Слой ${value.layer}`}
            </span>
          </div>
          {value.operationalization && (
            <div style={{ fontSize: 12, color: s.muted, lineHeight: 1.6 }}>{value.operationalization}</div>
          )}
        </div>
        {value.alignment_score != null && (
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: scoreColor, lineHeight: 1 }}>{value.alignment_score}</div>
            <div style={{ fontSize: 9, color: s.muted, marginTop: 2 }}>%</div>
          </div>
        )}
      </div>
    </div>
  )
}

function ValuesContent() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [phase, setPhase] = useState('loading') // loading | has_values | intro | reflecting | ai_thinking | selecting | operationalizing | saving | done
  const [existingValues, setExistingValues] = useState([])

  // Reflection phase
  const [qIndex, setQIndex] = useState(0)
  const [answers, setAnswers] = useState([])
  const [currentAnswer, setCurrentAnswer] = useState('')
  const inputRef = useRef(null)

  // Selection phase
  const [proposedValues, setProposedValues] = useState([])
  const [reflection, setReflection] = useState('')
  const [selectedIndexes, setSelectedIndexes] = useState([])
  const [editedNames, setEditedNames] = useState({})
  const [customValue, setCustomValue] = useState('')

  // Operationalization phase
  const [opIndex, setOpIndex] = useState(0)
  const [opValues, setOpValues] = useState([]) // accepted values
  const [opSuggestions, setOpSuggestions] = useState({}) // { valueName: { suggestions, question } }
  const [opTexts, setOpTexts] = useState({}) // { valueName: string }
  const [opLoading, setOpLoading] = useState(false)

  const [saving, setSaving] = useState(false)
  const [token, setToken] = useState('')

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getSession()
      if (!data?.session) { router.push('/'); return }
      const u = data.session.user
      const t = data.session.access_token
      setUser(u)
      setToken(t)

      const res = await fetch(`/api/values?userId=${u.id}`, {
        headers: { Authorization: `Bearer ${t}` },
      })
      if (res.ok) {
        const { values } = await res.json()
        if (values && values.length > 0) {
          setExistingValues(values)
          setPhase('has_values')
        } else {
          setPhase('intro')
        }
      } else {
        setPhase('intro')
      }
    }
    init()
  }, [])

  async function submitAnswer() {
    const trimmed = currentAnswer.trim()
    if (!trimmed) return
    const newAnswers = [...answers, trimmed]
    setAnswers(newAnswers)
    setCurrentAnswer('')

    if (qIndex < QUESTIONS.length - 1) {
      setQIndex(qIndex + 1)
      setTimeout(() => inputRef.current?.focus(), 100)
    } else {
      // All questions answered — cluster
      await runClustering(newAnswers)
    }
  }

  async function runClustering(answersToCluster) {
    setPhase('ai_thinking')
    try {
      const res = await fetch('/api/values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'cluster', userId: user.id, responses: answersToCluster }),
      })
      if (res.ok) {
        const data = await res.json()
        setProposedValues(data.values || [])
        setReflection(data.reflection || '')
        setSelectedIndexes((data.values || []).map((_, i) => i))
        setPhase('selecting')
      } else {
        setPhase('reflecting')
      }
    } catch {
      setPhase('reflecting')
    }
  }

  async function proceedToOperationalize() {
    const accepted = proposedValues
      .filter((_, i) => selectedIndexes.includes(i))
      .map((v, i) => ({
        ...v,
        name: editedNames[i] || v.name,
      }))

    if (customValue.trim()) {
      accepted.push({ name: customValue.trim(), layer: 5 })
    }

    setOpValues(accepted)
    setOpIndex(0)
    setPhase('operationalizing')
    await loadOpSuggestions(accepted[0]?.name)
  }

  async function loadOpSuggestions(valueName) {
    if (!valueName) return
    setOpLoading(true)
    try {
      const res = await fetch('/api/values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'operationalize', userId: user.id, valueName, examples: opTexts[valueName] || '' }),
      })
      if (res.ok) {
        const data = await res.json()
        setOpSuggestions(prev => ({ ...prev, [valueName]: data }))
      }
    } finally {
      setOpLoading(false)
    }
  }

  async function nextOpStep() {
    const next = opIndex + 1
    if (next < opValues.length) {
      setOpIndex(next)
      const nextName = opValues[next]?.name
      if (nextName && !opSuggestions[nextName]) {
        await loadOpSuggestions(nextName)
      }
    } else {
      await saveValues()
    }
  }

  async function saveValues() {
    setSaving(true)
    setPhase('saving')
    const toSave = opValues.map(v => ({
      value_name: v.name,
      layer: v.layer || 5,
      operationalization: opTexts[v.name] || null,
    }))

    try {
      await fetch('/api/values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'save', userId: user.id, values: toSave }),
      })

      // Reload values
      const res = await fetch(`/api/values?userId=${user.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const { values } = await res.json()
        setExistingValues(values || [])
      }
      setPhase('done')
    } finally {
      setSaving(false)
    }
  }

  // ── Screens ─────────────────────────────────────────────────────

  if (phase === 'loading') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: s.bg }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.08)', borderTop: `2px solid ${s.values}`, animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: s.bg, color: s.text, fontFamily: "'DM Sans',-apple-system,sans-serif", fontWeight: 300, paddingBottom: 140 }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        @keyframes orbFloat { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(10px,-8px) scale(1.06)} }
        @keyframes glowPulse { 0%,100%{opacity:0.4} 50%{opacity:0.9} }
      `}</style>

      {/* Header */}
      <div style={{
        padding: '28px 24px 20px',
        background: 'linear-gradient(145deg,#0A0820 0%,#060D1C 60%,#0D0A24 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -40, right: -30, width: 200, height: 200, borderRadius: '50%', background: `radial-gradient(circle,${s.values}18 0%,transparent 65%)`, animation: 'orbFloat 9s ease-in-out infinite', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => router.push('/dashboard')} style={{ fontSize: 13, color: s.dim, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>← Назад</button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, color: s.text }}>Ценности</div>
            <div style={{ fontSize: 11, color: s.muted, marginTop: 2 }}>исследование смысла</div>
          </div>
          <div style={{ width: 50 }} />
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px 0' }}>

        {/* ── HAS VALUES ─────────────────────────────────────────── */}
        {phase === 'has_values' && (
          <div style={{ animation: 'fadeUp 0.4s forwards' }}>
            <div style={{ fontSize: 11, color: s.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
              Мои ценности
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
              {existingValues.map(v => <ValueCard key={v.id} value={v} />)}
            </div>
            <button onClick={() => { setPhase('intro'); setAnswers([]); setQIndex(0) }} style={{
              width: '100%', padding: '14px', borderRadius: 999,
              background: `linear-gradient(135deg,${s.values} 0%,${s.energy} 100%)`,
              color: '#07090D', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              boxShadow: `0 0 30px ${s.values}40`,
            }}>
              + Исследовать заново
            </button>
          </div>
        )}

        {/* ── INTRO ──────────────────────────────────────────────── */}
        {phase === 'intro' && (
          <div style={{ animation: 'fadeUp 0.4s forwards' }}>
            <div style={{
              background: `linear-gradient(155deg,${s.values}12 0%,rgba(255,255,255,0.02) 100%)`,
              border: `1px solid ${s.values}22`,
              borderRadius: 32, padding: '32px 24px',
              position: 'relative', overflow: 'hidden',
              marginBottom: 20,
            }}>
              <div style={{ position: 'absolute', bottom: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: `radial-gradient(circle,${s.values}18 0%,transparent 65%)`, animation: 'orbFloat 8s ease-in-out infinite', pointerEvents: 'none' }} />
              <div style={{ position: 'relative' }}>
                <div style={{ fontSize: 32, marginBottom: 16 }}>🧭</div>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 400, color: s.text, lineHeight: 1.3, marginBottom: 14 }}>
                  Что на самом деле важно?
                </div>
                <div style={{ fontSize: 14, color: s.dim, lineHeight: 1.8, marginBottom: 8 }}>
                  Этот разговор — пространство для исследования, а не тест. Я задам несколько вопросов, прослушаю ответы и предложу возможные ценности, которые звучат в твоих словах.
                </div>
                <div style={{ fontSize: 13, color: s.muted, lineHeight: 1.7 }}>
                  Ты решаешь, что принять и как это назвать.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {[
                { icon: '💬', text: '4 вопроса для рефлексии' },
                { icon: '🔍', text: 'AI замечает темы и предлагает варианты' },
                { icon: '✏️', text: 'Ты редактируешь, добавляешь, решаешь' },
              ].map(item => (
                <div key={item.icon} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16 }}>
                  <span style={{ fontSize: 16 }}>{item.icon}</span>
                  <span style={{ fontSize: 13, color: s.dim }}>{item.text}</span>
                </div>
              ))}
            </div>

            <button onClick={() => { setPhase('reflecting'); setTimeout(() => inputRef.current?.focus(), 200) }} style={{
              width: '100%', padding: '15px',
              background: `linear-gradient(135deg,${s.values} 0%,${s.energy} 100%)`,
              color: '#07090D', border: 'none', borderRadius: 999,
              fontSize: 15, fontWeight: 600, cursor: 'pointer',
              boxShadow: `0 0 40px ${s.values}50, 0 4px 24px ${s.values}30`,
            }}>
              Начать исследование →
            </button>
          </div>
        )}

        {/* ── REFLECTING ─────────────────────────────────────────── */}
        {phase === 'reflecting' && (
          <div style={{ animation: 'fadeUp 0.3s forwards' }}>
            {/* Progress */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
              {QUESTIONS.map((_, i) => (
                <div key={i} style={{
                  flex: 1, height: 3, borderRadius: 99,
                  background: i <= qIndex ? s.values : 'rgba(255,255,255,0.1)',
                  transition: 'background 0.3s',
                }} />
              ))}
            </div>

            {/* Past Q&As */}
            {answers.map((ans, i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <div style={{
                  background: `${s.values}12`, border: `1px solid ${s.values}20`,
                  borderRadius: '18px 18px 18px 4px', padding: '14px 18px',
                  fontSize: 14, color: s.dim, lineHeight: 1.7, marginBottom: 8,
                }}>
                  {QUESTIONS[i]}
                </div>
                <div style={{
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '18px 18px 4px 18px', padding: '12px 16px',
                  fontSize: 13, color: s.text, lineHeight: 1.6, marginLeft: 24,
                }}>
                  {ans}
                </div>
              </div>
            ))}

            {/* Current question */}
            {qIndex < QUESTIONS.length && (
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  background: `${s.values}12`, border: `1px solid ${s.values}28`,
                  borderRadius: '18px 18px 18px 4px', padding: '16px 18px',
                  fontSize: 14, color: s.dim, lineHeight: 1.75,
                  boxShadow: `0 0 24px ${s.values}12`,
                }}>
                  {QUESTIONS[qIndex]}
                </div>
              </div>
            )}

            {/* Input */}
            <div style={{
              background: 'rgba(255,255,255,0.05)', border: `1px solid ${s.values}30`,
              borderRadius: 20, padding: '4px 4px 4px 16px',
              display: 'flex', alignItems: 'flex-end', gap: 8,
            }}>
              <textarea
                ref={inputRef}
                value={currentAnswer}
                onChange={e => setCurrentAnswer(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAnswer() } }}
                placeholder="Напиши, что приходит..."
                rows={2}
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  color: s.text, fontSize: 14, fontFamily: "'DM Sans',sans-serif",
                  fontWeight: 300, resize: 'none', padding: '12px 0 8px',
                  lineHeight: 1.6,
                }}
              />
              <button
                onClick={submitAnswer}
                disabled={!currentAnswer.trim()}
                style={{
                  flexShrink: 0, width: 44, height: 44, borderRadius: 14,
                  background: currentAnswer.trim() ? s.values : 'rgba(255,255,255,0.08)',
                  border: 'none', cursor: currentAnswer.trim() ? 'pointer' : 'default',
                  color: currentAnswer.trim() ? '#07090D' : s.muted,
                  fontSize: 18, fontWeight: 700, transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 4,
                }}
              >
                →
              </button>
            </div>
            <div style={{ fontSize: 11, color: s.muted, textAlign: 'center', marginTop: 10 }}>
              Enter — отправить · Shift+Enter — новая строка
            </div>
          </div>
        )}

        {/* ── AI THINKING ────────────────────────────────────────── */}
        {phase === 'ai_thinking' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 0', gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', border: `2px solid rgba(255,255,255,0.08)`, borderTop: `2px solid ${s.values}`, animation: 'spin 0.8s linear infinite' }} />
            <div style={{ fontSize: 14, color: s.muted }}>Замечаю темы в твоих словах...</div>
          </div>
        )}

        {/* ── SELECTING ──────────────────────────────────────────── */}
        {phase === 'selecting' && (
          <div style={{ animation: 'fadeUp 0.4s forwards' }}>
            {reflection && (
              <div style={{
                background: `${s.values}0E`, border: `1px solid ${s.values}22`,
                borderRadius: 20, padding: '16px 18px', marginBottom: 20,
                fontSize: 14, color: s.dim, lineHeight: 1.8,
              }}>
                {reflection}
              </div>
            )}

            <div style={{ fontSize: 11, color: s.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
              Возможные ценности — выбери, что резонирует
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {proposedValues.map((v, i) => {
                const isSelected = selectedIndexes.includes(i)
                const layerColor = LAYER_COLOR[v.layer] || s.values
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedIndexes(prev =>
                      prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
                    )}
                    style={{
                      width: '100%', textAlign: 'left', cursor: 'pointer',
                      background: isSelected ? `${layerColor}12` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isSelected ? layerColor + '40' : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: 20, padding: '14px 16px',
                      transition: 'all 0.15s',
                      boxShadow: isSelected ? `0 0 20px ${layerColor}20` : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                        background: isSelected ? layerColor : 'rgba(255,255,255,0.1)',
                        border: `1px solid ${isSelected ? layerColor : 'rgba(255,255,255,0.15)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, color: isSelected ? '#07090D' : s.muted,
                        transition: 'all 0.15s',
                      }}>
                        {isSelected ? '✓' : ''}
                      </div>
                      <input
                        value={editedNames[i] !== undefined ? editedNames[i] : v.name}
                        onChange={e => { e.stopPropagation(); setEditedNames(prev => ({ ...prev, [i]: e.target.value })) }}
                        onClick={e => e.stopPropagation()}
                        style={{
                          flex: 1, background: 'none', border: 'none', outline: 'none',
                          fontSize: 15, fontWeight: 600, color: s.text,
                          fontFamily: "'DM Sans',sans-serif",
                        }}
                      />
                      <span style={{ fontSize: 10, color: layerColor, background: `${layerColor}15`, border: `1px solid ${layerColor}25`, borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>
                        {LAYER_LABEL[v.layer] || `Слой ${v.layer}`}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: s.muted, lineHeight: 1.6, paddingLeft: 30 }}>
                      {v.rationale}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Custom value */}
            <div style={{
              display: 'flex', gap: 10, alignItems: 'center',
              background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.12)',
              borderRadius: 16, padding: '10px 14px', marginBottom: 20,
            }}>
              <span style={{ fontSize: 11, color: s.muted, flexShrink: 0 }}>+ добавить:</span>
              <input
                value={customValue}
                onChange={e => setCustomValue(e.target.value)}
                placeholder="Своя ценность..."
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  color: s.text, fontSize: 13, fontFamily: "'DM Sans',sans-serif",
                }}
              />
            </div>

            <button
              onClick={proceedToOperationalize}
              disabled={selectedIndexes.length === 0 && !customValue.trim()}
              style={{
                width: '100%', padding: '15px', borderRadius: 999, border: 'none',
                background: selectedIndexes.length > 0 || customValue.trim()
                  ? `linear-gradient(135deg,${s.values} 0%,${s.energy} 100%)`
                  : 'rgba(255,255,255,0.06)',
                color: selectedIndexes.length > 0 || customValue.trim() ? '#07090D' : s.muted,
                fontSize: 15, fontWeight: 600, cursor: 'pointer',
                boxShadow: selectedIndexes.length > 0 || customValue.trim() ? `0 0 40px ${s.values}50` : 'none',
              }}
            >
              Продолжить ({selectedIndexes.length + (customValue.trim() ? 1 : 0)} ценностей) →
            </button>
          </div>
        )}

        {/* ── OPERATIONALIZING ───────────────────────────────────── */}
        {phase === 'operationalizing' && opValues[opIndex] && (
          <div style={{ animation: 'fadeUp 0.3s forwards' }}>
            {/* Progress */}
            <div style={{ display: 'flex', gap: 5, marginBottom: 24 }}>
              {opValues.map((_, i) => (
                <div key={i} style={{
                  flex: 1, height: 3, borderRadius: 99,
                  background: i <= opIndex ? s.values : 'rgba(255,255,255,0.1)',
                  transition: 'background 0.3s',
                }} />
              ))}
            </div>

            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: s.muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Шаг {opIndex + 1} из {opValues.length}
              </span>
            </div>

            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, color: s.text, marginBottom: 4 }}>
              {opValues[opIndex].name}
            </div>
            <div style={{ fontSize: 13, color: s.muted, marginBottom: 20 }}>
              Как эта ценность выглядит в поведении?
            </div>

            {opLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px', marginBottom: 16 }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid rgba(255,255,255,0.08)`, borderTop: `2px solid ${s.values}`, animation: 'spin 0.8s linear infinite' }} />
                <span style={{ fontSize: 13, color: s.muted }}>Подбираю варианты...</span>
              </div>
            )}

            {opSuggestions[opValues[opIndex].name] && !opLoading && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: s.muted, marginBottom: 10 }}>
                  {opSuggestions[opValues[opIndex].name].question}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  {(opSuggestions[opValues[opIndex].name].suggestions || []).map((s_item, si) => (
                    <button
                      key={si}
                      onClick={() => {
                        const vName = opValues[opIndex].name
                        const cur = opTexts[vName] || ''
                        const alreadyIn = cur.includes(s_item)
                        setOpTexts(prev => ({ ...prev, [vName]: alreadyIn ? cur.replace(s_item + '\n', '').replace('\n' + s_item, '').replace(s_item, '').trim() : (cur ? cur + '\n' + s_item : s_item) }))
                      }}
                      style={{
                        width: '100%', textAlign: 'left', cursor: 'pointer',
                        background: (opTexts[opValues[opIndex].name] || '').includes(s_item) ? `${s.values}12` : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${(opTexts[opValues[opIndex].name] || '').includes(s_item) ? s.values + '40' : 'rgba(255,255,255,0.08)'}`,
                        borderRadius: 14, padding: '11px 14px',
                        fontSize: 13, color: s.dim, lineHeight: 1.5, transition: 'all 0.15s',
                      }}
                    >
                      {s_item}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: s.muted, marginBottom: 8 }}>Как это выглядит для тебя:</div>
              <textarea
                value={opTexts[opValues[opIndex].name] || ''}
                onChange={e => setOpTexts(prev => ({ ...prev, [opValues[opIndex].name]: e.target.value }))}
                placeholder="Конкретные проявления этой ценности в моей жизни..."
                rows={3}
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.05)', border: `1px solid ${s.values}25`,
                  borderRadius: 14, padding: '12px 14px',
                  color: s.text, fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 300,
                  outline: 'none', resize: 'none', boxSizing: 'border-box', lineHeight: 1.6,
                }}
              />
            </div>

            <button onClick={nextOpStep} style={{
              width: '100%', padding: '15px', borderRadius: 999, border: 'none',
              background: `linear-gradient(135deg,${s.values} 0%,${s.energy} 100%)`,
              color: '#07090D', fontSize: 15, fontWeight: 600, cursor: 'pointer',
              boxShadow: `0 0 40px ${s.values}50`,
            }}>
              {opIndex < opValues.length - 1 ? 'Следующая ценность →' : 'Сохранить →'}
            </button>
          </div>
        )}

        {/* ── SAVING ─────────────────────────────────────────────── */}
        {phase === 'saving' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 0', gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', border: `2px solid rgba(255,255,255,0.08)`, borderTop: `2px solid ${s.values}`, animation: 'spin 0.8s linear infinite' }} />
            <div style={{ fontSize: 14, color: s.muted }}>Сохраняю ценности...</div>
          </div>
        )}

        {/* ── DONE ───────────────────────────────────────────────── */}
        {phase === 'done' && (
          <div style={{ animation: 'fadeUp 0.4s forwards' }}>
            <div style={{ textAlign: 'center', padding: '32px 0 24px' }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: `${s.values}18`, border: `1px solid ${s.values}40`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px', boxShadow: `0 0 40px ${s.values}30`, fontSize: 28,
              }}>🧭</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: s.text, marginBottom: 8 }}>Ценности сохранены</div>
              <div style={{ fontSize: 13, color: s.muted, lineHeight: 1.7, marginBottom: 24 }}>
                Теперь они появятся в чекине — каждый день можно отмечать, насколько ты жил в соответствии с ними.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {existingValues.slice(-opValues.length).map(v => <ValueCard key={v.id} value={v} />)}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => router.push('/checkin')} style={{
                flex: 1, padding: '14px', borderRadius: 999, border: 'none',
                background: `linear-gradient(135deg,${s.values} 0%,${s.energy} 100%)`,
                color: '#07090D', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>
                Перейти к чекину →
              </button>
              <button onClick={() => router.push('/dashboard')} style={{
                padding: '14px 20px', borderRadius: 999,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                color: s.dim, fontSize: 14, cursor: 'pointer',
              }}>
                Дашборд
              </button>
            </div>
          </div>
        )}

      </div>

      <BottomNav router={router} />
    </div>
  )
}

export default function ValuesPage() {
  return <Suspense><ValuesContent /></Suspense>
}
