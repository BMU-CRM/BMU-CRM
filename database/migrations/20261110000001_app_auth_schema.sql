-- Moves the app's own sign-in tables from the auth schema to app_auth. Hosted Postgres
-- services such as Supabase keep their own tables in auth, so this keeps the two
-- apart and lets the same code run on both. On Supabase the tables are created in
-- app_auth from the start, so there is nothing to move.

do $$
begin
  if to_regclass('app_auth.users') is null then
    create schema app_auth;
    alter table auth.users set schema app_auth;
    alter table auth.sessions set schema app_auth;
    alter table auth.one_time_tokens set schema app_auth;
    alter table auth.outgoing_emails set schema app_auth;
  end if;
end;
$$;

revoke all on schema app_auth from public;

-- Sign-in and password reset attempts, to slow down password guessing. Kept in the
-- database rather than in memory, because on Vercel many copies of the app run at
-- once and each would otherwise keep its own count.
create table app_auth.sign_in_attempts (
  key text not null,
  attempted_at timestamptz not null default now()
);
create index sign_in_attempts_key_idx on app_auth.sign_in_attempts (key, attempted_at);
