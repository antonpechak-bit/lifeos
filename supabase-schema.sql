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
