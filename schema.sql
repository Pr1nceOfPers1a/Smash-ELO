-- Run once in Supabase: SQL Editor > New query > paste > Run
create table matches (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  results jsonb not null
);
-- No public policies: only the server functions (service key) can read or write.
alter table matches enable row level security;
