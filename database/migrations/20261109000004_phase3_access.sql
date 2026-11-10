-- Phase 3 permissions, grants and real-time updates.

insert into public.permissions (key, module, label, description, allowed_scopes, sort_order) values
  ('files.view', 'Files', 'View files', 'See files beyond those you own, received or work on.', '{own,department,organisation}', 500),
  ('files.upload', 'Files', 'Upload and share files', 'Upload files, add Drive links and send them to colleagues.', '{own}', 510),
  ('messages.use', 'Messages', 'Use messages', 'Send messages and take part in channels.', '{own}', 600),
  ('messages.announce', 'Messages', 'Post announcements', 'Post in the company announcements channel.', '{organisation}', 610);

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, p.key, p.allowed_scopes[array_upper(p.allowed_scopes, 1)]
from public.roles r
cross join public.permissions p
where r.name = 'Founder' and p.sort_order >= 500;

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, m.permission_key, m.scope::public.permission_scope
from (
  select role_name, permission_key, scope
  from (values
    ('Co-Founder', 'files.view', 'organisation'),
    ('Co-Founder', 'messages.announce', 'organisation'),
    ('Branch Manager', 'files.view', 'department'),
    ('Finance Head', 'files.view', 'department'),
    ('Design & Development Head', 'files.view', 'department'),
    ('Digital Marketing Head', 'files.view', 'department'),
    ('Client Manager', 'files.view', 'own'),
    ('Employee', 'files.view', 'own')
  ) as specific (role_name, permission_key, scope)
  union all
  -- Every role except the Founder, which already has everything.
  select r.name, shared.permission_key, 'own'
  from public.roles r
  cross join (values ('files.upload'), ('messages.use')) as shared (permission_key)
  where r.name <> 'Founder'
) m
join public.roles r on r.name = m.role_name;

-- ---------------------------------------------------------------------------
-- Grants. New tables and functions are open to anon by default, so close them again.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

grant select, insert, update, delete on public.files to authenticated;
grant select, insert on public.file_versions to authenticated;
grant select, insert, delete on public.file_shares to authenticated;
grant select on public.file_access_logs to authenticated;
grant select, insert, update on public.file_comments to authenticated;
grant select, update on public.conversations to authenticated;
grant select, insert, delete on public.conversation_members to authenticated;
grant select on public.conversation_reads to authenticated;
grant select, insert, update on public.messages to authenticated;
grant select on public.message_mentions to authenticated;
grant select, update on public.notifications to authenticated;
grant select, insert, update, delete on public.notification_preferences to authenticated;
grant select, delete on public.push_subscriptions to authenticated;

-- The file type check runs as the user who inserts, so they need to call it.
grant execute on function public.is_allowed_file_name(text) to authenticated;
grant execute on function public.can_view_file_row(public.files) to authenticated;
grant execute on function public.can_view_file(uuid) to authenticated;
grant execute on function public.owns_file(uuid) to authenticated;
grant execute on function public.can_upload_file_object(text) to authenticated;
grant execute on function public.can_read_file_object(text) to authenticated;
grant execute on function public.finalize_file_version(uuid) to authenticated;
grant execute on function public.record_file_access(uuid, public.file_access_action, integer) to authenticated;
grant execute on function public.is_conversation_participant(public.conversations, uuid) to authenticated;
grant execute on function public.can_view_conversation_row(public.conversations) to authenticated;
grant execute on function public.can_view_conversation(uuid) to authenticated;
grant execute on function public.can_post_in_conversation(uuid) to authenticated;
grant execute on function public.is_group_admin(uuid) to authenticated;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;
grant execute on function public.create_group_conversation(text, uuid[]) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.get_my_conversations() to authenticated;
grant execute on function public.can_use_conversation_channel(text) to authenticated;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- Only trusted server code may point the database at the app.
revoke execute on function public.configure_notification_dispatch(text, text) from authenticated;
grant execute on function public.configure_notification_dispatch(text, text) to service_role;

-- Not callable through the API at all.
revoke execute on function public.notify(uuid, public.notification_kind, text, text, text, public.notification_priority, text, text) from authenticated;
revoke execute on function public.process_task_deadlines() from authenticated;
revoke execute on function public.get_conversation_participant_ids(uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- Real-time updates. Row level security still decides who receives each change.
-- ---------------------------------------------------------------------------

alter publication live_updates add table public.messages;
alter publication live_updates add table public.conversation_reads;
alter publication live_updates add table public.notifications;
