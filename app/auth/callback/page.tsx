// @ts-nocheck
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const hash = window.location.hash
    if (hash && hash.includes('access_token')) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          router.push('/dashboard')
        }
      })
    } else {
      supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
          router.push('/dashboard')
        }
      })
    }
  }, [])

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:48, opacity:0.3, marginBottom:16 }}>◎</div>
        <div style={{ fontSize:14, color:'var(--text-dim,#7a7870)' }}>Входим...</div>
      </div>
    </div>
  )
}
