-- Phase 1: Pulse schema + seed

create extension if not exists "pgcrypto";

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quiet_window_minutes int not null check (quiet_window_minutes >= 0),
  alert_window_minutes int not null check (alert_window_minutes >= quiet_window_minutes)
);

create table if not exists source_types (
  slug text primary key,
  label text not null,
  mode text not null check (mode in ('pull', 'push'))
);

create table if not exists person_sources (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  source_slug text not null references source_types(slug) on delete cascade,
  enabled boolean not null default false,
  config jsonb not null default '{}' ,
  created_at timestamptz not null default now(),
  unique(person_id, source_slug)
);

create table if not exists pings (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  source_slug text not null references source_types(slug) on delete cascade,
  created_at timestamptz not null default now()
);

-- Seed source registry
insert into source_types (slug, label, mode) values
  ('oura', 'Oura', 'pull'),
  ('shortcut', 'Shortcut', 'push'),
  ('manual', 'Manual', 'push')
on conflict (slug) do nothing;

-- Seed initial family members
insert into people (id, name, quiet_window_minutes, alert_window_minutes) values
  ('00000000-0000-0000-0000-000000000001', 'my sister', 180, 360),
  ('00000000-0000-0000-0000-000000000002', 'my dad', 720, 1080),
  ('00000000-0000-0000-0000-000000000003', 'me', 240, 480)
on conflict (id) do nothing;

-- Seed manual source opt-in for initial people
insert into person_sources (id, person_id, source_slug, enabled, config) values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'manual', true, '{}'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000002', 'manual', true, '{}'),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000003', 'manual', true, '{}')
on conflict (id) do nothing;
