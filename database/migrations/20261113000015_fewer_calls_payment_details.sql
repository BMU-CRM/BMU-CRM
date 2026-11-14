-- Fewer calls to the website from the database, and payment details on documents.
--
-- * Opening a conversation marks it read only when there is something new to read.
--   Before, every visit rewrote the read time. Each rewrite told the other people with
--   the conversation open to reload, which rewrote their read time in turn: two people
--   with the same chat open kept reloading each other's page.
-- * A notification is sent to the website for pushing only when its recipient can get
--   it: they have a device with notifications on, have not turned this kind off, and
--   are not on "Do not disturb". The website made the same checks after being called.
-- * The bank account and UPI details printed on quotations and invoices, with a UPI QR
--   code image to scan.

create or replace function public.mark_conversation_read(p_conversation uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_previous timestamptz;
  v_has_read boolean;
  v_new integer;
begin
  if v_actor is null or not public.can_view_conversation(p_conversation) then
    return;
  end if;

  select last_read_at, true into v_previous, v_has_read
  from public.conversation_reads where conversation_id = p_conversation and employee_id = v_actor;

  insert into public.message_reads (message_id, employee_id)
  select m.id, v_actor
  from public.messages m
  where m.conversation_id = p_conversation
    and m.author_id is distinct from v_actor
    and m.deleted_at is null
    and m.created_at > coalesce(v_previous, '-infinity'::timestamptz)
  on conflict do nothing;
  get diagnostics v_new = row_count;

  -- Only when something new was read, or the conversation was never opened, so a
  -- visit with nothing new changes nothing and tells nobody.
  if v_new > 0 or v_has_read is null then
    insert into public.conversation_reads (conversation_id, employee_id, last_read_at)
    values (p_conversation, v_actor, now())
    on conflict (conversation_id, employee_id) do update set last_read_at = now();
  end if;

  -- Reading the conversation also clears its message and mention notifications.
  update public.notifications
  set read_at = now()
  where recipient_id = v_actor
    and read_at is null
    and link = '/messages/' || p_conversation;
end;
$$;

create or replace function private.dispatch_notification()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  -- A grouped notification is pushed again at most every two minutes.
  if tg_op = 'UPDATE' and (
    new.event_count = old.event_count
    or (old.pushed_at is not null and old.pushed_at > now() - interval '2 minutes')
  ) then
    return null;
  end if;

  -- Nobody to push to: no device, this kind turned off, or "Do not disturb".
  if not exists (select 1 from public.push_subscriptions s where s.employee_id = new.recipient_id)
     or exists (
       select 1 from public.notification_preferences p
       where p.employee_id = new.recipient_id and p.kind = new.kind and not p.push_enabled
     )
     or exists (
       select 1 from public.employee_presence p
       where p.employee_id = new.recipient_id and p.chosen_status = 'do_not_disturb'
     ) then
    return null;
  end if;

  select value into v_url from private.app_settings where key = 'notification_dispatch_url';
  select value into v_secret from private.app_settings where key = 'notification_dispatch_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', v_secret),
    -- Sending to a push service can take several seconds.
    timeout_milliseconds := 15000
  );
  return null;
end;
$$;

alter table public.finance_settings
  add column bank_account_name text check (length(bank_account_name) <= 120),
  add column bank_account_number text check (bank_account_number ~ '^[0-9A-Za-z]{6,20}$'),
  add column bank_ifsc text check (bank_ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  add column bank_swift text check (bank_swift ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$'),
  add column bank_name text check (length(bank_name) <= 120),
  add column upi_id text check (upi_id ~ '^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9.-]{2,64}$'),
  -- A small image, resized by the app, kept in the row like signatures are.
  add column upi_qr_image text check (upi_qr_image ~ '^data:image/(png|webp);base64,[A-Za-z0-9+/=]+$' and length(upi_qr_image) <= 400000);

-- The company's account, filled in only where nothing has been entered yet.
update public.finance_settings set
  bank_account_name = coalesce(bank_account_name, 'BUILD MY UNIVERSEE'),
  bank_account_number = coalesce(bank_account_number, '10270074116'),
  bank_ifsc = coalesce(bank_ifsc, 'IDFB0080156'),
  bank_swift = coalesce(bank_swift, 'IDFBINBBMUM'),
  bank_name = coalesce(bank_name, 'IDFC FIRST Bank, Jayanagar Branch'),
  upi_id = coalesce(upi_id, 'buildmyuniversee@idfcbank');

revoke execute on all functions in schema public from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
