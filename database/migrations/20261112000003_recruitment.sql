-- Stage 5 of the HR and Finance build: recruitment and onboarding.
--
-- * Job openings and candidates, moved through stages from new to joined.
-- * Interviews with an interviewer from the team. Each interview is also a meeting, so
--   it shows on the calendar and gets the usual meeting reminders, plus a reminder the
--   day before. Interviewers see their candidates and record feedback.
-- * Candidate files (resumes, portfolios) are seen only by recruiters and the
--   candidate's interviewers, and never appear in Files.
-- * Letter templates (offer, internship completion, experience, relieving), editable in
--   HR settings, printed with the person's details filled in.
-- * Converting a candidate to an employee records the link and starts an onboarding
--   checklist from configurable items.

-- ---------------------------------------------------------------------------
-- Permission
-- ---------------------------------------------------------------------------

insert into public.permissions (key, module, label, description, allowed_scopes, sort_order) values
  ('recruitment.manage', 'Recruitment', 'Run recruitment',
   'Manage job openings, candidates, interviews, offer letters and onboarding.', '{organisation}', 1300);

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, 'recruitment.manage', 'organisation'
from public.roles r
where r.name = 'Founder' or lower(r.name) = 'human resource'
on conflict (role_id, permission_key) do update set scope = excluded.scope;

-- ---------------------------------------------------------------------------
-- Openings and candidates
-- ---------------------------------------------------------------------------

create type public.job_opening_status as enum ('open', 'on_hold', 'closed');

create table public.job_openings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 2 and 120),
  department_id uuid references public.departments (id) on delete set null,
  designation_id uuid references public.designations (id) on delete set null,
  employment_type_id uuid references public.employment_types (id) on delete set null,
  positions integer not null default 1 check (positions between 1 and 100),
  location text check (length(location) <= 120),
  description text check (length(description) <= 8000),
  status public.job_opening_status not null default 'open',
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.candidate_stage as enum (
  'new', 'shortlisted', 'interview_scheduled', 'interview_done', 'selected', 'rejected',
  'offer_released', 'offer_accepted', 'joined'
);

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  opening_id uuid references public.job_openings (id) on delete set null,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  email text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  phone text check (phone ~ '^[+\d][\d\s()-]{6,19}$'),
  position text check (length(position) <= 120),
  department_id uuid references public.departments (id) on delete set null,
  experience_years numeric(4, 1) check (experience_years between 0 and 60),
  current_salary numeric(14, 2) check (current_salary >= 0),
  expected_salary numeric(14, 2) check (expected_salary >= 0),
  skills text[] not null default '{}',
  source text check (length(source) <= 60),
  portfolio_url text check (portfolio_url ~* '^https?://' and length(portfolio_url) <= 500),
  notes text check (length(notes) <= 4000),
  stage public.candidate_stage not null default 'new',
  stage_changed_at timestamptz not null default now(),
  -- The offer, filled in before the offer letter is printed.
  offered_designation_id uuid references public.designations (id) on delete set null,
  offered_salary numeric(14, 2) check (offered_salary >= 0),
  offered_joining_date date,
  -- Set when the candidate becomes an employee.
  employee_id uuid references public.employees (id) on delete set null,
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index candidates_stage_idx on public.candidates (stage);
create index candidates_opening_idx on public.candidates (opening_id);

-- ---------------------------------------------------------------------------
-- Interviews
-- ---------------------------------------------------------------------------

create type public.interview_status as enum ('scheduled', 'completed', 'cancelled');

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  round_name text not null default 'Interview' check (length(trim(round_name)) between 2 and 80),
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 480),
  interviewer_id uuid references public.employees (id) on delete set null,
  mode text not null default 'in_person' check (mode in ('in_person', 'video', 'phone')),
  location text check (length(location) <= 200),
  meeting_link text check (meeting_link ~* '^https://' and length(meeting_link) <= 500),
  status public.interview_status not null default 'scheduled',
  feedback text check (length(feedback) <= 4000),
  rating integer check (rating between 1 and 5),
  meeting_id uuid references public.meetings (id) on delete set null,
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index interviews_candidate_idx on public.interviews (candidate_id);
create index interviews_interviewer_idx on public.interviews (interviewer_id, scheduled_at);

