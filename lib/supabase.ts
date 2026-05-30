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
  user_name?: string
  messages: Message[]
  state_map?: string
  current_layer: number
  completed: boolean
}
