// @ts-nocheck
'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const DIM_CONFIG = {
  energy:     { label: 'Энергия',    emoji: '⚡', color: '#c8a86e' },
  mood:       { label: 'Настроение', emoji: '🌊', color: '#6ea8c8' },
  meaning:    { label: 'Смысл',      emoji: '🌱', color: '#7ab87a' },
  connection: { label: 'Связь',      emoji: '🤝', color: '#a86ec8' },
}

function MiniBar({ value, max = 10, color }) {
  return (
    <div style={{ height: 4, background: 'var(--surface2,#1a1a1e)', borderRadius: 2, overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: `${(value / max) * 100}%`, background: color, borderRadius: 2, transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)' }} />
    </div>
  )
}

function WeekChart({ logs, dim }) {
  const cfg = DIM_CONFIG[dim]
  const max = 10
  const days = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']

  // Build 7-day array ending today
  const result = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    const log = logs.find(l => l.date === dateStr)
    result.push({ dateStr, value: log?.[dim] || null, label: days[d.getDay() === 0 ? 6 : d.getDay() - 1] })
  }

  const maxH = 80
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: maxH + 24 }}>
      {result.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ fontSize: 10, color: d.value ? cfg.color : 'var(--text-muted,#3d3d3d)', fontWeight: d.value ? 500 : 300 }}>
            {d.value || ''}
          </div>
          <div style={{ width: '100%', borderRadius: '4px 4px 0 0', background: d.value ? `${cfg.color}${Math.round((d.value / max) * 255).toString(16).padStart(2,'0')}` : 'var(--surface2,#1a1a1e)', height: d.value ? Math.max((d.value / max) * maxH, 4) : 8, transition: 'height 0.5s', border: `1px solid ${d.value ? `${cfg.color}40` : 'transparent'}` }} />
          <div style={{ fontSize: 9, color: 'var(--text-muted,#3d3d3d)' }}>{d.label}</div>
        </div>
      ))}
    </div>
  )
}

function InsightCard({ insight }) {
  const colors = {
    positive: { bg: 'rgba(122,184,122,0.08)', border: 'rgba(122,184,122,0.25)', dot: '#7ab87a' },
    warning:  { bg: 'rgba(224,112,112,0.08)', border: 'rgba(224,112,112,0.2)',  dot: '#e07070' },
    neutral:  { bg: 'rgba(200,184,154,0.06)', border: 'rgba(200,184,154,0.15)', dot: '#c8b89a' },
  }
  const c = colors[insight.type] || colors.neutral
  return (
    <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 14, padding: '14px 16px', animation: 'fadeUp 0.3s forwards', opacity: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot, flexShrink: 0, marginTop: 5 }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text,#e8e6e0)', marginBottom: 4 }}>{insight.title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim,#7a7870)', lineHeight: 1.7 }}>{insight.body}</div>
        </div>
      </div>
    </div>
  )
}