-- ---------------------------------------------------------------------------
-- Letters and onboarding
-- ---------------------------------------------------------------------------

create type public.letter_kind as enum ('offer', 'internship_completion', 'experience', 'relieving');

create table public.letter_templates (
  id uuid primary key default gen_random_uuid(),
  kind public.letter_kind not null,
  name text not null check (length(trim(name)) between 2 and 120),
  subject text not null check (length(trim(subject)) between 2 and 200),
  body text not null check (length(trim(body)) between 10 and 20000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One starting template of each kind, which HR edits in HR settings. Words in double
-- braces are filled in when the letter is printed.
insert into public.letter_templates (kind, name, subject, body) values
  ('offer', 'Offer letter', 'Offer of employment',
   E'Dear {{name}},\n\nWe are pleased to offer you the position of {{designation}} in our {{department}} team at {{company}}.\n\nYour annual cost to company will be {{salary}}, and we look forward to you joining us on {{joining_date}}.\n\nPlease confirm your acceptance by signing and returning a copy of this letter.\n\nWe look forward to working with you.'),
  ('internship_completion', 'Internship completion', 'Internship completion certificate',
   E'This is to certify that {{name}} ({{employee_code}}) completed an internship with {{company}} as {{designation}} in the {{department}} team, from {{start_date}} to {{end_date}}.\n\nDuring the internship we found {{name}} sincere and hardworking. We wish them every success.'),
  ('experience', 'Experience letter', 'Experience certificate',
   E'This is to certify that {{name}} ({{employee_code}}) worked with {{company}} as {{designation}} in the {{department}} team from {{start_date}} to {{end_date}}.\n\nDuring this time {{name}} carried out their responsibilities well. We wish them success in their future endeavours.'),
  ('relieving', 'Relieving letter', 'Relieving letter',
   E'Dear {{name}},\n\nThis is to confirm that your resignation has been accepted and you are relieved from your duties as {{designation}} at {{company}} with effect from the close of business on {{last_working_day}}.\n\nWe thank you for your contribution and wish you the very best.');

create table public.onboarding_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index onboarding_items_name_unique on public.onboarding_items (lower(name));

insert into public.onboarding_items (name, sort_order) values
  ('Documents verified', 10),
  ('Laptop given', 20),
  ('Accounts created', 30);

create table public.onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  item_name text not null check (length(trim(item_name)) between 2 and 120),
  sort_order integer not null default 0,
  done_at timestamptz,
  done_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (employee_id, item_name)
);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

create function public.can_manage_recruitment()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.has_permission('recruitment.manage')
$$;

-- Recruiters see every candidate; an interviewer sees the candidates they interview.
create function public.can_view_candidate(p_candidate uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_employee_id() is not null and (
    public.can_manage_recruitment()
    or exists (
      select 1 from public.interviews i
      where i.candidate_id = p_candidate and i.interviewer_id = public.current_employee_id()
    )
  )
$$;

-- Files can belong to a candidate: recruiters and the candidate's interviewers see them.
alter table public.files
  add column candidate_id uuid references public.candidates (id) on delete cascade,
  add constraint files_candidate_alone check (
    candidate_id is null or (employee_id is null and num_nonnulls(client_id, project_id, task_id, meeting_id, ticket_id) = 0)
  );
create index files_candidate_idx on public.files (candidate_id) where candidate_id is not null;

create or replace function public.can_view_file_row(v_file public.files)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_scope public.permission_scope := public.permission_scope_for('files.view');
  v_department uuid;
begin
  if v_actor is null then
    return false;
  end if;
  if v_file.status = 'uploading' then
    return v_file.owner_id = v_actor;
  end if;
  if v_file.employee_id is not null then
    return v_file.employee_id = v_actor or v_file.owner_id = v_actor or public.can_manage_private_details();
  end if;
  if v_file.candidate_id is not null then
    return v_file.owner_id = v_actor or public.can_view_candidate(v_file.candidate_id);
  end if;
  if v_scope = 'organisation' or v_file.owner_id = v_actor then
    return true;
  end if;

  select department_id into v_department from public.employees where id = v_actor;

  if exists (
    select 1 from public.file_shares s
    where s.file_id = v_file.id
      and (s.expires_at is null or s.expires_at > now())
      and (s.recipient_employee_id = v_actor or (v_department is not null and s.recipient_department_id = v_department))
  ) then
    return true;
  end if;

  if (v_file.task_id is not null and public.can_view_task(v_file.task_id))
     or (v_file.project_id is not null and public.can_view_project(v_file.project_id))
     or (v_file.client_id is not null and public.can_view_client(v_file.client_id))
     or (v_file.meeting_id is not null and public.can_view_meeting(v_file.meeting_id))
     or (v_file.ticket_id is not null and public.can_view_ticket(v_file.ticket_id)) then
    return true;
  end if;

  if v_scope = 'department' and v_department is not null and v_file.department_id = v_department then
    return true;
  end if;

  return exists (
    select 1 from public.messages m
    where m.file_id = v_file.id and m.deleted_at is null and public.can_view_conversation(m.conversation_id)
  );
end;
$$;

create or replace function public.check_file_record_links()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if (new.meeting_id is not null and (tg_op = 'INSERT' or new.meeting_id is distinct from old.meeting_id)
      and not public.can_view_meeting(new.meeting_id))
     or (new.ticket_id is not null and (tg_op = 'INSERT' or new.ticket_id is distinct from old.ticket_id)
      and not public.can_view_ticket(new.ticket_id)) then
    raise exception 'You cannot attach files to that record.' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' and (new.employee_id is distinct from old.employee_id or new.candidate_id is distinct from old.candidate_id) then
    raise exception 'A document stays with the person it was added for.' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'INSERT' and new.employee_id is not null
     and new.employee_id is distinct from public.current_employee_id()
     and not public.can_manage_private_details() then
    raise exception 'You can only add documents to your own record.' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'INSERT' and new.candidate_id is not null and not public.can_manage_recruitment() then
    raise exception 'Only recruiters can add files to a candidate.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger files_check_record_links on public.files;
create trigger files_check_record_links before insert or update of meeting_id, ticket_id, employee_id, candidate_id on public.files
  for each row execute function public.check_file_record_links();

create or replace function public.stamp_file_share()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.files where id = new.file_id and (employee_id is not null or candidate_id is not null)) then
    raise exception 'Employee and candidate documents cannot be shared.' using errcode = 'insufficient_privilege';
  end if;
  if (select auth.uid()) is null then
    return new;
  end if;

  new.shared_by := public.current_employee_id();
  select e.full_name, g.title, d.name
    into new.sender_name, new.sender_designation, new.sender_department
  from public.employees e
  left join public.designations g on g.id = e.designation_id
  left join public.departments d on d.id = e.department_id
  where e.id = new.shared_by;

  if new.recipient_employee_id is not null and not exists (
    select 1 from public.employees where id = new.recipient_employee_id and is_active
  ) then
    raise exception 'This person cannot receive files.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------

create function public.stamp_recruitment_row()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and tg_op = 'INSERT' then
    new.created_by := public.current_employee_id();
  end if;
  return new;
end;
$$;

-- A candidate becomes "joined" only by being converted to an employee.
create function public.guard_candidate_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 or current_setting('app.trusted_candidate', true) = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.employee_id := null;
    if new.stage = 'joined' then
      new.stage := 'new';
    end if;
    return new;
  end if;
  if new.employee_id is distinct from old.employee_id then
    raise exception 'Convert the candidate to link them to an employee.' using errcode = 'insufficient_privilege';
  end if;
  if new.stage = 'joined' and old.stage <> 'joined' then
    raise exception 'Convert the candidate to an employee to mark them joined.' using errcode = 'check_violation';
  end if;
  if old.stage = 'joined' and new.stage <> 'joined' then
    raise exception 'This candidate has already joined.' using errcode = 'check_violation';
  end if;
  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
  end if;
  return new;
end;
$$;

create function public.notify_candidate_added()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_person uuid;
begin
  for v_person in select id from public.employees_with_permission('recruitment.manage', 'organisation') as r (id) loop
    perform public.notify(v_person, 'candidate_added', 'New candidate',
      new.full_name || coalesce(' for ' || new.position, ''), '/hr/recruitment/candidates/' || new.id);
  end loop;
  return null;
end;
$$;

create trigger job_openings_stamp before insert on public.job_openings
  for each row execute function public.stamp_recruitment_row();
create trigger candidates_stamp before insert on public.candidates
  for each row execute function public.stamp_recruitment_row();
create trigger candidates_guard before insert or update on public.candidates
  for each row execute function public.guard_candidate_change();
create trigger candidates_notify after insert on public.candidates
  for each row execute function public.notify_candidate_added();

create function public.interview_summary(p_interview public.interviews)
returns text
language sql stable security definer set search_path = ''
as $$
  select c.full_name || coalesce(' for ' || c.position, '') || ', '
    || to_char(p_interview.scheduled_at at time zone 'Asia/Kolkata', 'DD Mon, HH24:MI')
  from public.candidates c where c.id = p_interview.candidate_id
$$;

-- Schedules an interview and puts it on the calendar as a meeting with the interviewer,
-- so the usual invitation and reminders go out.
create function public.schedule_interview(
  p_candidate uuid, p_round text, p_at timestamptz, p_minutes integer, p_interviewer uuid,
  p_mode text, p_location text, p_link text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_candidate public.candidates;
  v_meeting uuid;
  v_interview uuid;
begin
  if not public.can_manage_recruitment() then
    raise exception 'You do not have permission to schedule interviews.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_candidate from public.candidates where id = p_candidate;
  if v_candidate.id is null then
    raise exception 'This candidate could not be found.' using errcode = 'no_data_found';
  end if;
  if p_interviewer is not null and not exists (select 1 from public.employees where id = p_interviewer and is_active) then
    raise exception 'Choose an active interviewer.' using errcode = 'check_violation';
  end if;

  insert into public.meetings (title, agenda, kind, starts_at, ends_at, location, meeting_link)
  values (
    left('Interview: ' || v_candidate.full_name, 200),
    left(coalesce(p_round, 'Interview') || coalesce(' for ' || v_candidate.position, '')
      || E'.\nAfterwards, record your feedback in the app at /interviews.', 4000),
    'internal', p_at, p_at + make_interval(mins => p_minutes),
    nullif(trim(p_location), ''), nullif(trim(p_link), '')
  )
  returning id into v_meeting;

  if p_interviewer is not null then
    insert into public.meeting_participants (meeting_id, employee_id) values (v_meeting, p_interviewer)
    on conflict do nothing;
  end if;

  insert into public.interviews (candidate_id, round_name, scheduled_at, duration_minutes, interviewer_id, mode, location, meeting_link, meeting_id)
  values (p_candidate, coalesce(nullif(trim(p_round), ''), 'Interview'), p_at, p_minutes, p_interviewer, p_mode,
          nullif(trim(p_location), ''), nullif(trim(p_link), ''), v_meeting)
  returning id into v_interview;

  if v_candidate.stage in ('new', 'shortlisted') then
    update public.candidates set stage = 'interview_scheduled' where id = p_candidate;
  end if;
  return v_interview;
end;
$$;

-- Records how an interview went. The interviewer or a recruiter can. Completing the
-- last open interview moves the candidate to "interview done".
create function public.record_interview_outcome(p_interview uuid, p_status public.interview_status, p_feedback text, p_rating integer)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_interview public.interviews;
begin
  select * into v_interview from public.interviews where id = p_interview for update;
  if v_interview.id is null or not (
    public.can_manage_recruitment() or v_interview.interviewer_id = public.current_employee_id()
  ) then
    raise exception 'You do not have permission to record this interview.' using errcode = 'insufficient_privilege';
  end if;
  if p_status = 'completed' and p_rating is null then
    raise exception 'Give a rating for a completed interview.' using errcode = 'check_violation';
  end if;

  update public.interviews set status = p_status, feedback = nullif(trim(p_feedback), ''), rating = p_rating, updated_at = now()
  where id = p_interview;

  -- Keep the calendar in step. Only the meeting's organiser may change it; anyone else
  -- leaves the calendar as it is.
  if p_status = 'cancelled' and v_interview.meeting_id is not null then
    begin
      update public.meetings set status = 'cancelled' where id = v_interview.meeting_id and status = 'scheduled';
    exception when insufficient_privilege then
      null;
    end;
  end if;

  if p_status = 'completed' and not exists (
    select 1 from public.interviews where candidate_id = v_interview.candidate_id and status = 'scheduled'
  ) then
    update public.candidates set stage = 'interview_done'
    where id = v_interview.candidate_id and stage in ('new', 'shortlisted', 'interview_scheduled');
  end if;
end;
$$;

-- A reminder the day before, on top of the meeting reminder just before.
create function public.send_interview_reminders()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_interview public.interviews;
begin
  for v_interview in
    select * from public.interviews
    where status = 'scheduled' and interviewer_id is not null
      and scheduled_at > now() and scheduled_at <= now() + interval '24 hours'
  loop
    perform public.notify(v_interview.interviewer_id, 'interview_reminder', 'You have an interview coming up',
      public.interview_summary(v_interview), '/interviews/' || v_interview.id, 'normal', null,
      'interview-reminder:' || v_interview.id || ':' || v_interview.scheduled_at);
  end loop;
end;
$$;

select cron.schedule('send-interview-reminders', '*/30 * * * *', $$select public.send_interview_reminders()$$);

-- Links a candidate to the employee record just created for them, marks them joined and
-- starts their onboarding checklist.
create function public.complete_candidate_conversion(p_candidate uuid, p_employee uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.can_manage_recruitment() then
    raise exception 'You do not have permission to convert candidates.' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.candidates where employee_id = p_employee and id <> p_candidate) then
    raise exception 'That employee is already linked to another candidate.' using errcode = 'unique_violation';
  end if;

  -- Lets guard_candidate_change accept the link, for this transaction only.
  perform set_config('app.trusted_candidate', 'on', true);
  update public.candidates set employee_id = p_employee, stage = 'joined', stage_changed_at = now()
  where id = p_candidate and employee_id is null;
  if not found then
    raise exception 'This candidate has already been converted.' using errcode = 'check_violation';
  end if;

  perform public.start_onboarding(p_employee);
end;
$$;

-- Adds the onboarding checklist to an employee, from the items in HR settings.
create function public.start_onboarding(p_employee uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.can_manage_recruitment() then
    raise exception 'You do not have permission to start onboarding.' using errcode = 'insufficient_privilege';
  end if;
  insert into public.onboarding_tasks (employee_id, item_name, sort_order)
  select p_employee, name, sort_order from public.onboarding_items where is_active
  on conflict (employee_id, item_name) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function public.set_onboarding_task(p_task uuid, p_done boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.can_manage_recruitment() then
    raise exception 'You do not have permission to update onboarding.' using errcode = 'insufficient_privilege';
  end if;
  update public.onboarding_tasks
  set done_at = case when p_done then coalesce(done_at, now()) end,
      done_by = case when p_done then public.current_employee_id() end
  where id = p_task;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers and row level security
-- ---------------------------------------------------------------------------

create trigger job_openings_set_updated_at before update on public.job_openings
  for each row execute function public.set_updated_at();
create trigger candidates_set_updated_at before update on public.candidates
  for each row execute function public.set_updated_at();
create trigger letter_templates_set_updated_at before update on public.letter_templates
  for each row execute function public.set_updated_at();

create trigger job_openings_audit after insert or update or delete on public.job_openings
  for each row execute function public.audit_row_change();
create trigger candidates_audit after insert or update or delete on public.candidates
  for each row execute function public.audit_row_change();
create trigger interviews_audit after insert or update on public.interviews
  for each row execute function public.audit_row_change();
create trigger letter_templates_audit after insert or update or delete on public.letter_templates
  for each row execute function public.audit_row_change();
create trigger onboarding_items_audit after insert or update or delete on public.onboarding_items
  for each row execute function public.audit_row_change();

alter table public.job_openings enable row level security;
alter table public.candidates enable row level security;
alter table public.interviews enable row level security;
alter table public.letter_templates enable row level security;
alter table public.onboarding_items enable row level security;
alter table public.onboarding_tasks enable row level security;

create policy job_openings_select on public.job_openings for select to authenticated
  using (public.can_manage_recruitment());
create policy job_openings_write on public.job_openings for all to authenticated
  using (public.can_manage_recruitment()) with check (public.can_manage_recruitment());

create policy candidates_select on public.candidates for select to authenticated
  using (public.can_view_candidate(id));
create policy candidates_write on public.candidates for all to authenticated
  using (public.can_manage_recruitment()) with check (public.can_manage_recruitment());

-- Interviews are added and closed through the functions above.
create policy interviews_select on public.interviews for select to authenticated
  using (public.can_manage_recruitment() or interviewer_id = public.current_employee_id());

-- Letters are printed by recruiters and by whoever handles exits.
create policy letter_templates_select on public.letter_templates for select to authenticated
  using (public.can_manage_recruitment() or public.has_permission('exits.manage'));
create policy letter_templates_write on public.letter_templates for all to authenticated
  using (public.can_manage_recruitment()) with check (public.can_manage_recruitment());

create policy onboarding_items_select on public.onboarding_items for select to authenticated
  using (public.can_manage_recruitment());
create policy onboarding_items_write on public.onboarding_items for all to authenticated
  using (public.can_manage_recruitment()) with check (public.can_manage_recruitment());

create policy onboarding_tasks_select on public.onboarding_tasks for select to authenticated
  using (public.can_manage_recruitment() or employee_id = public.current_employee_id());

-- ---------------------------------------------------------------------------
-- Grants. New tables and functions start open to anon, so close them again.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

grant select, insert, update, delete on public.job_openings to authenticated;
grant select, insert, update, delete on public.candidates to authenticated;
grant select on public.interviews to authenticated;
grant select, insert, update, delete on public.letter_templates to authenticated;
grant select, insert, update, delete on public.onboarding_items to authenticated;
grant select on public.onboarding_tasks to authenticated;

grant execute on function public.can_manage_recruitment() to authenticated;
grant execute on function public.can_view_candidate(uuid) to authenticated;
grant execute on function public.schedule_interview(uuid, text, timestamptz, integer, uuid, text, text, text) to authenticated;
grant execute on function public.record_interview_outcome(uuid, public.interview_status, text, integer) to authenticated;
grant execute on function public.complete_candidate_conversion(uuid, uuid) to authenticated;
grant execute on function public.start_onboarding(uuid) to authenticated;
grant execute on function public.set_onboarding_task(uuid, boolean) to authenticated;
-- Re-granted, because the function was replaced.
grant execute on function public.can_view_file_row(public.files) to authenticated;
