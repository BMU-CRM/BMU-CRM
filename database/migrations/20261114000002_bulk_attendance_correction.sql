-- Correct attendance for several people and days at once, such as an office-wide outage.
--
-- * Only what HR fills in changes. An empty time, "Leave as it is" for the location or
--   the day status, keeps what the record already has.
-- * Days on approved leave, holidays and week offs are skipped, and counted.
-- * The same rules as a single correction: the attendance.manage permission, only people
--   in the corrector's scope, and never their own attendance (the existing guard trigger
--   also marks each row as a manual correction by them).
-- * One audit entry lists every person and day changed. Changes to existing records are
--   also audited row by row by the existing trigger.

create function public.correct_attendance_bulk(
  p_employees uuid[],
  p_from date,
  p_to date,
  p_check_in text default null,
  p_check_out text default null,
  p_work_mode text default null,
  p_status text default null,
  p_note text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_actor_name text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_working_days integer[];
  v_employee record;
  v_day date;
  v_existing public.attendance_records;
  v_found boolean;
  v_in timestamptz;
  v_out timestamptz;
  v_changed integer := 0;
  v_on_leave integer := 0;
  v_days_off integer := 0;
  v_people text[] := '{}';
  v_cells jsonb := '[]'::jsonb;
  v_changes text[] := '{}';
begin
  if v_actor is null or not public.has_permission('attendance.manage') then
    raise exception 'You do not have permission to correct attendance.' using errcode = 'insufficient_privilege';
  end if;

  -- What is being asked.
  if p_employees is null or cardinality(p_employees) = 0 then
    raise exception 'Choose at least one person.' using errcode = 'check_violation';
  end if;
  if cardinality(p_employees) > 500 then
    raise exception 'Choose up to 500 people at a time.' using errcode = 'check_violation';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'The end date must be on or after the start date.' using errcode = 'check_violation';
  end if;
  if p_to - p_from > 30 then
    raise exception 'Correct up to 31 days at a time.' using errcode = 'check_violation';
  end if;
  if p_check_in is not null and p_check_in !~ '^\d{2}:\d{2}$' then
    raise exception 'Enter a check-in time such as 09:30.' using errcode = 'check_violation';
  end if;
  if p_check_out is not null and p_check_out !~ '^\d{2}:\d{2}$' then
    raise exception 'Enter a check-out time such as 18:30.' using errcode = 'check_violation';
  end if;
  if p_check_in is not null and p_check_out is not null and p_check_out < p_check_in then
    raise exception 'Check-out must be after check-in.' using errcode = 'check_violation';
  end if;
  if p_work_mode is not null and p_work_mode not in ('office', 'wfh') then
    raise exception 'Choose office or home.' using errcode = 'check_violation';
  end if;
  if p_status is not null and p_status not in ('auto', 'present', 'half_day', 'absent', 'leave', 'holiday', 'week_off') then
    raise exception 'Choose a day status.' using errcode = 'check_violation';
  end if;
  if p_check_in is null and p_check_out is null and p_work_mode is null and p_status is null then
    raise exception 'Fill in at least one thing to change.' using errcode = 'check_violation';
  end if;
  if v_note is null then
    raise exception 'Give a reason for the correction.' using errcode = 'check_violation';
  end if;
  if length(v_note) > 500 then
    raise exception 'The reason can be up to 500 characters.' using errcode = 'check_violation';
  end if;

  if p_check_in is not null then v_changes := v_changes || ('check-in ' || p_check_in); end if;
  if p_check_out is not null then v_changes := v_changes || ('check-out ' || p_check_out); end if;
  if p_work_mode is not null then
    v_changes := v_changes || ('worked from ' || case p_work_mode when 'wfh' then 'home' else 'the office' end);
  end if;
  if p_status is not null then
    v_changes := v_changes || case when p_status = 'auto' then 'day status worked out from the times'
                                   else 'day status ' || replace(p_status, '_', ' ') end;
  end if;

  select working_days into v_working_days from public.company_settings limit 1;
  select full_name into v_actor_name from public.employees where id = v_actor;

  for v_employee in
    select e.id, e.full_name, e.is_active
    from unnest(p_employees) as chosen(id)
    left join public.employees e on e.id = chosen.id
    group by e.id, e.full_name, e.is_active
    order by e.full_name
  loop
    if v_employee.id is null or not v_employee.is_active then
      raise exception 'Choose people from the list.' using errcode = 'check_violation';
    end if;
    if v_employee.id = v_actor then
      raise exception 'You cannot correct your own attendance.' using errcode = 'insufficient_privilege';
    end if;
    if not public.can_access_employee('attendance.manage', v_employee.id) then
      raise exception '% is outside the people you can correct.', v_employee.full_name using errcode = 'insufficient_privilege';
    end if;
    v_people := v_people || v_employee.full_name;

    for v_day in select generate_series(p_from, p_to, interval '1 day')::date loop
      -- Week offs and holidays.
      if not (extract(isodow from v_day)::integer = any (coalesce(v_working_days, '{1,2,3,4,5}')))
         or exists (select 1 from public.holidays where holiday_date = v_day) then
        v_days_off := v_days_off + 1;
        continue;
      end if;
      -- Approved leave, including half days.
      if exists (
        select 1 from public.leave_requests
        where employee_id = v_employee.id and status = 'approved' and v_day between start_date and end_date
      ) then
        v_on_leave := v_on_leave + 1;
        continue;
      end if;

      select * into v_existing from public.attendance_records
      where employee_id = v_employee.id and work_date = v_day
      for update;
      v_found := found;

      v_in := case when p_check_in is null then v_existing.check_in_at
                   else ((v_day::text || ' ' || p_check_in)::timestamp at time zone 'Asia/Kolkata') end;
      v_out := case when p_check_out is null then v_existing.check_out_at
                    else ((v_day::text || ' ' || p_check_out)::timestamp at time zone 'Asia/Kolkata') end;
      if v_in is not null and v_out is not null and v_out < v_in then
        raise exception '% on %: check-out would be before check-in. Fill in both times.',
          v_employee.full_name, to_char(v_day, 'DD Mon YYYY') using errcode = 'check_violation';
      end if;

      if v_found then
        update public.attendance_records
        set check_in_at = v_in,
            check_out_at = v_out,
            work_mode = coalesce(p_work_mode::public.attendance_work_mode, work_mode),
            status_override = case when p_status is null then status_override
                                   when p_status = 'auto' then null
                                   else p_status::public.attendance_day_status end,
            note = v_note
        where id = v_existing.id;
      else
        insert into public.attendance_records (employee_id, work_date, check_in_at, check_out_at, work_mode, status_override, note)
        values (
          v_employee.id, v_day, v_in, v_out,
          coalesce(p_work_mode, 'office')::public.attendance_work_mode,
          case when p_status is null or p_status = 'auto' then null else p_status::public.attendance_day_status end,
          v_note
        );
      end if;

      v_changed := v_changed + 1;
      v_cells := v_cells || jsonb_build_object('employee_id', v_employee.id, 'name', v_employee.full_name, 'date', v_day);
    end loop;
  end loop;

  if v_changed > 0 then
    insert into public.audit_logs (actor_employee_id, actor_name, action, entity_type, entity_id, details)
    values (
      v_actor, coalesce(v_actor_name, 'System'), 'corrected', 'attendance_records', null,
      jsonb_build_object(
        'label', 'for ' || cardinality(v_people) || case when cardinality(v_people) = 1 then ' person' else ' people' end
          || ', ' || case when p_from = p_to then to_char(p_from, 'DD Mon YYYY')
                          else to_char(p_from, 'DD Mon YYYY') || ' to ' || to_char(p_to, 'DD Mon YYYY') end,
        'summary', 'Set ' || array_to_string(v_changes, ', ') || ' on ' || v_changed
          || case when v_changed = 1 then ' day' else ' days' end || ' for ' || array_to_string(v_people, ', ')
          || '. Reason: ' || v_note,
        'from', p_from,
        'to', p_to,
        'changes', to_jsonb(v_changes),
        'note', v_note,
        'days', v_cells
      )
    );
  end if;

  return jsonb_build_object('changed', v_changed, 'on_leave', v_on_leave, 'days_off', v_days_off, 'people', cardinality(v_people));
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.correct_attendance_bulk(uuid[], date, date, text, text, text, text, text) to authenticated;
