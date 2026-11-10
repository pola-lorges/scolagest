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
  active boolean not null default true,
  teacher_id text,
  student_id text,
  student_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (school_id, user_id)
);

alter table public.school_members add column if not exists active boolean not null default true;
alter table public.school_members add column if not exists teacher_id text;
alter table public.school_members add column if not exists student_id text;
alter table public.school_members add column if not exists student_ids text[] not null default '{}';

create table if not exists public.school_data (
  school_id uuid primary key references public.schools(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  user_name text not null,
  user_role text not null,
  action text not null,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_school_created_idx
on public.audit_logs (school_id, created_at desc);

alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon, authenticated;

create or replace function public.log_audit_event(target_code text, action_description text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership public.school_members%rowtype;
begin
  select sm.* into membership
  from public.school_members as sm
  join public.schools as s on s.id = sm.school_id
  where sm.user_id = auth.uid()
    and sm.active
    and lower(s.code) = lower(btrim(target_code))
  limit 1;

  if not found then
    raise exception 'Enregistrement de l’action non autorisé';
  end if;
  if action_description is null or length(btrim(action_description)) = 0 then
    raise exception 'Action invalide';
  end if;

  insert into public.audit_logs (school_id, user_id, user_name, user_role, action)
  values (membership.school_id, auth.uid(), membership.full_name, membership.role, left(action_description, 500));
end;
$$;

revoke all on function public.log_audit_event(text, text) from public;
grant execute on function public.log_audit_event(text, text) to authenticated;

create or replace function public.get_audit_logs(target_code text, page_limit integer default 100, page_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_school_id uuid;
  caller_role text;
  result_items jsonb;
  result_total bigint;
begin
  select sm.school_id, sm.role into target_school_id, caller_role
  from public.school_members as sm
  join public.schools as s on s.id = sm.school_id
  where sm.user_id = auth.uid()
    and sm.active
    and lower(s.code) = lower(btrim(target_code))
  limit 1;

  if target_school_id is null or caller_role not in ('ADMIN', 'DIRECTEUR') then
    raise exception 'Consultation de l’historique non autorisée';
  end if;

  select count(*) into result_total
  from public.audit_logs as log
  where log.school_id = target_school_id;

  select coalesce(jsonb_agg(to_jsonb(page_rows)), '[]'::jsonb) into result_items
  from (
    select log.id, log.user_name, log.user_role, log.action, log.created_at
    from public.audit_logs as log
    where log.school_id = target_school_id
    order by log.created_at desc, log.id desc
    limit greatest(1, least(coalesce(page_limit, 100), 200))
    offset greatest(coalesce(page_offset, 0), 0)
  ) as page_rows;

  return jsonb_build_object('items', result_items, 'total', result_total);
end;
$$;

revoke all on function public.get_audit_logs(text, integer, integer) from public;
grant execute on function public.get_audit_logs(text, integer, integer) to authenticated;

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
    and sm.active
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
    and sm.active
  limit 1;
$$;

create or replace function public.get_my_school_data(target_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  membership public.school_members%rowtype;
  source_data jsonb;
  linked_student_ids text[];
  linked_class_ids text[];
  linked_subject_ids text[];
  linked_teacher_ids text[];
begin
  select sm.* into membership
  from public.school_members as sm
  join public.schools as s on s.id = sm.school_id
  where sm.user_id = auth.uid()
    and sm.active
    and lower(s.code) = lower(btrim(target_code))
  limit 1;

  if not found then
    raise exception 'School membership not found';
  end if;

  select sd.data into source_data
  from public.school_data as sd
  where sd.school_id = membership.school_id;

  if source_data is null then
    raise exception 'School data not found';
  end if;

  if membership.role = 'ADMIN' then
    return jsonb_set(source_data, '{users}', coalesce((
      select jsonb_agg(item - 'password') from jsonb_array_elements(coalesce(source_data->'users', '[]'::jsonb)) as e(item)
    ), '[]'::jsonb));
  end if;

  if membership.role = 'DIRECTEUR' then
    return jsonb_set(source_data, '{users}', coalesce((
      select jsonb_agg(item - 'password')
      from jsonb_array_elements(coalesce(source_data->'users', '[]'::jsonb)) as e(item)
    ), '[]'::jsonb));
  end if;

  if membership.role = 'ADMINISTRATION' then
    return jsonb_set(
      source_data - 'users',
      '{users}',
      jsonb_build_array(jsonb_build_object(
        'id', auth.uid()::text,
        'username', coalesce(auth.jwt()->>'email', ''),
        'fullName', membership.full_name,
        'role', membership.role,
        'active', membership.active
      ))
    );
  end if;

  if membership.role = 'ENSEIGNANT' then
    if membership.teacher_id is null or not exists (
      select 1 from jsonb_array_elements(coalesce(source_data->'teachers', '[]'::jsonb)) as e(item)
      where e.item->>'id' = membership.teacher_id
    ) then
      raise exception 'Teacher profile not found';
    end if;

    linked_teacher_ids := array[membership.teacher_id];

    select coalesce(array_agg(distinct class_item.item->>'id'), '{}'::text[])
    into linked_class_ids
    from jsonb_array_elements(coalesce(source_data->'classes', '[]'::jsonb)) as class_item(item)
    where class_item.item->>'mainTeacherId' = membership.teacher_id
      or exists (
        select 1 from jsonb_array_elements(coalesce(class_item.item->'subjectTeachers', '[]'::jsonb)) as assignment(item)
        where assignment.item->>'teacherId' = membership.teacher_id
      )
      or exists (
        select 1
        from jsonb_array_elements(coalesce(source_data->'teachers', '[]'::jsonb)) as teacher(item)
        cross join lateral jsonb_array_elements_text(coalesce(teacher.item->'classes', '[]'::jsonb)) as assigned(class_id)
        where teacher.item->>'id' = membership.teacher_id
          and assigned.class_id = class_item.item->>'id'
      );

    select coalesce(array_agg(distinct student.item->>'id'), '{}'::text[])
    into linked_student_ids
    from jsonb_array_elements(coalesce(source_data->'students', '[]'::jsonb)) as student(item)
    where student.item->>'classId' = any(linked_class_ids);

    select coalesce(array_agg(distinct assignment.item->>'subjectId'), '{}'::text[])
    into linked_subject_ids
    from jsonb_array_elements(coalesce(source_data->'classes', '[]'::jsonb)) as class_item(item)
    cross join lateral jsonb_array_elements(coalesce(class_item.item->'subjectTeachers', '[]'::jsonb)) as assignment(item)
    where class_item.item->>'id' = any(linked_class_ids)
      and assignment.item->>'teacherId' = membership.teacher_id;

  elsif membership.role in ('PARENT', 'ELEVE') then
    if membership.role = 'ELEVE' then
      linked_student_ids := case when membership.student_id is null then '{}'::text[] else array[membership.student_id] end;
    else
      linked_student_ids := coalesce(membership.student_ids, '{}'::text[]);
    end if;

    select coalesce(array_agg(distinct student.item->>'classId'), '{}'::text[])
    into linked_class_ids
    from jsonb_array_elements(coalesce(source_data->'students', '[]'::jsonb)) as student(item)
    where student.item->>'id' = any(linked_student_ids);

    select coalesce(array_agg(distinct assignment.item->>'subjectId'), '{}'::text[])
    into linked_subject_ids
    from jsonb_array_elements(coalesce(source_data->'classes', '[]'::jsonb)) as class_item(item)
    cross join lateral jsonb_array_elements(coalesce(class_item.item->'subjectTeachers', '[]'::jsonb)) as assignment(item)
    where class_item.item->>'id' = any(linked_class_ids)
      and assignment.item->>'subjectId' is not null;

    select coalesce(array_agg(distinct teacher_id), '{}'::text[])
    into linked_teacher_ids
    from (
      select assignment.item->>'teacherId' as teacher_id
      from jsonb_array_elements(coalesce(source_data->'classes', '[]'::jsonb)) as class_item(item)
      cross join lateral jsonb_array_elements(coalesce(class_item.item->'subjectTeachers', '[]'::jsonb)) as assignment(item)
      where class_item.item->>'id' = any(linked_class_ids)
      union all
      select class_item.item->>'mainTeacherId' as teacher_id
      from jsonb_array_elements(coalesce(source_data->'classes', '[]'::jsonb)) as class_item(item)
      where class_item.item->>'id' = any(linked_class_ids)
    ) as class_teachers
    where teacher_id is not null;
  else
    raise exception 'This role does not have portal access';
  end if;

  return jsonb_build_object(
      'settings', coalesce(source_data->'settings', '{}'::jsonb),
      'users', jsonb_build_array(jsonb_build_object(
        'id', auth.uid()::text,
        'username', coalesce(auth.jwt()->>'email', ''),
        'fullName', membership.full_name,
        'role', membership.role,
        'active', membership.active,
        'teacherId', case when membership.role = 'ENSEIGNANT' then membership.teacher_id else null end,
        'studentId', case when membership.role = 'ELEVE' then membership.student_id else null end,
        'studentIds', to_jsonb(linked_student_ids)
      )),
      'students', coalesce((select jsonb_agg(case when membership.role in ('ELEVE', 'ENSEIGNANT') then item - 'parent' else item end) from jsonb_array_elements(coalesce(source_data->'students', '[]'::jsonb)) as e(item) where item->>'id' = any(linked_student_ids)), '[]'::jsonb),
      'classes', coalesce((select jsonb_agg(case when membership.role = 'ENSEIGNANT' then jsonb_set(item - 'mainTeacherId', '{subjectTeachers}', coalesce((select jsonb_agg(assignment.item) from jsonb_array_elements(coalesce(item->'subjectTeachers', '[]'::jsonb)) as assignment(item) where assignment.item->>'teacherId' = membership.teacher_id), '[]'::jsonb)) else item end) from jsonb_array_elements(coalesce(source_data->'classes', '[]'::jsonb)) as e(item) where item->>'id' = any(linked_class_ids)), '[]'::jsonb),
      'teachers', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', e.item->'id',
          'firstName', e.item->'firstName',
          'lastName', e.item->'lastName',
          'classes', coalesce((select jsonb_agg(value) from jsonb_array_elements(coalesce(e.item->'classes', '[]'::jsonb)) as c(value) where value #>> '{}' = any(linked_class_ids)), '[]'::jsonb),
          'subjects', coalesce((select jsonb_agg(value) from jsonb_array_elements(coalesce(e.item->'subjects', '[]'::jsonb)) as sub(value) where value #>> '{}' = any(linked_subject_ids)), '[]'::jsonb)
        ))
        from jsonb_array_elements(coalesce(source_data->'teachers', '[]'::jsonb)) as e(item)
        where e.item->>'id' = any(linked_teacher_ids)
      ), '[]'::jsonb),
      'subjects', coalesce((select jsonb_agg(item) from jsonb_array_elements(coalesce(source_data->'subjects', '[]'::jsonb)) as e(item) where item->>'id' = any(linked_subject_ids)), '[]'::jsonb),
      'grades', coalesce((
        select jsonb_agg(grade.item)
        from jsonb_array_elements(coalesce(source_data->'grades', '[]'::jsonb)) as grade(item)
        where grade.item->>'studentId' = any(linked_student_ids)
          and (membership.role <> 'ENSEIGNANT' or exists (
            select 1
            from jsonb_array_elements(coalesce(source_data->'classes', '[]'::jsonb)) as class_item(item)
            cross join lateral jsonb_array_elements(coalesce(class_item.item->'subjectTeachers', '[]'::jsonb)) as assignment(item)
            where class_item.item->>'id' = grade.item->>'classId'
              and assignment.item->>'teacherId' = membership.teacher_id
              and assignment.item->>'subjectId' = grade.item->>'subjectId'
          ))
      ), '[]'::jsonb),
      'attendance', coalesce((select jsonb_agg(item) from jsonb_array_elements(coalesce(source_data->'attendance', '[]'::jsonb)) as e(item) where (item->>'type' = 'student' and item->>'personId' = any(linked_student_ids)) or (membership.role = 'ENSEIGNANT' and item->>'type' = 'teacher' and item->>'personId' = membership.teacher_id)), '[]'::jsonb),
      'timetable', coalesce((select jsonb_agg(item) from jsonb_array_elements(coalesce(source_data->'timetable', '[]'::jsonb)) as e(item) where (membership.role = 'ENSEIGNANT' and item->>'teacherId' = membership.teacher_id) or (membership.role <> 'ENSEIGNANT' and item->>'classId' = any(linked_class_ids))), '[]'::jsonb),
      'payments', case when membership.role = 'ENSEIGNANT' then '[]'::jsonb else coalesce((select jsonb_agg(item) from jsonb_array_elements(coalesce(source_data->'payments', '[]'::jsonb)) as e(item) where item->>'studentId' = any(linked_student_ids)), '[]'::jsonb) end,
      'documents', case when membership.role = 'ENSEIGNANT' then '[]'::jsonb else coalesce((select jsonb_agg(item) from jsonb_array_elements(coalesce(source_data->'documents', '[]'::jsonb)) as e(item) where item->>'studentId' = any(linked_student_ids)), '[]'::jsonb) end,
      'messages', case when membership.role = 'ENSEIGNANT' then '[]'::jsonb else coalesce((select jsonb_agg(item) from jsonb_array_elements(coalesce(source_data->'messages', '[]'::jsonb)) as e(item) where item->>'studentId' = any(linked_student_ids)), '[]'::jsonb) end
    );
end;
$$;

revoke all on function public.get_my_school_data(text) from public;
grant execute on function public.get_my_school_data(text) to authenticated;

create or replace function public.save_my_school_data(target_code text, new_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership public.school_members%rowtype;
  target_school_id uuid;
  source_data jsonb;
  updated_data jsonb;
  linked_class_ids text[];
  linked_subject_ids text[];
begin
  select s.id into target_school_id
  from public.schools as s
  join public.school_members as sm on sm.school_id = s.id
  where sm.user_id = auth.uid()
    and sm.active
    and lower(s.code) = lower(btrim(target_code))
  limit 1;

  if not found then
    raise exception 'Modification non autorisée';
  end if;

  select sm.* into membership
  from public.school_members as sm
  where sm.school_id = target_school_id
    and sm.user_id = auth.uid()
    and sm.active;

  if not found or membership.role not in ('DIRECTEUR', 'ADMINISTRATION', 'ENSEIGNANT') then
    raise exception 'Modification non autorisée';
  end if;
  if membership.role = 'ENSEIGNANT' then
    raise exception 'Les enseignants peuvent uniquement consulter les notes';
  end if;
  if jsonb_typeof(new_data) <> 'object' then
    raise exception 'Données invalides';
  end if;

  select sd.data into source_data
  from public.school_data as sd
  where sd.school_id = target_school_id
  for update;

  if source_data is null then
    raise exception 'Données de l’établissement indisponibles';
  end if;

  if membership.role in ('DIRECTEUR', 'ADMINISTRATION') then
    if exists (
      select 1
      from unnest(array['students', 'classes', 'teachers', 'subjects', 'grades', 'attendance', 'timetable', 'payments', 'messages', 'documents']) as collection(name)
      where new_data ? collection.name and jsonb_typeof(new_data->collection.name) <> 'array'
    ) then
      raise exception 'Format des données invalide';
    end if;

    updated_data := source_data;
    updated_data := jsonb_set(updated_data, '{students}', coalesce(new_data->'students', source_data->'students', '[]'::jsonb));
    updated_data := jsonb_set(updated_data, '{classes}', coalesce(new_data->'classes', source_data->'classes', '[]'::jsonb));
    updated_data := jsonb_set(updated_data, '{teachers}', coalesce(new_data->'teachers', source_data->'teachers', '[]'::jsonb));
    updated_data := jsonb_set(updated_data, '{subjects}', coalesce(new_data->'subjects', source_data->'subjects', '[]'::jsonb));
    updated_data := jsonb_set(updated_data, '{grades}', coalesce(new_data->'grades', source_data->'grades', '[]'::jsonb));
    updated_data := jsonb_set(updated_data, '{attendance}', coalesce(new_data->'attendance', source_data->'attendance', '[]'::jsonb));
    updated_data := jsonb_set(updated_data, '{timetable}', coalesce(new_data->'timetable', source_data->'timetable', '[]'::jsonb));
    updated_data := jsonb_set(updated_data, '{payments}', coalesce(new_data->'payments', source_data->'payments', '[]'::jsonb));
    updated_data := jsonb_set(updated_data, '{messages}', coalesce(new_data->'messages', source_data->'messages', '[]'::jsonb));
    updated_data := jsonb_set(updated_data, '{documents}', coalesce(new_data->'documents', source_data->'documents', '[]'::jsonb));
  else
    if membership.teacher_id is null then
      raise exception 'Profil enseignant introuvable';
    end if;

    select coalesce(array_agg(distinct class_item.item->>'id'), '{}'::text[])
    into linked_class_ids
    from jsonb_array_elements(coalesce(source_data->'classes', '[]'::jsonb)) as class_item(item)
    where class_item.item->>'mainTeacherId' = membership.teacher_id
      or exists (
        select 1 from jsonb_array_elements(coalesce(class_item.item->'subjectTeachers', '[]'::jsonb)) as assignment(item)
        where assignment.item->>'teacherId' = membership.teacher_id
      )
      or exists (
        select 1
        from jsonb_array_elements(coalesce(source_data->'teachers', '[]'::jsonb)) as teacher(item)
        cross join lateral jsonb_array_elements_text(coalesce(teacher.item->'classes', '[]'::jsonb)) as assigned(class_id)
        where teacher.item->>'id' = membership.teacher_id
          and assigned.class_id = class_item.item->>'id'
      );

    select coalesce(array_agg(distinct assignment.item->>'subjectId'), '{}'::text[])
    into linked_subject_ids
    from jsonb_array_elements(coalesce(source_data->'classes', '[]'::jsonb)) as class_item(item)
    cross join lateral jsonb_array_elements(coalesce(class_item.item->'subjectTeachers', '[]'::jsonb)) as assignment(item)
    where class_item.item->>'id' = any(linked_class_ids)
      and assignment.item->>'teacherId' = membership.teacher_id;

    if jsonb_typeof(new_data->'grades') is distinct from 'array' or exists (
      select 1
      from jsonb_array_elements(coalesce(new_data->'grades', '[]'::jsonb)) as grade(item)
      where jsonb_typeof(grade.item) <> 'object'
        or not exists (
          select 1
          from jsonb_array_elements(coalesce(source_data->'classes', '[]'::jsonb)) as class_item(item)
          cross join lateral jsonb_array_elements(coalesce(class_item.item->'subjectTeachers', '[]'::jsonb)) as assignment(item)
          where class_item.item->>'id' = grade.item->>'classId'
            and class_item.item->>'id' = any(linked_class_ids)
            and assignment.item->>'teacherId' = membership.teacher_id
            and assignment.item->>'subjectId' = grade.item->>'subjectId'
        )
        or not exists (
          select 1
          from jsonb_array_elements(coalesce(source_data->'students', '[]'::jsonb)) as student(item)
          where student.item->>'id' = grade.item->>'studentId'
            and student.item->>'classId' = grade.item->>'classId'
        )
    ) then
      raise exception 'Une ou plusieurs notes dépassent les affectations de l’enseignant';
    end if;

    updated_data := jsonb_set(
      source_data,
      '{grades}',
      coalesce((
        select jsonb_agg(grade.item)
        from jsonb_array_elements(coalesce(source_data->'grades', '[]'::jsonb)) as grade(item)
        where not exists (
          select 1
          from jsonb_array_elements(coalesce(source_data->'classes', '[]'::jsonb)) as class_item(item)
          cross join lateral jsonb_array_elements(coalesce(class_item.item->'subjectTeachers', '[]'::jsonb)) as assignment(item)
          where class_item.item->>'id' = grade.item->>'classId'
            and class_item.item->>'id' = any(linked_class_ids)
            and assignment.item->>'teacherId' = membership.teacher_id
            and assignment.item->>'subjectId' = grade.item->>'subjectId'
        )
      ), '[]'::jsonb) || coalesce(new_data->'grades', '[]'::jsonb)
    );
  end if;

  if jsonb_typeof(new_data->'settings'->'bulletin'->'evaluationTypes') = 'array' then
    updated_data := jsonb_set(updated_data, '{settings,bulletin,evaluationTypes}', new_data->'settings'->'bulletin'->'evaluationTypes', true);
  end if;
  if jsonb_typeof(new_data->'settings'->'bulletin'->'evaluationCategories') = 'object' then
    updated_data := jsonb_set(updated_data, '{settings,bulletin,evaluationCategories}', new_data->'settings'->'bulletin'->'evaluationCategories', true);
  end if;

  update public.school_data
  set data = updated_data, updated_at = now()
  where public.school_data.school_id = target_school_id;
end;
$$;

revoke all on function public.save_my_school_data(text, jsonb) from public;
grant execute on function public.save_my_school_data(text, jsonb) to authenticated;

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