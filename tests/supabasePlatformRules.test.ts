// Checks the Supabase setup path (npm run db:supabase) without a Supabase project: an
// in-memory database is first given stand-ins for the parts Supabase provides itself
// (its own auth tables, storage, realtime, pg_cron and pg_net), shaped like the real
// ones. Every migration is then applied the way it is on Supabase.
import { PGlite } from '@electric-sql/pglite';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { checkPassword, createAuthUser, createSession, findSessionUser } from '@/server/auth/authAccounts';
import { createFounder } from '@/server/auth/founderSetup';
import { isRateLimited } from '@/server/auth/signInRateLimit';
import { applyMigrations } from '@/server/database/migrationRunner';
import { createQueryClient } from '@/server/database/queryClients';
import { broadcastTyping, getChangesTopic, getTypingTopic } from '@/server/live/realtimeChannels';
import { testDatabase } from './helpers/testDatabase';

const supabaseShell = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  create schema extensions;

  -- Supabase Auth's own tables, which this app must leave alone.
  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (
    instance_id uuid, id uuid not null primary key, aud varchar(255), role varchar(255), email varchar(255),
    encrypted_password varchar(255), email_confirmed_at timestamptz, banned_until timestamptz,
    raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz
  );
  create table auth.sessions (id uuid primary key, user_id uuid not null references auth.users (id), created_at timestamptz, aal text);
  create table auth.one_time_tokens (id uuid primary key, user_id uuid not null, token_type text not null, token_hash text not null, relates_to text not null);
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
  $$;

  create schema storage;
  grant usage on schema storage to anon, authenticated, service_role;
  create table storage.buckets (
    id text primary key, name text not null, owner uuid, created_at timestamptz default now(), updated_at timestamptz default now(),
    public boolean default false, file_size_limit bigint, allowed_mime_types text[], owner_id text
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner uuid,
    created_at timestamptz default now(), updated_at timestamptz default now(), metadata jsonb, path_tokens text[], version text,
    owner_id text, user_metadata jsonb, unique (bucket_id, name)
  );
  alter table storage.objects enable row level security;
  grant all on storage.buckets, storage.objects to anon, authenticated, service_role;

  create schema realtime;
  grant usage on schema realtime to anon, authenticated, service_role;
  create table realtime.messages (
    id bigserial primary key, topic text not null, extension text not null default 'broadcast', payload jsonb, event text,
    private boolean default false, inserted_at timestamptz not null default now()
  );
  alter table realtime.messages enable row level security;
  grant select, insert on realtime.messages to anon, authenticated;
  create function realtime.topic() returns text language sql stable as $$ select nullif(current_setting('realtime.topic', true), '') $$;
  create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
  language sql security definer as $$
    insert into realtime.messages (topic, payload, event, private) values (topic, payload, event, private)
  $$;

  -- pg_cron and pg_net, as already enabled extensions.
  create schema cron;
  create table cron.job (jobid bigserial primary key, schedule text not null, command text not null, jobname text unique, active boolean default true);
  create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
    insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
    on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
    returning jobid
  $$;
  create function cron.unschedule(job_name text) returns boolean language sql as $$
    with removed as (delete from cron.job where jobname = job_name returning 1) select exists (select 1 from removed)
  $$;
  create schema net;
  create table net.requests (id bigserial primary key, url text, body jsonb, headers jsonb);
  create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
    headers jsonb default '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds integer default 5000)
  returns bigint language sql security definer as $$
    insert into net.requests (url, body, headers) values (url, body, headers) returning id
  $$;
