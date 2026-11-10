-- File management: uploads, Drive links, versions, sharing, comments and access tracking.
-- File contents live in Storage. This schema holds who owns each file, who it was
-- sent to, and what it relates to.

create type public.file_kind as enum ('upload', 'link');
create type public.file_status as enum ('uploading', 'ready');
create type public.file_access_action as enum ('view', 'download');

-- The formats allowed by the brief. Anything else, including programs and web pages,
-- is refused by the database as well as by the storage bucket.
create function public.is_allowed_file_name(p_name text)
returns boolean
language sql immutable set search_path = ''
as $$
  select lower(p_name) ~ '\.(mp4|mov|webm|m4v|avi|mkv|mp3|m4a|aac|wav|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|jpg|jpeg|png|webp|gif|zip)$'
$$;

create table public.files (
  id uuid primary key default gen_random_uuid(),
  kind public.file_kind not null default 'upload',
  status public.file_status not null default 'uploading',
  name text not null check (length(trim(name)) between 1 and 255),
  description text check (length(description) <= 2000),
  mime_type text,
  size_bytes bigint check (size_bytes >= 0),
  external_url text check (external_url ~* '^https?://'),
  current_version integer not null default 1,
  owner_id uuid references public.employees (id) on delete set null,
  -- The uploader's department at the time, shown as the file's source.
  department_id uuid references public.departments (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint files_link_has_address check ((kind = 'link') = (external_url is not null)),
  constraint files_allowed_type check (kind = 'link' or public.is_allowed_file_name(name))
);
create index files_owner_idx on public.files (owner_id, created_at desc);
create index files_client_idx on public.files (client_id);
create index files_project_idx on public.files (project_id);
create index files_task_idx on public.files (task_id);
create index files_department_idx on public.files (department_id);

create table public.file_versions (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files (id) on delete cascade,
  -- Both are always set by prepare_file_version. The defaults only keep them optional
  -- for callers.
  version integer not null default 0,
  original_name text not null check (length(trim(original_name)) between 1 and 255),
  storage_path text not null unique default ('pending/' || gen_random_uuid()),
  size_bytes bigint,
  mime_type text,
  uploaded_by uuid references public.employees (id) on delete set null,
  -- Empty until the upload is confirmed in Storage.
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (file_id, version)
);

create table public.file_shares (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files (id) on delete cascade,
  recipient_employee_id uuid references public.employees (id) on delete cascade,
  recipient_department_id uuid references public.departments (id) on delete cascade,
  shared_by uuid references public.employees (id) on delete set null,
  -- Copied at the time of sharing, so the record of who sent it never changes.
  sender_name text,
  sender_designation text,
  sender_department text,
  note text check (length(note) <= 1000),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint file_shares_one_recipient check (num_nonnulls(recipient_employee_id, recipient_department_id) = 1)
);
create index file_shares_file_idx on public.file_shares (file_id);
create index file_shares_employee_idx on public.file_shares (recipient_employee_id);
create index file_shares_department_idx on public.file_shares (recipient_department_id);
create index file_shares_sender_idx on public.file_shares (shared_by);

create table public.file_access_logs (
  id bigint generated always as identity primary key,
  file_id uuid not null references public.files (id) on delete cascade,
  employee_id uuid,
  employee_name text not null,
  action public.file_access_action not null,
  version integer,
  created_at timestamptz not null default now()
);
create index file_access_logs_file_idx on public.file_access_logs (file_id, id desc);

create table public.file_comments (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 4000),
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index file_comments_file_idx on public.file_comments (file_id, created_at);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

-- Row level policies pass the row itself, so a new row can be read back after insert.
create function public.can_view_file_row(v_file public.files)
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
  -- An unfinished upload is visible only to the person uploading it.
  if v_file.status = 'uploading' then
    return v_file.owner_id = v_actor;
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
     or (v_file.client_id is not null and public.can_view_client(v_file.client_id)) then
    return true;
  end if;

  if v_scope = 'department' and v_department is not null and v_file.department_id = v_department then
    return true;
  end if;

  -- Files sent in a chat are visible to everyone who can read that chat.
  return exists (
    select 1 from public.messages m
    where m.file_id = v_file.id and m.deleted_at is null and public.can_view_conversation(m.conversation_id)
  );
end;
$$;

create function public.can_view_file(p_file uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select public.can_view_file_row(f) from public.files f where f.id = p_file), false)
$$;

