-- Content calendar entries become work for the category's people.
--
-- When a Client Manager or HR adds content work to the calendar under a category, each
-- of the category's people gets a task for it, as well as joining the entry: "Posters and
-- design: Diwali offer poster", due on the entry's date and time, with the brief, client
-- and project. It shows in their calendar and their tasks, where they Start work (and
-- their hours count), submit for review and the planner approves.
-- * They are told once, by the new task, rather than by a calendar invitation as well.
-- * Moving the entry moves the open tasks' due date and time with it.
-- * The planner sees each person's task, and where it stands, on the entry's page.

-- As before, plus a task for each person, linked to the entry. Created by the entry's
-- organiser; the category decides who receives it, so assignment rules do not apply.
create or replace function public.add_category_people()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_category text;
  v_start timestamp := new.starts_at at time zone 'Asia/Kolkata';
begin
  if new.category_id is null or (tg_op = 'UPDATE' and new.category_id is not distinct from old.category_id) then
    return null;
  end if;
  select name into v_category from public.calendar_categories where id = new.category_id;

  insert into public.meeting_participants (meeting_id, employee_id)
  select new.id, m.employee_id
  from public.calendar_category_members m
  join public.employees e on e.id = m.employee_id and e.is_active
  where m.category_id = new.category_id and m.employee_id is distinct from new.organizer_id
  on conflict (meeting_id, employee_id) do nothing;

  -- Set in full here: tasks made by a trigger skip the usual insert checks and defaults.
  insert into public.tasks (title, description, assignee_id, created_by, meeting_id, client_id, project_id, department_id, due_date, due_time, priority, status)
  select left(v_category || ': ' || new.title, 200), left(new.agenda, 4000), m.employee_id, new.organizer_id, new.id, new.client_id, new.project_id,
         e.department_id, v_start::date, v_start::time, 'medium', 'assigned'
  from public.calendar_category_members m
  join public.employees e on e.id = m.employee_id and e.is_active
  where m.category_id = new.category_id
    and m.employee_id is distinct from new.organizer_id
    and not exists (select 1 from public.tasks t where t.meeting_id = new.id and t.assignee_id = m.employee_id);
  return null;
end;
$$;

-- As before, but the category's people are told by their new task instead, so they get
-- one notice, not two.
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
    if v_meeting.category_id is not null and exists (
      select 1 from public.calendar_category_members m where m.category_id = v_meeting.category_id and m.employee_id = new.employee_id
    ) then
      return null;
    end if;
    select name into v_category from public.calendar_categories where id = v_meeting.category_id;
    perform public.notify(new.employee_id, 'meeting_invited',
      case when v_category is not null then 'New in your calendar: ' || v_category else 'You are invited to a meeting' end,
      public.meeting_summary(v_meeting), '/meetings/' || new.meeting_id);
  end if;
  return null;
end;
$$;

-- Moving a content entry moves its open tasks with it.
create function public.move_content_tasks()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_start timestamp := new.starts_at at time zone 'Asia/Kolkata';
begin
  if new.category_id is null or new.starts_at is not distinct from old.starts_at then
    return null;
  end if;
  update public.tasks
  set due_date = v_start::date, due_time = v_start::time
  where meeting_id = new.id and status not in ('completed', 'rejected');
  return null;
end;
$$;

create trigger meetings_move_content_tasks after update of starts_at on public.meetings
  for each row execute function public.move_content_tasks();

revoke execute on all functions in schema public from public, anon;
