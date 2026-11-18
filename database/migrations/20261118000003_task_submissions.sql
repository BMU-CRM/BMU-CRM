-- When a task was handed in, and progress that follows the review, as the owner asked:
-- * The first time a task is submitted for review, progress goes to 75%.
-- * Each time it is submitted again after changes were requested (rework), it goes up
--   by 2% (77%, 79% ...), never past 99%.
-- * When the reviewer approves it, it goes to 100% (as before).
-- The first and the latest submission dates and the number of submissions are kept.
-- Approval is completed_at and verified_by, as before.
-- Before its first submission the assignee may set progress up to 74%; from then on it
-- is set only by these steps.

alter table public.tasks
  add column first_submitted_at timestamptz,
  add column submitted_at timestamptz,
  add column submission_count integer not null default 0 check (submission_count >= 0);

create function public.set_task_submission_progress()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Set only here; never typed in.
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then
      new.first_submitted_at := null;
      new.submitted_at := null;
      new.submission_count := 0;
      new.completion_percentage := least(new.completion_percentage, 74);
    end if;
    return new;
  end if;

  if (select auth.uid()) is not null and pg_trigger_depth() = 1 and (
    new.first_submitted_at is distinct from old.first_submitted_at
    or new.submitted_at is distinct from old.submitted_at
    or new.submission_count is distinct from old.submission_count
  ) then
    raise exception 'Submission dates are recorded automatically.' using errcode = 'insufficient_privilege';
  end if;

  if new.status is distinct from old.status and new.status = 'under_review' then
    new.submission_count := old.submission_count + 1;
    new.submitted_at := now();
    new.first_submitted_at := coalesce(old.first_submitted_at, now());
    new.completion_percentage := case
      when old.submission_count = 0 then 75
      else least(greatest(old.completion_percentage, 75) + 2, 99)
    end;
  elsif new.status is distinct from old.status and new.status = 'completed' then
    new.completion_percentage := 100;
  elsif new.status is distinct from old.status and old.status = 'completed' then
    -- Reopened for rework: back to where the last submission left it.
    new.completion_percentage := case
      when old.submission_count = 0 then 75
      else least(75 + 2 * (old.submission_count - 1), 99)
    end;
  elsif new.completion_percentage is distinct from old.completion_percentage
        and (select auth.uid()) is not null and pg_trigger_depth() = 1 then
    if old.submission_count > 0 or old.status in ('under_review', 'completed') then
      raise exception 'Progress is set automatically once the task is submitted for review.'
        using errcode = 'check_violation';
    end if;
    if new.completion_percentage > 74 then
      raise exception 'Progress goes to 75%% when you submit the task for review. Before that, enter up to 74%%.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- Named to run after tasks_guard_update (triggers run in name order).
create trigger tasks_submission_progress before insert or update on public.tasks
  for each row execute function public.set_task_submission_progress();

revoke execute on function public.set_task_submission_progress() from public, anon, authenticated;

-- Tasks already handed in: their submissions, from the audit log. Filled in quietly, so
-- task histories and notifications do not show this one-off step.
alter table public.tasks disable trigger tasks_audit;
alter table public.tasks disable trigger tasks_notify;
alter table public.tasks disable trigger tasks_set_updated_at;

with submissions as (
  select l.entity_id::uuid as task_id, min(l.created_at) as first_at, max(l.created_at) as last_at, count(*)::integer as times
  from public.audit_logs l
  where l.entity_type = 'tasks' and l.action = 'updated'
    and l.details -> 'changes' -> 'status' ->> 'to' = 'under_review'
  group by l.entity_id
)
update public.tasks t
set first_submitted_at = s.first_at, submitted_at = s.last_at, submission_count = s.times
from submissions s
where t.id = s.task_id;

-- Progress for tasks under review or sent back, by the same rule.
update public.tasks
set completion_percentage = least(75 + 2 * (submission_count - 1), 99)
where submission_count > 0 and status in ('under_review', 'changes_requested');

alter table public.tasks enable trigger tasks_audit;
alter table public.tasks enable trigger tasks_notify;
alter table public.tasks enable trigger tasks_set_updated_at;
