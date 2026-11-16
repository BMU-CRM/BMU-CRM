-- As the owner asked:
--
-- * Emoji reactions on chat messages, as in WhatsApp: one reaction per person per
--   message. Choosing another emoji replaces it, choosing the same one takes it back.
-- * GIFs and stickers in chat, picked from GIPHY. Only GIPHY's own image addresses are
--   stored, so a message can never point at some other site.
-- Emoji in the text itself need nothing here: they are ordinary characters.

-- ---------------------------------------------------------------------------
-- GIFs and stickers
-- ---------------------------------------------------------------------------

alter table public.messages
  add column gif_kind text check (gif_kind in ('gif', 'sticker')),
  add column gif_url text check (
    gif_url is null
    or (length(gif_url) <= 1000 and gif_url ~ '^https://(media[0-9]*|i)\.giphy\.com/[^[:space:]"''<>\\]+$')
  ),
  add column gif_title text check (gif_title is null or length(gif_title) <= 200),
  add column gif_width integer check (gif_width is null or gif_width between 1 and 2000),
  add column gif_height integer check (gif_height is null or gif_height between 1 and 2000),
  add constraint messages_gif_shape check ((gif_kind is null) = (gif_url is null));

alter table public.messages drop constraint messages_not_empty;
alter table public.messages add constraint messages_not_empty check (
  deleted_at is not null or length(trim(body)) > 0 or file_id is not null
  or contact_employee_id is not null or meeting_id is not null or poll_question is not null
  or gif_url is not null
);

-- The conversation list and notifications say "GIF" or "Sticker".
create or replace function public.message_preview(v_message public.messages)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when v_message.deleted_at is not null then 'Message deleted'
    when length(trim(v_message.body)) > 0 then v_message.body
    when v_message.poll_question is not null then 'Poll: ' || v_message.poll_question
    when v_message.meeting_id is not null then 'Event: ' || coalesce(
      (select m.title from public.meetings m where m.id = v_message.meeting_id), 'a meeting')
    when v_message.contact_employee_id is not null then 'Contact: ' || coalesce(
      (select e.full_name from public.employees e where e.id = v_message.contact_employee_id), 'a colleague')
    when v_message.gif_kind = 'sticker' then 'Sticker'
    when v_message.gif_kind = 'gif' then 'GIF'
    else 'Sent a file'
  end
$$;

