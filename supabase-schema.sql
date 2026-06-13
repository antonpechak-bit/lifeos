-- Run this in Supabase SQL Editor

create table sessions (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  user_name text,
  messages jsonb default '[]'::jsonb,
  state_map text,
  current_layer integer default 0,
  completed boolean default false
);

-- Enable Row Level Security
alter table sessions enable row level security;

-- Allow anyone to insert and read their own session by id
create policy "Anyone can create sessions"
  on sessions for insert
  with check (true);

create policy "Anyone can read sessions by id"
  on sessions for select
  using (true);

create policy "Anyone can update sessions by id"
  on sessions for update
  using (true);

-- ── period_summaries: telescope memory (month / quarter / year) ─

create table period_summaries (
  id             uuid default gen_random_uuid() primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  period_type    text not null check (period_type in ('month', 'quarter', 'year')),
  period_start   date not null,
  period_end     date not null,
  label          text,                      -- e.g. "июнь 2026", "Q2 2026", "2026"
  summary_text   text not null,
  key_themes     text[] default '{}',
  central_obs    text,                      -- one-sentence core observation
  metrics        jsonb default '{}',        -- avg wellbeing, sprint completion, etc.
  created_at     timestamp with time zone default now(),
  updated_at     timestamp with time zone default now(),
  unique(user_id, period_type, period_start)
);

alter table period_summaries enable row level security;

create policy "Users manage own period_summaries"
  on period_summaries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
