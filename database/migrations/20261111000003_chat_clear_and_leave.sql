-- As the owner asked, the chat menu gains Clear chat and Exit group, as in WhatsApp.
--
-- * Clear chat removes every message so far from your own view only. Others still see
--   them, and new messages appear as usual.
-- * Exit group takes you out of a group. If you were its last admin, the longest-standing
--   member becomes admin, so the group is never left without one.

create function public.clear_conversation_for_me(p_conversation uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_count integer;
begin
  if v_actor is null or not public.can_view_conversation(p_conversation) then
    raise exception 'You cannot clear this conversation.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.message_hidden (message_id, employee_id)
  select m.id, v_actor from public.messages m where m.conversation_id = p_conversation
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function public.leave_group(p_conversation uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
begin
  if v_actor is null or not exists (
    select 1 from public.conversations c
    join public.conversation_members m on m.conversation_id = c.id
    where c.id = p_conversation and c.kind = 'group' and m.employee_id = v_actor
  ) then
    raise exception 'You are not in this group.' using errcode = 'check_violation';
  end if;

  delete from public.conversation_members where conversation_id = p_conversation and employee_id = v_actor;

  if not exists (select 1 from public.conversation_members where conversation_id = p_conversation and is_admin) then
    update public.conversation_members set is_admin = true
    where conversation_id = p_conversation
      and employee_id = (
        select employee_id from public.conversation_members
        where conversation_id = p_conversation
        order by created_at, employee_id
        limit 1
      );
  end if;
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.clear_conversation_for_me(uuid) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
