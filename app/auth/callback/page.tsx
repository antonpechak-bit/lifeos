// @ts-nocheck
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()
  const [status, setStatus] = useState('Входим...')

  useEffect(() => {
    async function handle() {
      // Ждём немного чтобы Supabase обработал токен из URL
      await new Promise(r => setTimeout(r, 1000))
      
      const { data, error } = await supabase.auth.getSession()
      
      if (data?.session) {
        setStatus('Готово!')
        router.push('/dashboard')
        return
      }

      // Попробуем ещё раз через 2 секунды
      await new Promise(r => setTimeout(r, 2000))
      const { data: data2 } = await supabase.auth.getSession()
      
      if (data2?.session) {
        router.push('/dashboard')
      } else {
        setStatus('Не удалось войти. Попробуй ещё раз.')
        await new Promise(r => setTimeout(r, 2000))
        router.push('/')
      }
    }
    
    handle()
  }, [])

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:48, opacity:0.3, marginBottom:16 }}>◎</div>
        <div style={{ fontSize:14, color:'var(--text-dim,#7a7870)' }}>{status}</div>
      </div>
    </div>
  )
}
