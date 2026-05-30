import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Message = {
  role: 'user' | 'assistant'
  content: string
}

export type Session = {
  id: string
  created_at: string
  updated_at: string
  user_id: string
  user_name?: string
  messages: Message[]
  state_map?: string
  current_layer: number
  completed: boolean
}

export type Sprint = {
  id: string
  user_id: string
  session_id: string
  layer: string
  behavior_name: string
  behavior_description: string
  anchor: string
  level: string
  started_at: string
  ends_at: string
  status: 'pending' | 'active' | 'completed' | 'paused'
  target_days: number
}

export type Checkin = {
  id: string
  user_id: string
  sprint_id: string
  date: string
  completed: boolean
  note?: string
  created_at: string
}
