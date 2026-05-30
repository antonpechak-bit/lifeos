// @ts-nocheck
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()
  const [status, setStatus] = useState('Входим...')

  useEffect(() => {
    // Слушаем событие входа
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        subscription.unsubscribe()
        router.push('/dashboard')
      }
    })

    // Параллельно проверяем есть ли уже сессия
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        subscription.unsubscribe()
        router.push('/dashboard')
      }
    })

    // Таймаут — если через 5 сек ничего не произошло
    const timeout = setTimeout(() => {
      setStatus('Перенаправляем...')
      router.push('/')
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:48, opacity:0.3, marginBottom:16 }}>◎</div>
        <div style={{ fontSize:14, color:'var(--text-dim,#7a7870)', marginBottom:8 }}>{status}</div>
        <div style={{ fontSize:12, color:'var(--text-muted,#3d3d3d)' }}>Это займёт секунду</div>
      </div>
    </div>
  )
}
