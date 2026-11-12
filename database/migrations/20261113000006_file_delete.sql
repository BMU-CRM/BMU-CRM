-- Deleting a file for good, from the Files list and the file's page.
--
-- The owner may delete their own file; people who can see every file may delete any.
-- A file that is a receipt or bill on a money record is kept, because the accounts rely
-- on it: archive it instead. Deleting removes its versions, shares, comments and access
-- history; chats and records that pointed at it keep their place without the file. The
-- deletion is written to the audit log by the existing files trigger.

create function public.delete_file(p_file uuid)
returns table (storage_path text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_file public.files;
begin
  select * into v_file from public.files where id = p_file for update;
  if v_actor is null or v_file.id is null
     or not (v_file.owner_id = v_actor or public.permission_scope_for('files.view') = 'organisation') then
    raise exception 'You do not have permission to delete this file.' using errcode = 'insufficient_privilege';
  end if;

  if exists (select 1 from public.expense_records where receipt_file_id = p_file)
     or exists (select 1 from public.income_records where file_id = p_file)
     or exists (select 1 from public.vendor_bills where file_id = p_file)
     or exists (select 1 from public.reimbursements where receipt_file_id = p_file) then
    raise exception 'This file is a receipt or bill on a money record, so it is kept for the accounts. Archive it instead.'
      using errcode = 'check_violation';
  end if;

  return query select v.storage_path from public.file_versions v where v.file_id = p_file;
  delete from public.files where id = p_file;
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.delete_file(uuid) to authenticated;
