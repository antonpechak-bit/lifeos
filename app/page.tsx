// @ts-nocheck
'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const s = {
  bg:          '#07090D',
  text:        '#F2F0EA',
  dim:         'rgba(255,255,255,0.50)',
  muted:       'rgba(255,255,255,0.28)',
  energy:      '#6AA8FF',
  recovery:    '#52FF9A',
  mindfulness: '#B18DFF',
  stress:      '#FFB84D',
}

export default function Home() {
  const router = useRouter()
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [code, setCode]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [sent, setSent]         = useState(false)
  const [error, setError]       = useState('')
  const [checking, setChecking] = useState(true)
  const codeRef = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.push('/dashboard')
      else setChecking(false)
    })
  }, [])

  async function handleSendCode() {
    if (!email.trim()) return
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        data: { name: name.trim() || null },
        shouldCreateUser: true,
      }
    })
    setLoading(false)
    if (err) {
      setError(err.message)
    } else {
      setSent(true)
      setTimeout(() => codeRef.current?.focus(), 100)
    }
  }

  async function handleVerify() {
    if (code.trim().length !== 6) return
    setVerifying(true)
    setError('')
    const { error: err } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    })
    setVerifying(false)
    if (err) {
      setError(err.message === 'Token has expired or is invalid'
        ? 'Код неверный или устарел. Запроси новый.'
        : err.message)
      setCode('')
    } else {
      router.push('/dashboard')
    }
  }

  async function handleResend() {
    setCode('')
    setError('')
    setSent(false)
    setTimeout(handleSendCode, 50)
  }

  if (checking) return null

  const canSend   = !loading && email.trim().length > 0
  const canVerify = !verifying && code.trim().length === 6

  return (
    <main style={{
      minHeight: '100dvh', background: s.bg, color: s.text,
      fontFamily: "'DM Sans',-apple-system,sans-serif", fontWeight: 300,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '48px 20px',
      position: 'relative', overflow: 'hidden',
    }}>
      <style>{`
        @keyframes orbFloat  { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(12px,-10px) scale(1.08)} }
        @keyframes orbFloat2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-10px,14px) scale(1.05)} }
        @keyframes orbFloat3 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(8px,10px) scale(1.06)} }
        @keyframes fadeUp    { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes glowPulse { 0%,100%{opacity:0.4} 50%{opacity:0.8} }
        input::placeholder   { color: rgba(255,255,255,0.25) }
        input:focus          { outline: none }
      `}</style>

      {/* Background orbs */}
      <div style={{ position:'fixed', top:-120, right:-80,  width:500, height:500, borderRadius:'50%', background:`radial-gradient(circle,${s.energy}18 0%,transparent 65%)`,    animation:'orbFloat  12s ease-in-out infinite',      pointerEvents:'none' }} />
      <div style={{ position:'fixed', bottom:-140, left:-100, width:560, height:560, borderRadius:'50%', background:`radial-gradient(circle,${s.mindfulness}12 0%,transparent 65%)`, animation:'orbFloat2 15s ease-in-out infinite 2s',  pointerEvents:'none' }} />
      <div style={{ position:'fixed', top:'40%', left:'60%',  width:320, height:320, borderRadius:'50%', background:`radial-gradient(circle,${s.recovery}0A 0%,transparent 60%)`,    animation:'glowPulse 8s ease-in-out infinite',      pointerEvents:'none' }} />

      <div style={{ position:'relative', zIndex:1, textAlign:'center', maxWidth:460, width:'100%', animation:'fadeUp 0.6s ease forwards' }}>

        {/* Wordmark */}
        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:13, color:s.muted, letterSpacing:'0.22em', textTransform:'uppercase', marginBottom:40 }}>
          Life OS
        </div>

        {/* Hero heading */}
        <h1 style={{
          fontFamily: "'Playfair Display',serif",
          fontSize: 'clamp(28px, 7vw, 40px)',
          fontWeight: 400, lineHeight: 1.2,
          marginBottom: 18, letterSpacing: '-0.01em',
          color: s.text,
        }}>
          Life OS —{' '}
          <em style={{
            fontStyle: 'italic',
            background: `linear-gradient(135deg,${s.energy},${s.mindfulness})`,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            инструмент для оптимизации жизни
          </em>
        </h1>

        <p style={{ fontSize:15, color:s.dim, lineHeight:1.8, marginBottom:36, maxWidth:380, margin:'0 auto 36px' }}>
          Разговор с ИИ, который помогает увидеть себя как целостную систему. Где ресурс. Где дефицит. Что сделать фокусом.
        </p>

        {/* Stats row */}
        <div style={{ display:'flex', justifyContent:'center', gap:32, marginBottom:44 }}>
          {[
            { n: '7',     l: 'слоёв',    color: s.energy },
            { n: '40–50', l: 'минут',    color: s.mindfulness },
            { n: '1',     l: 'State Map', color: s.recovery },
          ].map(({ n, l, color }) => (
            <div key={l} style={{ textAlign:'center' }}>
              <div style={{
                fontFamily:"'Playfair Display',serif", fontSize:26, fontWeight:400,
                color, textShadow:`0 0 24px ${color}60`,
              }}>{n}</div>
              <div style={{ fontSize:10, color:s.muted, textTransform:'uppercase', letterSpacing:'0.12em', marginTop:5 }}>{l}</div>
            </div>
          ))}
        </div>

        {/* Glass card */}
        {sent ? (
          /* Step 2: enter OTP code */
          <div style={{
            background: 'linear-gradient(155deg,rgba(255,255,255,0.09) 0%,rgba(255,255,255,0.03) 100%)',
            backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
            border: `1px solid ${s.energy}30`,
            borderRadius: 28, padding: '32px 28px', textAlign: 'center',
            boxShadow: `0 0 60px ${s.energy}12, 0 24px 80px rgba(0,0,0,0.4)`,
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px',
              background: `${s.energy}18`, border: `1px solid ${s.energy}40`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, boxShadow: `0 0 32px ${s.energy}30`,
            }}>✉️</div>
            <div style={{ fontSize:17, fontWeight:500, color:s.text, marginBottom:8 }}>Введи код из письма</div>
            <div style={{ fontSize:14, color:s.dim, lineHeight:1.75, marginBottom:24 }}>
              Отправили 6-значный код на <strong style={{ color:s.energy }}>{email}</strong>.
            </div>

            <input
              ref={codeRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="• • • • • •"
              value={code}
              onChange={e => { setError(''); setCode(e.target.value.replace(/\D/g,'').slice(0,6)) }}
              onKeyDown={e => e.key === 'Enter' && handleVerify()}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.05)',
                border: `1px solid ${code.length === 6 ? `${s.energy}60` : 'rgba(255,255,255,0.12)'}`,
                borderRadius: 14, padding: '14px 16px',
                color: s.text, fontFamily: "'DM Sans',sans-serif",
                fontSize: 24, fontWeight: 500, textAlign: 'center',
                letterSpacing: '0.35em', marginBottom: 12,
                transition: 'border-color 0.2s',
                boxShadow: code.length === 6 ? `0 0 20px ${s.energy}18` : 'none',
              }}
            />

            {error && (
              <div style={{ fontSize:13, color:s.stress, marginBottom:12, lineHeight:1.4 }}>
                {error}
              </div>
            )}

            <button
              onClick={handleVerify}
              disabled={!canVerify}
              style={{
                width: '100%', padding: '14px',
                borderRadius: 999, border: 'none',
                cursor: canVerify ? 'pointer' : 'not-allowed',
                background: canVerify
                  ? `linear-gradient(135deg,${s.energy} 0%,${s.mindfulness} 100%)`
                  : 'rgba(255,255,255,0.06)',
                color: canVerify ? '#07090D' : 'rgba(255,255,255,0.2)',
                fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600,
                transition: 'all 0.2s',
                boxShadow: canVerify ? `0 0 40px ${s.energy}50, 0 4px 24px ${s.energy}30` : 'none',
                marginBottom: 16,
              }}
            >
              {verifying ? 'Проверяем...' : 'Войти →'}
            </button>

            <button
              onClick={handleResend}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, color: s.muted, fontFamily: "'DM Sans',sans-serif",
                textDecoration: 'underline', padding: 0,
              }}
            >
              Отправить код заново
            </button>
          </div>
        ) : (
          /* Step 1: enter email */
          <div style={{
            background: 'linear-gradient(155deg,rgba(255,255,255,0.075) 0%,rgba(255,255,255,0.025) 100%)',
            backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 28, padding: '28px 24px',
            boxShadow: '0 0 60px rgba(106,168,255,0.07), 0 24px 80px rgba(0,0,0,0.35)',
          }}>
            <input
              type="text"
              placeholder="Твоё имя (необязательно)"
              value={name}
              onChange={e => setName(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 14, padding: '12px 16px',
                color: s.text, fontFamily: "'DM Sans',sans-serif",
                fontSize: 14, marginBottom: 10,
              }}
            />
            <input
              type="email"
              placeholder="Твой email"
              value={email}
              onChange={e => { setError(''); setEmail(e.target.value) }}
              onKeyDown={e => e.key === 'Enter' && handleSendCode()}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.05)',
                border: `1px solid ${email.trim() ? `${s.energy}40` : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 14, padding: '12px 16px',
                color: s.text, fontFamily: "'DM Sans',sans-serif",
                fontSize: 14, marginBottom: error ? 8 : 16,
                transition: 'border-color 0.2s',
                boxShadow: email.trim() ? `0 0 20px ${s.energy}12` : 'none',
              }}
            />
            {error && (
              <div style={{ fontSize:13, color:s.stress, marginBottom:12, lineHeight:1.4 }}>
                {error}
              </div>
            )}
            <button
              onClick={handleSendCode}
              disabled={!canSend}
              style={{
                width: '100%', padding: '14px',
                borderRadius: 999, border: 'none',
                cursor: canSend ? 'pointer' : 'not-allowed',
                background: canSend
                  ? `linear-gradient(135deg,${s.energy} 0%,${s.mindfulness} 100%)`
                  : 'rgba(255,255,255,0.06)',
                color: canSend ? '#07090D' : 'rgba(255,255,255,0.2)',
                fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600,
                transition: 'all 0.2s',
                boxShadow: canSend ? `0 0 40px ${s.energy}50, 0 4px 24px ${s.energy}30` : 'none',
              }}
            >
              {loading ? 'Отправляем...' : 'Получить код на почту →'}
            </button>
            <p style={{ fontSize:12, color:s.muted, marginTop:14, textAlign:'center' }}>
              Без пароля. Просто введи 6-значный код из письма.
            </p>
          </div>
        )}

      </div>
    </main>
  )
}
