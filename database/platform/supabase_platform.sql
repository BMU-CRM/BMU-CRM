-- Used on Supabase in place of migrations/20261106000000_local_platform.sql. Supabase
-- already provides the database roles (anon, authenticated, service_role), auth.uid(),
-- stored-file records (storage), and private channels (realtime). This adds only what
-- it lacks: scheduled jobs, outgoing web requests, this app's own sign-in tables, and
-- live change messages sent through Supabase Realtime.

-- New tables and functions start open to every role. Each migration then closes what
-- a role should not have, starting with anon. (Supabase sets this too.)
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Scheduled jobs (pg_cron) and outgoing web requests (pg_net). Migrations call
-- cron.schedule and net.http_post exactly as they do on the embedded database.
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('cron.schedule(text, text, text)') is null then
    create extension pg_cron;
  end if;
  if to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') is null then
    create extension pg_net with schema extensions;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Accounts and sessions. Supabase's own auth.users is not used: this app signs
-- people in itself. Only trusted server code reads these tables.
-- ---------------------------------------------------------------------------

create schema app_auth;
revoke all on schema app_auth from public;

create table app_auth.users (
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

-- Only a hash of each session token is stored, so a copy of the database cannot be
-- used to sign in.
create table app_auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_auth.users (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user_idx on app_auth.sessions (user_id);

-- Invitation and password reset links. Each works once.
create table app_auth.one_time_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_auth.users (id) on delete cascade,
  kind text not null check (kind in ('invite', 'recovery')),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index one_time_tokens_user_idx on app_auth.one_time_tokens (user_id, kind);

-- Emails waiting to be sent. Until an email provider is connected, they are kept here
-- and the links are shown to administrators instead.
create table app_auth.outgoing_emails (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  kind text not null,
  subject text not null,
  body text not null,
  link text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index outgoing_emails_to_idx on app_auth.outgoing_emails (to_email, created_at desc);

-- ---------------------------------------------------------------------------
-- Live updates. Tables added to the live_updates publication tell open pages when a
-- row changes, through a Supabase Realtime channel. Only the row's ids are sent;
-- pages then reload what they may see. The channel name is a random value kept in
-- private.app_settings (created by the notifications migration) and given only to
-- signed-in people. Until it exists, nothing is sent.
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
  v_topic text;
begin
  -- The same name src/server/live/realtimeChannels.ts gives the browser.
  select 'changes-' || left(value, 32) into v_topic from private.app_settings where key = 'live_topic';
  if v_topic is null then
    return null;
  end if;

  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    into v_keys
  from jsonb_each(v_row)
  where key = 'id' or key like '%\_id' or key in ('assigned_to', 'created_by');

  perform realtime.send(
    jsonb_build_object('table', tg_table_name, 'event', tg_op, 'row', v_keys),
    'change', v_topic, false
  );
  return null;
exception when others then
  -- A missed live update only delays a page refresh; it must never undo a change.
  return null;
end;
$$;
