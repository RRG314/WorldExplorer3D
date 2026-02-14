-- World Explorer 3D multiplayer table + baseline RLS
-- Run in Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.world_placeables (
    id text primary key,
    env text not null check (env in ('earth', 'moon', 'space')),
    location_key text not null,
    chunk_key text not null check (chunk_key ~ '^[EMS]:-?[0-9]+,-?[0-9]+$'),
    type text not null check (type in ('block', 'pin', 'flower')),
    x double precision not null,
    y double precision not null,
    z double precision not null,
    lat double precision not null check (lat >= -90 and lat <= 90),
    lon double precision not null check (lon >= -180 and lon <= 180),
    meta jsonb not null default '{}'::jsonb,
    author_id text not null,
    schema_version integer not null default 1 check (schema_version = 1),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz null
);

create index if not exists idx_world_placeables_env_loc_chunk
    on public.world_placeables (env, location_key, chunk_key);

create index if not exists idx_world_placeables_active
    on public.world_placeables (env, location_key, chunk_key, type)
    where deleted_at is null;

create index if not exists idx_world_placeables_updated_at
    on public.world_placeables (updated_at desc);

create or replace function public.set_world_placeables_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_world_placeables_updated_at on public.world_placeables;
create trigger trg_world_placeables_updated_at
before update on public.world_placeables
for each row execute function public.set_world_placeables_updated_at();

alter table public.world_placeables enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update on table public.world_placeables to anon, authenticated;
revoke delete on table public.world_placeables from anon, authenticated;

drop policy if exists "world_placeables_select" on public.world_placeables;
create policy "world_placeables_select"
on public.world_placeables
for select
to anon
using (true);

drop policy if exists "world_placeables_insert" on public.world_placeables;
create policy "world_placeables_insert"
on public.world_placeables
for insert
to anon
with check (
    schema_version = 1
    and type in ('block', 'pin', 'flower')
    and char_length(coalesce(meta->>'note', '')) <= 200
    and position('<' in coalesce(meta->>'note', '')) = 0
    and position('>' in coalesce(meta->>'note', '')) = 0
);

drop policy if exists "world_placeables_update" on public.world_placeables;
create policy "world_placeables_update"
on public.world_placeables
for update
to anon
using (true)
with check (
    schema_version = 1
    and type in ('block', 'pin', 'flower')
    and char_length(coalesce(meta->>'note', '')) <= 200
    and position('<' in coalesce(meta->>'note', '')) = 0
    and position('>' in coalesce(meta->>'note', '')) = 0
);

-- Deletions are intentionally not granted.
-- Clients use deleted_at tombstones instead of hard delete.