function InsightsContent() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [logs, setLogs] = useState([])
  const [summaries, setSummaries] = useState([])
  const [currentWeekData, setCurrentWeekData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [activeTab, setActiveTab] = useState('week')
  const [activeDim, setActiveDim] = useState('energy')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.push('/'); return }
      const u = data.session.user
      setUser(u)

      // Load 30 days of logs
      const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30)
      const { data: logsData } = await supabase
        .from('daily_logs').select('*').eq('user_id', u.id)
        .gte('date', monthAgo.toISOString().split('T')[0]).order('date')

      // Load weekly summaries
      const { data: sumData } = await supabase
        .from('weekly_summaries').select('*').eq('user_id', u.id)
        .order('week_start', { ascending: false }).limit(8)

      setLogs(logsData || [])
      setSummaries(sumData || [])

      // Check current week summary
      const weekStart = getWeekStart()
      const weekEnd = getWeekEnd()
      const existing = sumData?.find(s => s.week_start === weekStart)
      if (existing) setCurrentWeekData(existing)

      setLoading(false)
    })
  }, [])

  function getWeekStart() {
    const d = new Date()
    const day = d.getDay() || 7
    d.setDate(d.getDate() - day + 1)
    return d.toISOString().split('T')[0]
  }

  function getWeekEnd() {
    const d = new Date()
    const day = d.getDay() || 7
    d.setDate(d.getDate() - day + 7)
    return d.toISOString().split('T')[0]
  }

  async function generateInsights() {
    if (!user) return
    setGenerating(true)
    try {
      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, weekStart: getWeekStart(), weekEnd: getWeekEnd() }),
      })
      const data = await res.json()
      if (data.insights) {
        setCurrentWeekData({ ...data.aggregates, ...data.insights, insights: data.insights.insights })
        setSummaries(prev => [{ week_start: getWeekStart(), ...data.aggregates, ...data.insights }, ...prev.filter(s => s.week_start !== getWeekStart())])
      }
    } catch (e) { console.error(e) }
    setGenerating(false)
  }

  // Last 7 days logs
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
  const weekLogs = logs.filter(l => new Date(l.date) >= weekAgo)

  // Compute averages for current week
  const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '—'
  const weekAvgs = {
    energy:     avg(weekLogs.filter(l => l.energy).map(l => l.energy)),
    mood:       avg(weekLogs.filter(l => l.mood).map(l => l.mood)),
    meaning:    avg(weekLogs.filter(l => l.meaning).map(l => l.meaning)),
    connection: avg(weekLogs.filter(l => l.connection).map(l => l.connection)),
    anxiety:    avg(weekLogs.filter(l => l.anxiety_level).map(l => l.anxiety_level)),
  }

  const wellbeingTrend = logs.filter(l => l.wellbeing_index).slice(-14)

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 14, color: 'var(--text-dim,#7a7870)' }}>Загружаем данные...</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 40 }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <header style={{ padding: '14px 24px', borderBottom: '1px solid var(--border,rgba(255,255,255,0.07))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.push('/dashboard')} style={{ fontSize: 13, color: 'var(--text-dim,#7a7870)', background: 'none', border: 'none', cursor: 'pointer' }}>← Dashboard</button>
          <span style={{ fontSize: 11, color: 'var(--text-muted,#3d3d3d)' }}>|</span>
          <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: 'var(--accent,#c8b89a)' }}>Аналитика</span>
        </div>
        <button
          onClick={generateInsights}
          disabled={generating}
          style={{ fontSize: 12, padding: '7px 14px', borderRadius: 8, background: generating ? 'var(--surface2,#1a1a1e)' : 'rgba(200,184,154,0.12)', border: '1px solid rgba(200,184,154,0.25)', color: generating ? 'var(--text-muted,#3d3d3d)' : 'var(--accent,#c8b89a)', cursor: generating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          {generating ? (
            <><span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>◌</span> Анализирую...</>
          ) : '✦ Анализ недели'}
        </button>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--surface,#141416)', borderRadius: 12, padding: 4, border: '1px solid var(--border,rgba(255,255,255,0.07))' }}>
          {[['week', '📊 Неделя'], ['trends', '📈 Тренды'], ['history', '📋 История']].map(([t, l]) => (
            <div key={t} onClick={() => setActiveTab(t)} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 13, textAlign: 'center', cursor: 'pointer', background: activeTab === t ? 'var(--surface2,#1a1a1e)' : 'transparent', color: activeTab === t ? 'var(--text,#e8e6e0)' : 'var(--text-dim,#7a7870)', fontWeight: activeTab === t ? 500 : 300, transition: 'all 0.15s' }}>
              {l}
            </div>
          ))}
        </div>

        {/* ── НЕДЕЛЯ ── */}
        {activeTab === 'week' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeUp 0.3s forwards' }}>

            {/* 4 dimensions overview */}
            <div style={{ background: 'var(--surface,#141416)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '18px 20px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted,#3d3d3d)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
                Средние показатели · 7 дней
              </div>
              {Object.entries(DIM_CONFIG).map(([key, cfg]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <span style={{ fontSize: 16, width: 24 }}>{cfg.emoji}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-dim,#7a7870)', width: 90 }}>{cfg.label}</span>
                  <MiniBar value={weekAvgs[key] === '—' ? 0 : parseFloat(weekAvgs[key])} color={cfg.color} />
                  <span style={{ fontSize: 16, fontWeight: 500, color: weekAvgs[key] === '—' ? 'var(--text-muted,#3d3d3d)' : cfg.color, width: 30, textAlign: 'right' }}>
                    {weekAvgs[key]}
                  </span>
                </div>
              ))}
              {weekLogs.length > 0 && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border,rgba(255,255,255,0.07))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-dim,#7a7870)' }}>Тревога (ниже = лучше)</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MiniBar value={weekAvgs.anxiety === '—' ? 0 : parseFloat(weekAvgs.anxiety)} color="#e07070" />
                    <span style={{ fontSize: 16, fontWeight: 500, color: '#e07070', width: 30, textAlign: 'right' }}>{weekAvgs.anxiety}</span>
                  </div>
                </div>
              )}
            </div>

            {/* AI Insights */}
            {currentWeekData?.insights?.length > 0 ? (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted,#3d3d3d)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Инсайты недели</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {currentWeekData.insights.map((ins, i) => (
                    <InsightCard key={i} insight={ins} />
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ background: 'var(--surface,#141416)', border: '1px dashed rgba(200,184,154,0.2)', borderRadius: 16, padding: '28px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>✦</div>
                <div style={{ fontSize: 14, color: 'var(--text-dim,#7a7870)', marginBottom: 8 }}>
                  {weekLogs.length === 0 ? 'Нет данных за эту неделю' : 'Готов к анализу'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted,#3d3d3d)', marginBottom: 20 }}>
                  {weekLogs.length === 0
                    ? 'Начни заполнять ежедневные чекины — и ИИ найдёт паттерны в твоих данных'
                    : `${weekLogs.length} ${weekLogs.length === 1 ? 'день' : 'дней'} данных — нажми «Анализ недели» чтобы найти паттерны`
                  }
                </div>
                {weekLogs.length > 0 && (
                  <button onClick={generateInsights} disabled={generating} style={{ background: 'var(--accent,#c8b89a)', color: '#0d0d0f', border: 'none', borderRadius: 100, padding: '10px 24px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                    {generating ? 'Анализирую...' : '✦ Анализ недели'}
                  </button>
                )}
              </div>
            )}

            {/* Next focus */}
            {currentWeekData?.next_focus && (
              <div style={{ background: 'rgba(200,184,154,0.06)', border: '1px solid rgba(200,184,154,0.2)', borderRadius: 14, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>→</span>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted,#3d3d3d)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Фокус на следующую неделю</div>
                  <div style={{ fontSize: 13, color: 'var(--accent,#c8b89a)', lineHeight: 1.6 }}>{currentWeekData.next_focus}</div>
                </div>
              </div>
            )}

            {/* Summary */}
            {currentWeekData?.summary_text && (
              <div style={{ background: 'var(--surface,#141416)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '14px 18px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted,#3d3d3d)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Картина недели</div>
                <div style={{ fontSize: 13, color: 'var(--text-dim,#7a7870)', lineHeight: 1.75 }}>{currentWeekData.summary_text}</div>
              </div>
            )}
          </div>
        )}

        {/* ── ТРЕНДЫ ── */}
        {activeTab === 'trends' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'fadeUp 0.3s forwards' }}>

            {/* Dim selector */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(DIM_CONFIG).map(([key, cfg]) => (
                <button key={key} onClick={() => setActiveDim(key)} style={{ padding: '7px 14px', borderRadius: 100, border: `1px solid ${activeDim === key ? cfg.color : 'rgba(255,255,255,0.07)'}`, background: activeDim === key ? `${cfg.color}15` : 'var(--surface,#141416)', color: activeDim === key ? cfg.color : 'var(--text-dim,#7a7870)', fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}>
                  {cfg.emoji} {cfg.label}
                </button>
              ))}
            </div>

            {/* Chart */}
            <div style={{ background: 'var(--surface,#141416)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text,#e8e6e0)', marginBottom: 4 }}>
                {DIM_CONFIG[activeDim].emoji} {DIM_CONFIG[activeDim].label} · последние 7 дней
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim,#7a7870)', marginBottom: 20 }}>
                Средняя: {avg(weekLogs.filter(l => l[activeDim]).map(l => l[activeDim]))}
              </div>
              {logs.length > 0 ? (
                <WeekChart logs={logs} dim={activeDim} />
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted,#3d3d3d)', fontSize: 13 }}>
                  Нет данных — начни заполнять чекины
                </div>
              )}
            </div>

            {/* Wellbeing index trend */}
            {wellbeingTrend.length > 0 && (
              <div style={{ background: 'var(--surface,#141416)', border: '1px solid rgba(200,184,154,0.15)', borderRadius: 16, padding: '20px' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text,#e8e6e0)', marginBottom: 4 }}>
                  🧬 Индекс благополучия · 14 дней
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim,#7a7870)', marginBottom: 20 }}>
                  Среднее: {avg(wellbeingTrend.map(l => parseFloat(l.wellbeing_index)))}
                </div>
                <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 100 }}>
                  {wellbeingTrend.map((l, i) => {
                    const val = parseFloat(l.wellbeing_index)
                    const h = Math.max((val / 10) * 80, 4)
                    const d = new Date(l.date)
                    const day = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'][d.getDay()]
                    return (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{ fontSize: 9, color: 'var(--accent,#c8b89a)' }}>{val.toFixed(1)}</div>
                        <div style={{ width: '100%', height: h, borderRadius: '3px 3px 0 0', background: `rgba(200,184,154,${0.3 + (val / 10) * 0.7})`, border: '1px solid rgba(200,184,154,0.2)' }} />
                        <div style={{ fontSize: 9, color: 'var(--text-muted,#3d3d3d)' }}>{day}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Correlations from summaries */}
            {summaries.filter(s => s.top_correlation).length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted,#3d3d3d)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Паттерны из прошлых недель</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {summaries.filter(s => s.top_correlation).slice(0, 4).map((s, i) => (
                    <div key={i} style={{ background: 'var(--surface,#141416)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 10 }}>
                      <span style={{ fontSize: 14 }}>◎</span>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted,#3d3d3d)', marginBottom: 3 }}>
                          {new Date(s.week_start).toLocaleDateString('ru', { day: 'numeric', month: 'long' })}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-dim,#7a7870)' }}>{s.top_correlation}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ИСТОРИЯ ── */}
        {activeTab === 'history' && (
          <div style={{ animation: 'fadeUp 0.3s forwards' }}>
            {summaries.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-dim,#7a7870)', fontSize: 14 }}>
                История появится после первого анализа недели
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {summaries.map((s, i) => (
                  <div key={i} style={{ background: 'var(--surface,#141416)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '16px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text,#e8e6e0)' }}>
                          {new Date(s.week_start).toLocaleDateString('ru', { day: 'numeric', month: 'long' })} — {new Date(s.week_end).toLocaleDateString('ru', { day: 'numeric', month: 'long' })}
                        </div>
                      </div>
                      {s.avg_wellbeing && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 10, color: 'var(--text-muted,#3d3d3d)', marginBottom: 2 }}>Индекс</div>
                          <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--accent,#c8b89a)' }}>{parseFloat(s.avg_wellbeing).toFixed(1)}</div>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginBottom: s.summary_text ? 12 : 0, flexWrap: 'wrap' }}>
                      {['energy','mood','meaning','connection'].map(key => s[`avg_${key}`] ? (
                        <div key={key} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: `${DIM_CONFIG[key].color}12`, color: DIM_CONFIG[key].color, border: `1px solid ${DIM_CONFIG[key].color}25` }}>
                          {DIM_CONFIG[key].emoji} {parseFloat(s[`avg_${key}`]).toFixed(1)}
                        </div>
                      ) : null)}
                      {s.sprint_completion_rate && (
                        <div style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(122,184,122,0.1)', color: '#7ab87a', border: '1px solid rgba(122,184,122,0.25)' }}>
                          ✓ {Math.round(s.sprint_completion_rate * 100)}%
                        </div>
                      )}
                    </div>
                    {s.summary_text && (
                      <div style={{ fontSize: 12, color: 'var(--text-dim,#7a7870)', lineHeight: 1.7 }}>{s.summary_text}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

export default function InsightsPage() {
  return <Suspense><InsightsContent /></Suspense>
}
