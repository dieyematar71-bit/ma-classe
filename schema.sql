-- À exécuter dans Supabase SQL Editor.
create table if not exists public.class_data (
  tenant_id uuid primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.class_data enable row level security;
drop policy if exists "tenant members can read class data" on public.class_data;
drop policy if exists "tenant members can write class data" on public.class_data;
create policy "tenant members can read class data" on public.class_data
for select to authenticated
using (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid));
create policy "tenant members can write class data" on public.class_data
for all to authenticated
using (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
with check (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid));