`;

let db: PGlite;
let applied: string[];

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`set timezone = 'UTC'`);
  await db.exec(supabaseShell);
  applied = await applyMigrations(db, path.resolve('database/migrations'), 'supabase');
});

describe('setting up a Supabase database', () => {
  it('applies every migration, using the Supabase version of the platform one', async () => {
    expect(applied[0]).toBe('20261106000000_local_platform');
    expect(applied.length).toBeGreaterThan(15);
    const { rows } = await db.query<{ found: boolean }>(`select to_regclass('app_auth.users') is not null as found`);
    expect(rows[0]?.found).toBe(true);
  });

  it('is safe to run again', async () => {
    expect(await applyMigrations(db, path.resolve('database/migrations'), 'supabase')).toEqual([]);
  });

  it("keeps the app's accounts apart from Supabase's own auth tables", async () => {
    const { rows } = await db.query<{ target: string }>(
      `select confrelid::regclass::text as target from pg_constraint where conname = 'employees_auth_user_id_fkey'`,
    );
    expect(rows[0]?.target).toBe('app_auth.users');

    const userId = await createAuthUser(db, { email: 'Someone@Example.com', password: 'Password12345' });
    expect(await checkPassword(db, 'someone@example.com', 'Password12345')).toEqual({ status: 'ok', userId });

    const { token } = await createSession(db, userId);
    expect(await findSessionUser(db, token)).toMatchObject({ userId, email: 'someone@example.com', blocked: false });

    const untouched = await db.query<{ users: number; sessions: number }>(
      `select (select count(*)::int from auth.users) as users, (select count(*)::int from auth.sessions) as sessions`,
    );
    expect(untouched.rows[0]).toEqual({ users: 0, sessions: 0 });
  });

  it('counts sign-in attempts in the database', async () => {
    for (let attempt = 1; attempt <= 10; attempt += 1) expect(await isRateLimited(db, 'guess@example.com')).toBe(false);
    expect(await isRateLimited(db, 'GUESS@example.com')).toBe(true);
    expect(await isRateLimited(db, 'someone-else@example.com')).toBe(false);
  });

  it('registers the scheduled jobs with pg_cron', async () => {
    const { rows } = await db.query<{ jobname: string }>('select jobname from cron.job order by jobname');
    expect(rows.map((row) => row.jobname)).toEqual(
      expect.arrayContaining(['process-task-deadlines', 'send-invoice-overdue-reminders']),
    );
  });

  it('creates the private file bucket in Supabase Storage', async () => {
    const { rows } = await db.query<{ public: boolean; file_size_limit: number }>(
      `select public, file_size_limit from storage.buckets where id = 'files'`,
    );
    expect(rows[0]).toEqual({ public: false, file_size_limit: 52428800 });
  });

  it('runs queries as the signed-in user, so row level security applies', async () => {
    const { userId } = await createFounder(db, { name: 'Test Founder', email: 'founder@example.com', password: 'Password12345' });
    const asFounder = createQueryClient(async () => db, { role: 'authenticated', userId });
    const asVisitor = createQueryClient(async () => db, { role: 'anon' });

    const founder = await asFounder.from('employees').select('full_name').eq('work_email', 'founder@example.com').single();
    expect(founder.data?.full_name).toBe('Test Founder');
    const visitor = await asVisitor.from('employees').select('id');
    expect(visitor.data ?? []).toHaveLength(0);
  });

  it('announces changes on the Realtime channel, with ids only', async () => {
    const topic = await getChangesTopic(db);
    expect(topic).toMatch(/^changes-[0-9a-f]{32}$/);

    await db.query(
      `insert into public.notifications (recipient_id, kind, title)
       select id, 'task_overdue', 'A private title' from public.employees where work_email = 'founder@example.com'`,
    );
    const { rows } = await db.query<{ topic: string; event: string; private: boolean; payload: { table: string; row: object } }>(
      `select topic, event, private, payload from realtime.messages where payload ->> 'table' = 'notifications'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ topic, event: 'change', private: false, payload: { table: 'notifications' } });
    expect(JSON.stringify(rows[0]?.payload)).not.toContain('A private title');
  });

  it('sends typing signals on a channel named for the conversation', async () => {
    const conversationId = '11111111-1111-4111-8111-111111111111';
    await broadcastTyping(db, { conversationId, name: 'Test Founder', userId: 'someone' });
    const topic = await getTypingTopic(db, conversationId);
    expect(topic).toMatch(/^typing-[0-9a-f]{32}$/);
    expect(topic).not.toBe(await getTypingTopic(db, '22222222-2222-4222-8222-222222222222'));

    const { rows } = await db.query<{ event: string; payload: { name: string } }>(
      'select event, payload from realtime.messages where topic = $1',
      [topic],
    );
    expect(rows).toEqual([{ event: 'typing', payload: { conversationId, name: 'Test Founder', userId: 'someone' } }]);
  });
});

describe('the embedded database', () => {
  it("moves the app's accounts to app_auth, leaving only auth.uid() in auth", async () => {
    const local = await testDatabase();
    const { rows } = await local.query<{ name: string }>(
      `select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'app_auth' and c.relkind = 'r' order by 1`,
    );
    expect(rows.map((row) => row.name)).toEqual(['one_time_tokens', 'outgoing_emails', 'sessions', 'sign_in_attempts', 'user_identities', 'users']);

    const leftover = await local.query<{ count: number }>(
      `select count(*)::int as count from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'auth' and c.relkind = 'r'`,
    );
    expect(leftover.rows[0]?.count).toBe(0);
  });
});
