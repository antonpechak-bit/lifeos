// @ts-nocheck
'use client'
import { useEffect, useState } from 'react'
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

const CATEGORY_BADGES: Record<string, { icon: string; label: string }> = {
  pattern:        { icon: '🔍', label: 'Паттерн' },
  value:          { icon: '💎', label: 'Ценность' },
  meaning_theme:  { icon: '🌱', label: 'Смысл' },
  barrier:        { icon: '⚠️', label: 'Барьер' },
  strength:       { icon: '✅', label: 'Сила' },
  open_question:  { icon: '❓', label: 'Вопрос' },
}

function fmtDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '')
}

function pct(success: number | null, total: number | null) {
  if (!total || total === 0) return '—'
  return `${Math.round((success ?? 0) / total * 100)}%`
}

function streakText(sprints: any[], currentId: string): string | null {
  const sorted = [...sprints].sort((a, b) =>
    new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
  )
  const idx = sorted.findIndex(sp => sp.id === currentId)
  if (idx === -1) return null

  let count = 0
  for (let i = idx; i < sorted.length; i++) {
    const sp = sorted[i]
    const total = sp.total_days || sp.target_days || 0
    const done = sp.success_count ?? 0
    if (total > 0 && done / total >= 0.7) count++
    else break
  }

  if (count < 2) return null
  return `${count}-й спринт подряд с completion ≥ 70%`
}