-- As before (20261111000002), plus: a GIF or sticker cannot be swapped once sent, and
-- deleting a message for everyone removes it.
create or replace function public.guard_message_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_is_author boolean;
  v_in_time boolean;
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  v_is_author := old.author_id = v_actor;
  v_in_time := now() - old.created_at <= interval '5 minutes';

  if new.conversation_id is distinct from old.conversation_id
     or new.author_id is distinct from old.author_id
     or new.created_at is distinct from old.created_at
     or new.reply_to_id is distinct from old.reply_to_id
     or new.edited_at is distinct from old.edited_at
     or new.deleted_by is distinct from old.deleted_by
     or new.pinned_by is distinct from old.pinned_by
     or new.forwarded is distinct from old.forwarded then
    raise exception 'This field cannot be changed.' using errcode = 'insufficient_privilege';
  end if;

  if old.deleted_at is not null then
    raise exception 'This message has been deleted.' using errcode = 'check_violation';
  end if;

  if new.deleted_at is not null then
    -- Announcements can be taken down by whoever may post them, at any time.
    if not (
      (v_is_author and v_in_time)
      or ((select kind from public.conversations where id = old.conversation_id) = 'announcement'
          and public.has_permission('messages.announce'))
    ) then
      raise exception '%', case when v_is_author
          then 'Messages can only be deleted for everyone within 5 minutes of sending. You can still delete it for yourself.'
          else 'You can only delete your own messages for everyone.' end
        using errcode = 'insufficient_privilege';
    end if;
    new.deleted_at := now();
    new.deleted_by := v_actor;
    new.body := '';
    new.file_id := null;
    new.contact_employee_id := null;
    new.meeting_id := null;
    new.poll_question := null;
    new.poll_options := null;
    new.poll_allows_multiple := false;
    new.gif_kind := null;
    new.gif_url := null;
    new.gif_title := null;
    new.gif_width := null;
    new.gif_height := null;
    new.pinned_at := null;
    new.pinned_by := null;
    return new;
  end if;

  if new.contact_employee_id is distinct from old.contact_employee_id
     or new.meeting_id is distinct from old.meeting_id
     or new.poll_question is distinct from old.poll_question
     or new.poll_options is distinct from old.poll_options
     or new.poll_allows_multiple is distinct from old.poll_allows_multiple
     or new.gif_kind is distinct from old.gif_kind
     or new.gif_url is distinct from old.gif_url
     or new.gif_title is distinct from old.gif_title
     or new.gif_width is distinct from old.gif_width
     or new.gif_height is distinct from old.gif_height then
    raise exception 'Cards, polls, GIFs and stickers cannot be changed once sent.' using errcode = 'check_violation';
  end if;

  if new.body is distinct from old.body or new.file_id is distinct from old.file_id then
    if not v_is_author then
      raise exception 'You can only edit your own messages.' using errcode = 'insufficient_privilege';
    end if;
    if new.file_id is distinct from old.file_id then
      raise exception 'Attachments cannot be changed.' using errcode = 'check_violation';
    end if;
    if not v_in_time then
      raise exception 'Messages can only be edited within 5 minutes of sending.' using errcode = 'check_violation';
    end if;
    new.edited_at := now();
  end if;

  if new.pinned_at is distinct from old.pinned_at then
    if not public.can_post_in_conversation(old.conversation_id) then
      raise exception 'You cannot pin messages here.' using errcode = 'insufficient_privilege';
    end if;
    new.pinned_at := case when new.pinned_at is null then null else now() end;
    new.pinned_by := case when new.pinned_at is null then null else v_actor end;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reactions
-- ---------------------------------------------------------------------------

create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  -- Kept here so open chats hear about new reactions in their own conversation.
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  -- One emoji, which can take several characters (skin tones, flags, joined emoji).
  -- Letters, digits, spaces and markup are refused.
  emoji text not null check (char_length(emoji) between 1 and 16 and emoji !~ '[[:alnum:][:space:]<>&"'']'),
  created_at timestamptz not null default now(),
  primary key (message_id, employee_id)
);
create index message_reactions_conversation_idx on public.message_reactions (conversation_id);

-- Sets the person's reaction to a message. An empty emoji takes it back. Anyone who can
-- read the conversation can react, so people can react to announcements too.
create function public.react_to_message(p_message uuid, p_emoji text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_message public.messages;
  v_emoji text := nullif(trim(coalesce(p_emoji, '')), '');
begin
  select * into v_message from public.messages where id = p_message;
  if v_actor is null or not found or v_message.deleted_at is not null
     or not public.can_view_conversation(v_message.conversation_id) then
    raise exception 'You cannot react to this message.' using errcode = 'insufficient_privilege';
  end if;

  if v_emoji is null then
    delete from public.message_reactions where message_id = p_message and employee_id = v_actor;
    return;
  end if;

  insert into public.message_reactions (message_id, conversation_id, employee_id, emoji)
  values (p_message, v_message.conversation_id, v_actor, v_emoji)
  on conflict (message_id, employee_id) do update set emoji = excluded.emoji, created_at = now();
end;
$$;

-- A message deleted for everyone loses its reactions too.
create function public.clear_deleted_message_reactions()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.message_reactions where message_id = new.id;
  return null;
end;
$$;

create trigger messages_clear_reactions after update of deleted_at on public.messages
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.clear_deleted_message_reactions();

alter table public.message_reactions enable row level security;
-- Reactions change only through react_to_message.
create policy message_reactions_select on public.message_reactions for select to authenticated
  using (public.can_view_conversation(conversation_id));

alter publication live_updates add table public.message_reactions;

-- ---------------------------------------------------------------------------
-- Grants. New tables and functions start open to anon, so close them again.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

grant select on public.message_reactions to authenticated;

grant execute on function public.message_preview(public.messages) to authenticated;
grant execute on function public.react_to_message(uuid, text) to authenticated;