create function public.owns_file(p_file uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.files f
    where f.id = p_file and f.owner_id = public.current_employee_id()
  )
$$;

-- Storage paths look like {file id}/v{version}/{name}. Uploading is allowed only to a
-- version slot that the uploader created and has not used yet.
create function public.can_upload_file_object(p_path text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.file_versions v
    join public.files f on f.id = v.file_id
    where v.storage_path = p_path
      and v.uploaded_at is null
      and f.owner_id = public.current_employee_id()
  )
$$;

create function public.can_read_file_object(p_path text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_file_id text := split_part(p_path, '/', 1);
begin
  if v_file_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.can_view_file(v_file_id::uuid);
end;
$$;

-- Confirms an upload by reading its real size and type from Storage, so the browser
-- cannot misreport them.
create function public.finalize_file_version(p_version uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_version public.file_versions;
  v_object record;
begin
  select v.* into v_version
  from public.file_versions v
  join public.files f on f.id = v.file_id
  where v.id = p_version and f.owner_id = public.current_employee_id();

  if not found then
    raise exception 'This upload could not be found.' using errcode = 'insufficient_privilege';
  end if;

  select (o.metadata ->> 'size')::bigint as size, o.metadata ->> 'mimetype' as mimetype
    into v_object
  from storage.objects o
  where o.bucket_id = 'files' and o.name = v_version.storage_path;

  if not found then
    raise exception 'The file has not finished uploading.' using errcode = 'check_violation';
  end if;

  -- Lets guard_file_update accept the real size and status, for this transaction only.
  -- Users cannot set this themselves, because the API only exposes the public schema.
  perform set_config('app.trusted_file_update', 'on', true);

  update public.file_versions
  set uploaded_at = coalesce(uploaded_at, now()), size_bytes = v_object.size, mime_type = v_object.mimetype
  where id = p_version;

  update public.files
  set status = 'ready',
      current_version = greatest(current_version, v_version.version),
      size_bytes = v_object.size,
      mime_type = v_object.mimetype
  where id = v_version.file_id and v_version.version >= current_version;
end;
$$;

create function public.record_file_access(p_file uuid, p_action public.file_access_action, p_version integer)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
begin
  if not public.can_view_file(p_file) then
    raise exception 'You do not have access to this file.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.file_access_logs (file_id, employee_id, employee_name, action, version)
  select p_file, v_actor, e.full_name, p_action, p_version
  from public.employees e where e.id = v_actor;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function public.guard_file_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if v_actor is null then
    raise exception 'Your account is not active.' using errcode = 'insufficient_privilege';
  end if;

  new.owner_id := v_actor;
  select department_id into new.department_id from public.employees where id = v_actor;
  new.status := case when new.kind = 'link' then 'ready' else 'uploading' end::public.file_status;
  new.current_version := 1;
  new.size_bytes := null;
  new.mime_type := null;
  new.is_archived := false;

  if (new.task_id is not null and not public.can_view_task(new.task_id))
     or (new.project_id is not null and not public.can_view_project(new.project_id))
     or (new.client_id is not null and not public.can_view_client(new.client_id)) then
    raise exception 'You cannot attach files to that record.' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger files_guard_insert before insert on public.files
  for each row execute function public.guard_file_insert();

create function public.guard_file_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or pg_trigger_depth() > 1
     or current_setting('app.trusted_file_update', true) = 'on' then
    return new;
  end if;

  if new.owner_id is distinct from old.owner_id
     or new.kind is distinct from old.kind
     or new.status is distinct from old.status
     or new.size_bytes is distinct from old.size_bytes
     or new.mime_type is distinct from old.mime_type
     or new.current_version is distinct from old.current_version
     or new.department_id is distinct from old.department_id then
    raise exception 'This field cannot be changed.' using errcode = 'insufficient_privilege';
  end if;

  if (new.task_id is distinct from old.task_id and new.task_id is not null and not public.can_view_task(new.task_id))
     or (new.project_id is distinct from old.project_id and new.project_id is not null and not public.can_view_project(new.project_id))
     or (new.client_id is distinct from old.client_id and new.client_id is not null and not public.can_view_client(new.client_id)) then
    raise exception 'You cannot attach files to that record.' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger files_guard_update before update on public.files
  for each row execute function public.guard_file_update();

create trigger files_set_updated_at before update on public.files
  for each row execute function public.set_updated_at();

-- Works out the next version number and a safe storage path, so neither can be forged.
create function public.prepare_file_version()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_kind public.file_kind;
begin
  select kind into v_kind from public.files where id = new.file_id;
  if v_kind is distinct from 'upload' then
    raise exception 'Links do not have versions.' using errcode = 'check_violation';
  end if;
  if not public.is_allowed_file_name(new.original_name) then
    raise exception 'This file type is not allowed.' using errcode = 'check_violation';
  end if;

  select coalesce(max(version), 0) + 1 into new.version from public.file_versions where file_id = new.file_id;
  new.storage_path := new.file_id || '/v' || new.version || '/'
    || left(regexp_replace(new.original_name, '[^A-Za-z0-9._-]+', '_', 'g'), 120);
  new.uploaded_at := null;
  new.size_bytes := null;
  new.mime_type := null;
  if (select auth.uid()) is not null then
    new.uploaded_by := public.current_employee_id();
  end if;
  return new;
end;
$$;

create trigger file_versions_prepare before insert on public.file_versions
  for each row execute function public.prepare_file_version();

-- Records who sent the file, with their title and department at that moment.
create function public.stamp_file_share()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
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

create trigger file_shares_stamp before insert on public.file_shares
  for each row execute function public.stamp_file_share();

create trigger file_comments_stamp_created_by before insert or update on public.file_comments
  for each row execute function public.stamp_created_by();
create trigger file_comments_set_updated_at before update on public.file_comments
  for each row execute function public.set_updated_at();

create trigger files_audit after insert or update or delete on public.files
  for each row execute function public.audit_row_change();
create trigger file_shares_audit after insert or delete on public.file_shares
  for each row execute function public.audit_row_change();
create trigger file_versions_audit after insert on public.file_versions
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.files enable row level security;
alter table public.file_versions enable row level security;
alter table public.file_shares enable row level security;
alter table public.file_access_logs enable row level security;
alter table public.file_comments enable row level security;

create policy files_select on public.files for select to authenticated
  using (public.can_view_file_row(files));
create policy files_insert on public.files for insert to authenticated
  with check (public.has_permission('files.upload'));
create policy files_update on public.files for update to authenticated
  using (owner_id = public.current_employee_id())
  with check (owner_id = public.current_employee_id());
-- Only an abandoned upload can be removed. Real files are archived instead.
create policy files_delete on public.files for delete to authenticated
  using (owner_id = public.current_employee_id() and status = 'uploading');

create policy file_versions_select on public.file_versions for select to authenticated
  using (public.can_view_file(file_id));
create policy file_versions_insert on public.file_versions for insert to authenticated
  with check (public.owns_file(file_id));

-- Sharing details are seen by the owner, the sender and the people it was sent to.
create policy file_shares_select on public.file_shares for select to authenticated
  using (
    public.owns_file(file_id)
    or shared_by = public.current_employee_id()
    or recipient_employee_id = public.current_employee_id()
    or recipient_department_id = (select department_id from public.employees where id = public.current_employee_id())
  );
create policy file_shares_insert on public.file_shares for insert to authenticated
  with check (public.owns_file(file_id) and public.has_permission('files.upload'));
create policy file_shares_delete on public.file_shares for delete to authenticated
  using (public.owns_file(file_id) or shared_by = public.current_employee_id());

create policy file_access_logs_select on public.file_access_logs for select to authenticated
  using (public.owns_file(file_id) or public.permission_scope_for('files.view') = 'organisation');

create policy file_comments_select on public.file_comments for select to authenticated
  using (public.can_view_file(file_id));
create policy file_comments_insert on public.file_comments for insert to authenticated
  with check (public.can_view_file(file_id));
create policy file_comments_update on public.file_comments for update to authenticated
  using (created_by = public.current_employee_id())
  with check (created_by = public.current_employee_id());

-- ---------------------------------------------------------------------------
-- Storage bucket. Private: every download needs a short-lived signed link.
-- 50 MB per file. Raise file_size_limit here to allow larger videos.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'files', 'files', false, 52428800,
  array[
    'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/x-msvideo', 'video/x-matroska',
    'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/zip', 'application/x-zip-compressed'
  ]
)
on conflict (id) do nothing;

create policy files_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and public.can_upload_file_object(name));
create policy files_bucket_select on storage.objects for select to authenticated
  using (bucket_id = 'files' and public.can_read_file_object(name));