function SprintCard({ sprint, insights, allSprints }) {
  const [expanded, setExpanded] = useState(false)
  const [showConversation, setShowConversation] = useState(false)

  const layerColor = LAYER_COLORS[sprint.layer] || s.muted
  const layerLabel = LAYER_LABELS[sprint.layer] || sprint.layer || '—'
  const successPct = pct(sprint.success_count, sprint.total_days || sprint.target_days)
  const total = sprint.total_days || sprint.target_days || 0
  const done = sprint.success_count ?? 0
  const startDate = fmtDate(sprint.started_at)
  const endDate = fmtDate(sprint.completed_at)
  const streak = streakText(allSprints, sprint.id)
  const relatedInsights = insights.filter(ins => ins.related_sprint_id === sprint.id)
  const messages: any[] = sprint.reflection_messages || []

  return (
    <div style={{
      background: 'linear-gradient(155deg,rgba(255,255,255,0.06) 0%,rgba(255,255,255,0.02) 100%)',
      backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 24, overflow: 'hidden',
      boxShadow: '0 4px 40px rgba(0,0,0,0.25)',
    }}>
      {/* Card header — always visible */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', padding: '18px 20px', textAlign: 'left',
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: layerColor, boxShadow: `0 0 8px ${layerColor}80`,
            }} />
            <span style={{ fontSize: 10, color: layerColor, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {layerLabel}
            </span>
            <span style={{ fontSize: 10, color: s.muted }}>· {startDate} – {endDate}</span>
          </div>
          <div style={{
            fontSize: 15, fontWeight: 600, color: s.text, lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {sprint.behavior_name}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{
            padding: '4px 10px', borderRadius: 999,
            background: `${layerColor}15`, border: `1px solid ${layerColor}30`,
            fontSize: 12, fontWeight: 600, color: layerColor,
          }}>
            {done}/{total}
          </div>
          <div style={{
            fontSize: 16, color: s.muted, transition: 'transform 0.2s',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}>⌄</div>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: '0 20px 20px' }}>
          <div style={{ width: '100%', height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 18 }} />

          {/* Section: Факты */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10, color: s.muted, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
              Факты
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'Выполнено', value: `${done}/${total} дней` },
                { label: 'Completion', value: successPct },
                { label: 'Старт', value: startDate },
                { label: 'Завершение', value: endDate },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  padding: '10px 12px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <div style={{ fontSize: 10, color: s.muted, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: s.text }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Section: Смысл */}
          {(sprint.reflection_summary || relatedInsights.length > 0) && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, color: s.muted, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
                Смысл
              </div>

              {sprint.reflection_summary && (
                <div style={{
                  fontSize: 13, color: s.dim, lineHeight: 1.75,
                  padding: '12px 14px', borderRadius: 14,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                  marginBottom: relatedInsights.length > 0 ? 10 : 0,
                  fontStyle: 'italic',
                }}>
                  {sprint.reflection_summary}
                </div>
              )}

              {relatedInsights.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {relatedInsights.map((ins, i) => {
                    const badge = ins.category ? CATEGORY_BADGES[ins.category] : null
                    return (
                      <div key={i} style={{
                        padding: '10px 12px', borderRadius: 12,
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                        fontSize: 13, color: s.dim, lineHeight: 1.6,
                      }}>
                        {badge && (
                          <span style={{
                            fontSize: 10, color: s.mindfulness,
                            background: `${s.mindfulness}15`, border: `1px solid ${s.mindfulness}25`,
                            borderRadius: 6, padding: '2px 6px', marginRight: 8,
                          }}>
                            {badge.icon} {badge.label}
                          </span>
                        )}
                        {ins.content}
                      </div>
                    )
                  })}
                </div>
              )}

              {messages.length > 0 && (
                <button
                  onClick={() => setShowConversation(v => !v)}
                  style={{
                    marginTop: 10, background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 12, color: s.muted, padding: 0, textDecoration: 'underline',
                  }}>
                  {showConversation ? 'Скрыть разговор' : `Показать разговор (${messages.length} сообщений)`}
                </button>
              )}

              {showConversation && messages.length > 0 && (
                <div style={{
                  marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8,
                  maxHeight: 320, overflowY: 'auto',
                  padding: '12px', borderRadius: 14,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  {messages.map((msg, i) => (
                    <div key={i} style={{
                      display: 'flex', flexDirection: 'column',
                      alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    }}>
                      <div style={{
                        maxWidth: '85%', padding: '8px 12px',
                        borderRadius: msg.role === 'user' ? '14px 14px 2px 14px' : '2px 14px 14px 14px',
                        background: msg.role === 'user'
                          ? 'rgba(106,168,255,0.12)'
                          : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${msg.role === 'user' ? 'rgba(106,168,255,0.2)' : 'rgba(255,255,255,0.07)'}`,
                        fontSize: 12, lineHeight: 1.65,
                        color: msg.role === 'user' ? s.energy : s.dim,
                        whiteSpace: 'pre-wrap',
                      }}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Section: Динамика */}
          {streak && (
            <div style={{
              padding: '12px 14px', borderRadius: 14,
              background: `${s.recovery}08`, border: `1px solid ${s.recovery}20`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{ fontSize: 16 }}>📈</div>
              <div style={{ fontSize: 13, color: s.recovery }}>{streak}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function SprintsArchivePage() {
  const router = useRouter()
  const [loading, setLoading]   = useState(true)
  const [sprints, setSprints]   = useState<any[]>([])
  const [insights, setInsights] = useState<any[]>([])

  useEffect(() => {
    async function load() {
      const { data: authData } = await supabase.auth.getSession()
      if (!authData?.session) { router.push('/'); return }
      const userId = authData.session.user.id

      const [{ data: sprintsData }, { data: insightsData }] = await Promise.all([
        supabase
          .from('sprints')
          .select('id, behavior_name, layer, level, target_days, started_at, ends_at, completed_at, success_count, total_days, reflection_summary, reflection_messages')
          .eq('user_id', userId)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false }),
        supabase
          .from('client_insights')
          .select('id, related_sprint_id, layer, category, content')
          .eq('user_id', userId)
          .eq('status', 'active')
          .not('related_sprint_id', 'is', null),
      ])

      setSprints(sprintsData || [])
      setInsights(insightsData || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div style={{ minHeight: '100vh', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.08)', borderTop: `2px solid ${s.energy}`, animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{
      minHeight: '100vh', background: s.bg, color: s.text,
      fontFamily: "'DM Sans',-apple-system,sans-serif", fontWeight: 300,
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
      `}</style>

      {/* Header */}
      <header style={{
        padding: '20px 24px 16px',
        background: 'rgba(7,9,13,0.85)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'sticky', top: 0, zIndex: 20,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button
          onClick={() => router.push('/dashboard')}
          style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10, padding: '6px 10px', cursor: 'pointer', color: s.dim,
            fontSize: 13, flexShrink: 0,
          }}>
          ←
        </button>
        <div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, color: s.text }}>
            Архив спринтов
          </div>
          {sprints.length > 0 && (
            <div style={{ fontSize: 11, color: s.muted, marginTop: 2 }}>
              {sprints.length} {sprints.length === 1 ? 'завершён' : sprints.length < 5 ? 'завершено' : 'завершено'}
            </div>
          )}
        </div>
      </header>

      <div style={{ padding: '20px 18px 48px', maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {sprints.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '64px 24px',
            animation: 'fadeUp 0.5s forwards',
          }}>
            <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.5 }}>🏁</div>
            <div style={{ fontSize: 16, color: s.dim, marginBottom: 8 }}>Завершённых спринтов пока нет</div>
            <div style={{ fontSize: 13, color: s.muted, lineHeight: 1.7, marginBottom: 24 }}>
              Когда спринт дойдёт до конца и ты проведёшь ревью — он появится здесь.
            </div>
            <button onClick={() => router.push('/dashboard')} style={{
              padding: '12px 24px', borderRadius: 999, border: 'none', cursor: 'pointer',
              background: `linear-gradient(135deg,${s.energy} 0%,${s.mindfulness} 100%)`,
              color: '#07090D', fontSize: 13, fontWeight: 600,
            }}>
              На дашборд →
            </button>
          </div>
        ) : (
          sprints.map((sprint, i) => (
            <div key={sprint.id} style={{ animation: `fadeUp 0.4s ease ${i * 0.06}s forwards`, opacity: 0 }}>
              <SprintCard sprint={sprint} insights={insights} allSprints={sprints} />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
