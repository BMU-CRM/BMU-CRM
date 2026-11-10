-- Meetings with participants, notes, decisions and follow-up tasks, plus reminders.

create type public.meeting_kind as enum ('internal', 'department', 'management', 'client', 'project', 'one_to_one');
create type public.meeting_status as enum ('scheduled', 'completed', 'cancelled');
create type public.meeting_response as enum ('pending', 'accepted', 'declined');

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 2 and 200),
  agenda text check (length(agenda) <= 4000),
  kind public.meeting_kind not null default 'internal',
  status public.meeting_status not null default 'scheduled',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text check (length(location) <= 200),
  meeting_link text check (meeting_link ~* '^https://'),
  organizer_id uuid references public.employees (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  notes text check (length(notes) <= 20000),
  decisions text check (length(decisions) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meetings_times check (ends_at > starts_at and ends_at - starts_at <= interval '24 hours')
);
create index meetings_starts_idx on public.meetings (starts_at);
create index meetings_organizer_idx on public.meetings (organizer_id);
create index meetings_client_idx on public.meetings (client_id);
create index meetings_project_idx on public.meetings (project_id);

create table public.meeting_participants (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  response public.meeting_response not null default 'pending',
  responded_at timestamptz,
  primary key (meeting_id, employee_id)
);
create index meeting_participants_employee_idx on public.meeting_participants (employee_id);

-- Follow-up tasks point back to the meeting that created them.
alter table public.tasks add column meeting_id uuid references public.meetings (id) on delete set null;
create index tasks_meeting_idx on public.tasks (meeting_id);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

create function public.can_view_meeting_row(v_meeting public.meetings)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
begin
  if v_actor is null then
    return false;
  end if;
  return v_meeting.organizer_id = v_actor
    or public.permission_scope_for('meetings.view') = 'organisation'
    or exists (
      select 1 from public.meeting_participants p
      where p.meeting_id = v_meeting.id and p.employee_id = v_actor
    );
end;
$$;

create function public.can_view_meeting(p_meeting uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select public.can_view_meeting_row(m) from public.meetings m where m.id = p_meeting), false)
$$;

create function public.is_meeting_organizer(p_meeting uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.meetings
    where id = p_meeting and organizer_id = public.current_employee_id()
  )
$$;

-- ---------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------

create function public.guard_meeting_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if not public.has_permission('meetings.create') then
    raise exception 'You do not have permission to schedule meetings.' using errcode = 'insufficient_privilege';
  end if;

  new.organizer_id := public.current_employee_id();
  new.status := 'scheduled';

  if (new.client_id is not null and not public.can_view_client(new.client_id))
     or (new.project_id is not null and not public.can_view_project(new.project_id)) then
    raise exception 'You cannot link a meeting to that record.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger meetings_guard_insert before insert on public.meetings
  for each row execute function public.guard_meeting_insert();

-- The organiser can change anything. Participants can add notes and decisions.
create function public.guard_meeting_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.organizer_id is distinct from old.organizer_id then
    raise exception 'The organiser cannot be changed.' using errcode = 'insufficient_privilege';
  end if;

  if old.organizer_id is distinct from public.current_employee_id()
     and (to_jsonb(new) - array['notes', 'decisions', 'updated_at'])
         is distinct from (to_jsonb(old) - array['notes', 'decisions', 'updated_at']) then
    raise exception 'Only the organiser can change the meeting. You can add notes and decisions.'
      using errcode = 'insufficient_privilege';
  end if;

  if (new.client_id is distinct from old.client_id and new.client_id is not null and not public.can_view_client(new.client_id))
     or (new.project_id is distinct from old.project_id and new.project_id is not null and not public.can_view_project(new.project_id)) then
    raise exception 'You cannot link a meeting to that record.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger meetings_guard_update before update on public.meetings
  for each row execute function public.guard_meeting_update();

-- People respond to their own invitation, and only the response can change.
create function public.guard_meeting_response()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if new.meeting_id is distinct from old.meeting_id or new.employee_id is distinct from old.employee_id
     or old.employee_id is distinct from public.current_employee_id() then
    raise exception 'You can only answer your own invitation.' using errcode = 'insufficient_privilege';
  end if;
  new.responded_at := now();
  return new;
end;
$$;

create trigger meeting_participants_guard_update before update on public.meeting_participants
  for each row execute function public.guard_meeting_response();

