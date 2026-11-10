-- The building blocks the app expects from its database platform: database roles,
-- user accounts, stored-file records, scheduled jobs, outgoing requests and live
-- change messages. They run inside the app's own embedded Postgres, so nothing
-- else needs installing.

-- ---------------------------------------------------------------------------
-- Roles. Every query from the app runs as one of these, so row level security
-- always applies. service_role is for trusted server code only.
-- ---------------------------------------------------------------------------

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

grant usage on schema public to anon, authenticated, service_role;

-- New tables and functions start open to every role. Each migration then closes
-- what a role should not have, starting with anon.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Accounts and sessions. Only trusted server code reads these tables.
-- ---------------------------------------------------------------------------

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  encrypted_password text,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  last_sign_in_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only a hash of each session token is stored, so a copy of the database cannot
-- be used to sign in.
create table auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user_idx on auth.sessions (user_id);

-- Invitation and password reset links. Each works once.
create table auth.one_time_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('invite', 'recovery')),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index one_time_tokens_user_idx on auth.one_time_tokens (user_id, kind);

-- Emails waiting to be sent. Until an email provider is connected, they are kept
-- here and the links are shown to administrators instead.
create table auth.outgoing_emails (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  kind text not null,
  subject text not null,
  body text not null,
  link text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index outgoing_emails_to_idx on auth.outgoing_emails (to_email, created_at desc);

-- The signed-in user for the current query. The app sets it for each request.
create function auth.uid()
returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Stored files. The bytes live on disk; these rows describe them, and the policies
-- added by the files migration decide who may store and read each one.
-- ---------------------------------------------------------------------------

create schema storage;
grant usage on schema storage to authenticated, service_role;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now()
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets (id),
  name text not null,
  owner uuid default auth.uid(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;
grant select on storage.buckets to authenticated, service_role;
grant select, insert, delete on storage.objects to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Scheduled jobs. Migrations register them with cron.schedule, and the app runs
-- each one when its schedule is due.
-- ---------------------------------------------------------------------------

create schema cron;

create table cron.job (
  jobid bigserial primary key,
  jobname text not null unique,
  schedule text not null,
  command text not null,
  active boolean not null default true,
  last_run_at timestamptz
);

create function cron.schedule(job_name text, schedule text, command text)
returns bigint
language sql
as $$
  insert into cron.job (jobname, schedule, command)
  values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid
$$;

create function cron.unschedule(job_name text)
returns boolean
language sql
as $$
  with removed as (delete from cron.job where jobname = job_name returning 1)
  select exists (select 1 from removed)
$$;

-- ---------------------------------------------------------------------------
-- Outgoing web requests. The database queues them, and the app sends them once the
-- transaction has committed.
-- ---------------------------------------------------------------------------

create schema net;

create table net.http_request_queue (
  id bigserial primary key,
  method text not null default 'POST',
  url text not null,
  headers jsonb not null default '{}'::jsonb,
  body jsonb,
  timeout_milliseconds integer not null default 5000,
  created_at timestamptz not null default now()
);

create function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds integer default 5000
)
returns bigint
language plpgsql
security definer set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into net.http_request_queue (url, headers, body, timeout_milliseconds)
  values (url, headers, body, timeout_milliseconds)
  returning id into v_id;
  perform pg_notify('net_requests', v_id::text);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Live updates. Tables added to the live_updates publication tell open pages when
-- a row changes. Only the row's ids are sent; pages then reload what they may see.
-- ---------------------------------------------------------------------------

create publication live_updates;

create schema live;

create function live.broadcast_change()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_keys jsonb;
begin
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    into v_keys
  from jsonb_each(v_row)
  where key = 'id' or key like '%\_id' or key in ('assigned_to', 'created_by');

  perform pg_notify('live_changes', jsonb_build_object('table', tg_table_name, 'event', tg_op, 'row', v_keys)::text);
  return null;
end;
$$;

-- Private chat channels check membership against these, through policies added by
-- the messaging migration.
create schema realtime;
grant usage on schema realtime to authenticated;

create table realtime.messages (
  id bigserial primary key,
  topic text not null,
  extension text not null default 'broadcast',
  payload jsonb,
  event text,
  private boolean not null default true,
  inserted_at timestamptz not null default now()
);
alter table realtime.messages enable row level security;
grant select, insert on realtime.messages to authenticated;

create function realtime.topic()
returns text
language sql stable
as $$
  select nullif(current_setting('realtime.topic', true), '')
$$;
grant execute on function realtime.topic() to authenticated;
