// @ts-nocheck
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Home() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.push('/dashboard')
      else setChecking(false)
    })
  }, [])

  async function handleSubmit() {
    if (!email.trim()) return
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
  email: email.trim(),
  options: {
    emailRedirectTo: `https://lifeos-gold-chi.vercel.app/auth/callback`,
        data: { name: name.trim() || null }
      }
    })
    setLoading(false)
    if (!error) setSent(true)
  }

  if (checking) return null

  return (
    <main style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'40px 20px' }}>
      <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}} @keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div style={{ fontFamily:"'Playfair Display',serif", fontStyle:'italic', fontSize:72, color:'var(--accent,#c8b89a)', opacity:0.25, lineHeight:1, marginBottom:32, animation:'float 6s ease-in-out infinite' }}>◎</div>

      <div style={{ animation:'fadeIn 0.6s forwards', textAlign:'center', maxWidth:480, width:'100%' }}>
        <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:34, fontWeight:400, lineHeight:1.25, marginBottom:14, color:'var(--text,#e8e6e0)' }}>
          Карта твоего<br/><em style={{ color:'var(--accent,#c8b89a)' }}>состояния</em>
        </h1>
        <p style={{ fontSize:15, color:'var(--text-dim,#7a7870)', lineHeight:1.8, marginBottom:36 }}>
          Разговор с ИИ, который помогает увидеть себя как целостную систему. Где ресурс. Где дефицит. Что сделать фокусом.
        </p>

        <div style={{ display:'flex', justifyContent:'center', gap:40, marginBottom:40 }}>
          {[['7','слоёв'],['40–50','минут'],['1','State Map']].map(([n,l]) => (
            <div key={l} style={{ textAlign:'center' }}>
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:26, color:'var(--accent,#c8b89a)' }}>{n}</div>
              <div style={{ fontSize:11, color:'var(--text-muted,#3d3d3d)', textTransform:'uppercase', letterSpacing:'0.1em', marginTop:4 }}>{l}</div>
            </div>
          ))}
        </div>

        {sent ? (
          <div style={{ background:'var(--surface,#141416)', border:'1px solid rgba(200,184,154,0.2)', borderRadius:16, padding:'28px 24px', textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>✉️</div>
            <div style={{ fontSize:16, fontWeight:500, color:'var(--text,#e8e6e0)', marginBottom:8 }}>Проверь почту</div>
            <div style={{ fontSize:14, color:'var(--text-dim,#7a7870)', lineHeight:1.7 }}>
              Отправили ссылку на <strong>{email}</strong>.<br/>
              Кликни по ней — и окажешься внутри.
            </div>
          </div>
        ) : (
          <div style={{ maxWidth:360, margin:'0 auto' }}>
            <input
              type="text"
              placeholder="Твоё имя (необязательно)"
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ width:'100%', background:'var(--surface,#141416)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:12, padding:'12px 16px', color:'var(--text,#e8e6e0)', fontFamily:"'DM Sans',sans-serif", fontSize:14, outline:'none', marginBottom:10, boxSizing:'border-box' }}
            />
            <input
              type="email"
              placeholder="Твой email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={{ width:'100%', background:'var(--surface,#141416)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:12, padding:'12px 16px', color:'var(--text,#e8e6e0)', fontFamily:"'DM Sans',sans-serif", fontSize:14, outline:'none', marginBottom:16, boxSizing:'border-box' }}
            />
            <button
              onClick={handleSubmit}
              disabled={loading || !email.trim()}
              style={{ width:'100%', background:loading||!email.trim()?'var(--surface2,#1a1a1e)':'var(--accent,#c8b89a)', color:loading||!email.trim()?'var(--text-muted,#3d3d3d)':'var(--bg,#0d0d0f)', border:'none', borderRadius:100, padding:'13px 40px', fontFamily:"'DM Sans',sans-serif", fontSize:14, fontWeight:500, cursor:loading||!email.trim()?'not-allowed':'pointer', transition:'all 0.2s' }}
            >
              {loading ? 'Отправляем...' : 'Получить ссылку на почту'}
            </button>
            <p style={{ fontSize:12, color:'var(--text-muted,#3d3d3d)', marginTop:14 }}>
              Без пароля. Просто кликни по ссылке в письме.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
