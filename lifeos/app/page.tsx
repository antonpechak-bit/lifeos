'use client'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { OPENING_MESSAGE } from '@/lib/prompts'
import { useState } from 'react'

export default function Home() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  async function start() {
    setLoading(true)
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        user_name: name || null,
        messages: [{ role: 'assistant', content: OPENING_MESSAGE }],
        current_layer: 0,
        completed: false,
      })
      .select('id')
      .single()

    if (error || !data) {
      console.error(error)
      setLoading(false)
      return
    }
    router.push(`/chat?session=${data.id}`)
  }

  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
    }}>
      {/* Glyph */}
      <div style={{
        fontFamily: "'Playfair Display', serif",
        fontStyle: 'italic',
        fontSize: 80,
        color: 'var(--accent)',
        opacity: 0.25,
        lineHeight: 1,
        marginBottom: 32,
        animation: 'float 6s ease-in-out infinite',
      }}>◎</div>

      <style>{`
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      <div style={{ animation: 'fadeIn 0.6s forwards', textAlign: 'center', maxWidth: 480 }}>
        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 36,
          fontWeight: 400,
          lineHeight: 1.25,
          marginBottom: 16,
        }}>
          Карта твоего<br />
          <em style={{ color: 'var(--accent)' }}>состояния</em>
        </h1>

        <p style={{
          fontSize: 15,
          color: 'var(--text-dim)',
          lineHeight: 1.8,
          marginBottom: 40,
        }}>
          Разговор с ИИ, который помогает увидеть себя как целостную систему.
          Где есть ресурс. Где дефицит. Что сделать фокусом на ближайшие месяцы.
        </p>

        {/* Meta */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 40,
          marginBottom: 40,
        }}>
          {[['7', 'слоёв'], ['40–50', 'минут'], ['1', 'State Map']].map(([n, l]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 26,
                color: 'var(--accent)',
              }}>{n}</div>
              <div style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginTop: 4,
              }}>{l}</div>
            </div>
          ))}
        </div>

        {/* Name input */}
        <input
          type="text"
          placeholder="Твоё имя (необязательно)"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && start()}
          style={{
            width: '100%',
            maxWidth: 320,
            background: 'var(--surface)',
            border: '1px solid var(--border2)',
            borderRadius: 12,
            padding: '12px 16px',
            color: 'var(--text)',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
            outline: 'none',
            marginBottom: 16,
            display: 'block',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        />

        <button
          onClick={start}
          disabled={loading}
          style={{
            background: loading ? 'var(--surface2)' : 'var(--accent)',
            color: loading ? 'var(--text-muted)' : 'var(--bg)',
            border: 'none',
            borderRadius: 100,
            padding: '13px 40px',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            letterSpacing: '0.03em',
          }}
        >
          {loading ? 'Создаём сессию...' : 'Начать диагностику'}
        </button>

        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 20 }}>
          Нет правильных ответов. Чем честнее — тем точнее карта.
        </p>
      </div>
    </main>
  )
}
