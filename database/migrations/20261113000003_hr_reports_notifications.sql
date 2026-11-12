-- Stage 12 of the HR and Finance build: the notifications review.
--
-- Two notifications the plan asked for that did not exist yet:
-- * Employee added: HR and the new person's reporting manager are told when someone is
--   added (by hand, by invitation or by converting a candidate).
-- * Attendance irregularity: each morning, anyone who checked in yesterday but never
--   checked out is reminded to ask for a correction, and HR gets one summary.
-- Both respect each person's notification preferences and push, like every other kind.

create function public.notify_employee_added()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_person uuid;
  v_actor uuid := public.current_employee_id();
  v_department text;
begin
  select name into v_department from public.departments where id = new.department_id;
  for v_person in
    select id from public.employees_with_permission('hr.dashboard', 'organisation') as h (id)
    union select new.reporting_manager_id where new.reporting_manager_id is not null
  loop
    if v_person is distinct from v_actor and v_person <> new.id then
      perform public.notify(v_person, 'employee_added', new.full_name || ' was added',
        coalesce(v_department, 'No department') || coalesce(', joining ' || to_char(new.joining_date, 'DD Mon YYYY'), ''),
        '/people/employees/' || new.id, 'normal', null, 'employee-added:' || new.id);
    end if;
  end loop;
  return null;
end;
$$;

create trigger employees_notify_added after insert on public.employees
  for each row execute function public.notify_employee_added();

-- Each morning: yesterday's check-ins without a check-out.
create function public.send_attendance_irregularities()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_day date := public.india_today() - 1;
  v_row record;
  v_person uuid;
  v_count integer := 0;
begin
  for v_row in
    select a.employee_id
    from public.attendance_records a
    join public.employees e on e.id = a.employee_id and e.is_active
    where a.work_date = v_day and a.check_in_at is not null and a.check_out_at is null
  loop
    v_count := v_count + 1;
    perform public.notify(v_row.employee_id, 'attendance_irregularity', 'You did not check out yesterday',
      'Your attendance for ' || to_char(v_day, 'DD Mon YYYY') || ' has a check-in but no check-out. Ask HR to correct it.',
      '/attendance', 'normal', null, 'no-checkout:' || v_row.employee_id || ':' || v_day);
  end loop;

  if v_count > 0 then
    for v_person in select id from public.employees_with_permission('attendance.manage', 'organisation') as h (id) loop
      perform public.notify(v_person, 'attendance_irregularity',
        v_count || case when v_count = 1 then ' person' else ' people' end || ' did not check out yesterday',
        'Attendance for ' || to_char(v_day, 'DD Mon YYYY') || ' needs correcting.',
        '/attendance/report?month=' || to_char(v_day, 'YYYY-MM'), 'normal', null, 'no-checkout-summary:' || v_day);
    end loop;
  end if;
  return v_count;
end;
$$;

-- 08:45 in India.
select cron.schedule('send-attendance-irregularities', '15 3 * * *', $$select public.send_attendance_irregularities()$$);

revoke execute on all functions in schema public from public, anon;
