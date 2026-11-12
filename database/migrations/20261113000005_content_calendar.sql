-- The content calendar: categories of content work, each with the people who do it.
--
-- When a Client Manager or HR puts an entry in the calendar under a category (such as
-- "Posters and design"), everyone in that category is added to it, is notified, and sees
-- it in their own calendar. Categories and their people are kept in Settings.

insert into public.permissions (key, module, label, description, allowed_scopes, sort_order) values
  ('content_calendar.manage', 'Meetings', 'Plan the content calendar',
   'Put content work in the calendar under a category, and choose who each category goes to.', '{organisation}', 815);

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, 'content_calendar.manage', 'organisation'
from public.roles r
where r.name in ('Founder', 'Client Manager') or lower(r.name) = 'human resource'
on conflict (role_id, permission_key) do update set scope = excluded.scope;

create table public.calendar_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 80),
  description text check (length(description) <= 300),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index calendar_categories_name_unique on public.calendar_categories (lower(name));

create table public.calendar_category_members (
  category_id uuid not null references public.calendar_categories (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  primary key (category_id, employee_id)
);
create index calendar_category_members_employee_idx on public.calendar_category_members (employee_id);

alter table public.meetings add column category_id uuid references public.calendar_categories (id) on delete set null;
create index meetings_category_idx on public.meetings (category_id);

create function public.can_plan_content()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.has_permission('content_calendar.manage')
$$;

-- Only people who plan content may file an entry under a category.
create function public.guard_meeting_category()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or new.category_id is null then
    return new;
  end if;
  if (tg_op = 'INSERT' or new.category_id is distinct from old.category_id) and not public.can_plan_content() then
    raise exception 'You do not have permission to add content calendar entries.' using errcode = 'insufficient_privilege';
  end if;
  if (tg_op = 'INSERT' or new.category_id is distinct from old.category_id)
     and not exists (select 1 from public.calendar_categories where id = new.category_id and is_active) then
    raise exception 'Choose a category that is in use.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger meetings_guard_category before insert or update of category_id on public.meetings
  for each row execute function public.guard_meeting_category();

-- Everyone in the category joins the entry, which notifies them and puts it in their
-- calendar. The organiser is never added to their own entry.
create function public.add_category_people()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.category_id is null or (tg_op = 'UPDATE' and new.category_id is not distinct from old.category_id) then
    return null;
  end if;
  insert into public.meeting_participants (meeting_id, employee_id)
  select new.id, m.employee_id
  from public.calendar_category_members m
  join public.employees e on e.id = m.employee_id and e.is_active
  where m.category_id = new.category_id and m.employee_id is distinct from new.organizer_id
  on conflict (meeting_id, employee_id) do nothing;
  return null;
end;
$$;

create trigger meetings_add_category_people after insert or update of category_id on public.meetings
  for each row execute function public.add_category_people();

-- As before; an entry in a category says so, such as "New in your calendar: Posters and design".
create or replace function public.notify_meeting_invite()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_meeting public.meetings;
  v_category text;
begin
  select * into v_meeting from public.meetings where id = new.meeting_id;
  if new.employee_id is distinct from v_meeting.organizer_id and v_meeting.status = 'scheduled' then
    select name into v_category from public.calendar_categories where id = v_meeting.category_id;
    perform public.notify(new.employee_id, 'meeting_invited',
      case when v_category is not null then 'New in your calendar: ' || v_category else 'You are invited to a meeting' end,
      public.meeting_summary(v_meeting), '/meetings/' || new.meeting_id);
  end if;
  return null;
end;
$$;

-- The categories the owner asked for. The people are matched by name where exactly one
-- active employee has that name; anyone not matched is added in Settings, Calendar.
insert into public.calendar_categories (name, description, sort_order) values
  ('Posters and design', 'Posters, creatives and graphic design.', 10),
  ('Video shoot', 'Shoots and video production.', 20),
  ('Social media reels and stories', 'Reels, stories and short videos for social media.', 30)
on conflict do nothing;

insert into public.calendar_category_members (category_id, employee_id)
select c.id, e.id
from (values ('Posters and design', 'Mohammed Rafi'),
             ('Video shoot', 'Lokeshwari'), ('Video shoot', 'Yanthindra'),
             ('Social media reels and stories', 'Lokeshwari'), ('Social media reels and stories', 'Yanthindra')) as wanted (category, person)
join public.calendar_categories c on lower(c.name) = lower(wanted.category)
join public.employees e on e.is_active and lower(trim(e.full_name)) like lower(wanted.person) || '%'
where (select count(*) from public.employees x where x.is_active and lower(trim(x.full_name)) like lower(wanted.person) || '%') = 1
on conflict do nothing;

create trigger calendar_categories_set_updated_at before update on public.calendar_categories
  for each row execute function public.set_updated_at();
create trigger calendar_categories_audit after insert or update or delete on public.calendar_categories
  for each row execute function public.audit_row_change();
create trigger calendar_category_members_audit after insert or delete on public.calendar_category_members
  for each row execute function public.audit_row_change();

alter table public.calendar_categories enable row level security;
alter table public.calendar_category_members enable row level security;

-- Everyone can see the categories and who they go to, as names are visible everywhere.
create policy calendar_categories_select on public.calendar_categories for select to authenticated using (true);
create policy calendar_categories_write on public.calendar_categories for all to authenticated
  using (public.can_plan_content()) with check (public.can_plan_content());
create policy calendar_category_members_select on public.calendar_category_members for select to authenticated using (true);
create policy calendar_category_members_write on public.calendar_category_members for all to authenticated
  using (public.can_plan_content()) with check (public.can_plan_content());

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

grant select, insert, update, delete on public.calendar_categories to authenticated;
grant select, insert, delete on public.calendar_category_members to authenticated;
grant execute on function public.can_plan_content() to authenticated;