-- A follow-up task can only point at a meeting its creator can see.
create function public.check_task_meeting_link()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.meeting_id is not null
     and (tg_op = 'INSERT' or new.meeting_id is distinct from old.meeting_id)
     and not public.can_view_meeting(new.meeting_id) then
    raise exception 'You cannot link a task to that meeting.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger tasks_check_meeting_link before insert or update of meeting_id on public.tasks
  for each row execute function public.check_task_meeting_link();

-- ---------------------------------------------------------------------------
-- Notifications and reminders
-- ---------------------------------------------------------------------------

create function public.meeting_summary(v_meeting public.meetings)
returns text
language sql stable set search_path = ''
as $$
  select v_meeting.title || ', ' || to_char(v_meeting.starts_at at time zone 'Asia/Kolkata', 'DD Mon, HH24:MI')
$$;

create function public.notify_meeting_invite()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_meeting public.meetings;
begin
  select * into v_meeting from public.meetings where id = new.meeting_id;
  if new.employee_id is distinct from v_meeting.organizer_id and v_meeting.status = 'scheduled' then
    perform public.notify(new.employee_id, 'meeting_invited', 'You are invited to a meeting',
      public.meeting_summary(v_meeting), '/meetings/' || new.meeting_id);
  end if;
  return null;
end;
$$;

create trigger meeting_participants_notify after insert on public.meeting_participants
  for each row execute function public.notify_meeting_invite();

create function public.notify_meeting_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_person uuid;
  v_kind public.notification_kind;
  v_title text;
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    v_kind := 'meeting_cancelled';
    v_title := 'A meeting was cancelled';
  elsif new.status = 'scheduled' and (
    new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at
    or new.location is distinct from old.location
    or new.meeting_link is distinct from old.meeting_link
  ) then
    v_kind := 'meeting_changed';
    v_title := 'A meeting was changed';
  else
    return null;
  end if;

  for v_person in select employee_id from public.meeting_participants where meeting_id = new.id loop
    perform public.notify(v_person, v_kind, v_title, public.meeting_summary(new), '/meetings/' || new.id,
      case when v_kind = 'meeting_cancelled' then 'high' else 'normal' end::public.notification_priority);
  end loop;
  return null;
end;
$$;

create trigger meetings_notify_change after update on public.meetings
  for each row execute function public.notify_meeting_change();

-- Runs every 5 minutes and reminds everyone 15 minutes before a meeting starts.
create function public.send_meeting_reminders()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_meeting public.meetings;
  v_person uuid;
begin
  for v_meeting in
    select * from public.meetings
    where status = 'scheduled' and starts_at > now() and starts_at <= now() + interval '15 minutes'
  loop
    for v_person in
      select employee_id from public.meeting_participants
      where meeting_id = v_meeting.id and response <> 'declined'
      union
      select v_meeting.organizer_id where v_meeting.organizer_id is not null
    loop
      perform public.notify(v_person, 'meeting_reminder', 'Your meeting starts soon',
        public.meeting_summary(v_meeting), '/meetings/' || v_meeting.id, 'high', null,
        'meeting-reminder:' || v_meeting.id || ':' || v_meeting.starts_at);
    end loop;
  end loop;
end;
$$;

select cron.schedule('send-meeting-reminders', '*/5 * * * *', $$select public.send_meeting_reminders()$$);

-- ---------------------------------------------------------------------------
-- Triggers and row level security
-- ---------------------------------------------------------------------------

create trigger meetings_set_updated_at before update on public.meetings
  for each row execute function public.set_updated_at();
create trigger meetings_audit after insert or update or delete on public.meetings
  for each row execute function public.audit_row_change();

alter table public.meetings enable row level security;
alter table public.meeting_participants enable row level security;

create policy meetings_select on public.meetings for select to authenticated
  using (public.can_view_meeting_row(meetings));
create policy meetings_insert on public.meetings for insert to authenticated
  with check (public.has_permission('meetings.create'));
create policy meetings_update on public.meetings for update to authenticated
  using (public.can_view_meeting_row(meetings))
  with check (public.current_employee_id() is not null);
create policy meetings_delete on public.meetings for delete to authenticated
  using (organizer_id = public.current_employee_id());

create policy meeting_participants_select on public.meeting_participants for select to authenticated
  using (public.can_view_meeting(meeting_id));
create policy meeting_participants_insert on public.meeting_participants for insert to authenticated
  with check (public.is_meeting_organizer(meeting_id));
create policy meeting_participants_update on public.meeting_participants for update to authenticated
  using (employee_id = public.current_employee_id())
  with check (employee_id = public.current_employee_id());
create policy meeting_participants_delete on public.meeting_participants for delete to authenticated
  using (public.is_meeting_organizer(meeting_id));
