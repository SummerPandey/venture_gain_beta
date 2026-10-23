-- Per-user Google Health (Fitbit) refresh token, saved from the app instead of a Vercel env var.
-- Run once in Supabase → SQL Editor. /api/google-health-* read and write this table with the
-- caller's own JWT, so these RLS policies are what keep each account to its own row.

create table if not exists public.google_health_tokens (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  updated_at    timestamptz not null default now()
);

alter table public.google_health_tokens enable row level security;

drop policy if exists "own token: select" on public.google_health_tokens;
drop policy if exists "own token: insert" on public.google_health_tokens;
drop policy if exists "own token: update" on public.google_health_tokens;
drop policy if exists "own token: delete" on public.google_health_tokens;

create policy "own token: select" on public.google_health_tokens
  for select to authenticated using (auth.uid() = user_id);
create policy "own token: insert" on public.google_health_tokens
  for insert to authenticated with check (auth.uid() = user_id);
create policy "own token: update" on public.google_health_tokens
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own token: delete" on public.google_health_tokens
  for delete to authenticated using (auth.uid() = user_id);
