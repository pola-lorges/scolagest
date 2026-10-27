create extension if not exists pgcrypto;

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.school_members (
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (
    role in ('ADMIN', 'DIRECTEUR', 'ADMINISTRATION', 'ENSEIGNANT', 'PARENT', 'ELEVE')
  ),
  full_name text not null default '',
  created_at timestamptz not null default now(),
  primary key (school_id, user_id)
);

create table if not exists public.school_data (
  school_id uuid primary key references public.schools(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.current_school_role(target_school_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select sm.role
  from public.school_members as sm
  where sm.school_id = target_school_id
    and sm.user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.current_school_role(uuid) from public;
grant execute on function public.current_school_role(uuid) to authenticated;

create or replace function public.current_user_school(target_code text)
returns table (school_id uuid, school_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name
  from public.schools as s
  join public.school_members as sm on sm.school_id = s.id
  where sm.user_id = auth.uid()
    and lower(s.code) = lower(btrim(target_code))
  limit 1;
$$;

revoke all on function public.current_user_school(text) from public;
grant execute on function public.current_user_school(text) to authenticated;

alter table public.schools enable row level security;
alter table public.school_members enable row level security;
alter table public.school_data enable row level security;

drop policy if exists "Members can view their school" on public.schools;
create policy "Members can view their school"
on public.schools
for select
to authenticated
using (public.current_school_role(id) is not null);

drop policy if exists "Members can view their own membership" on public.school_members;
create policy "Members can view their own membership"
on public.school_members
for select
to authenticated
using (
  user_id = auth.uid()
  or public.current_school_role(school_id) = 'ADMIN'
);

drop policy if exists "Admins can add school members" on public.school_members;
create policy "Admins can add school members"
on public.school_members
for insert
to authenticated
with check (public.current_school_role(school_id) = 'ADMIN');

drop policy if exists "Admins can update school members" on public.school_members;
create policy "Admins can update school members"
on public.school_members
for update
to authenticated
using (public.current_school_role(school_id) = 'ADMIN')
with check (public.current_school_role(school_id) = 'ADMIN');

drop policy if exists "Admins can remove school members" on public.school_members;
create policy "Admins can remove school members"
on public.school_members
for delete
to authenticated
using (public.current_school_role(school_id) = 'ADMIN');

drop policy if exists "Admins can read school data" on public.school_data;
create policy "Admins can read school data"
on public.school_data
for select
to authenticated
using (public.current_school_role(school_id) = 'ADMIN');

drop policy if exists "Admins can create school data" on public.school_data;
create policy "Admins can create school data"
on public.school_data
for insert
to authenticated
with check (public.current_school_role(school_id) = 'ADMIN');

drop policy if exists "Admins can update school data" on public.school_data;
create policy "Admins can update school data"
on public.school_data
for update
to authenticated
using (public.current_school_role(school_id) = 'ADMIN')
with check (public.current_school_role(school_id) = 'ADMIN');

drop policy if exists "Admins can delete school data" on public.school_data;
create policy "Admins can delete school data"
on public.school_data
for delete
to authenticated
using (public.current_school_role(school_id) = 'ADMIN');

grant select on public.schools to authenticated;
grant select, insert, update, delete on public.school_members to authenticated;
grant select, insert, update, delete on public.school_data to authenticated;

notify pgrst, 'reload schema';