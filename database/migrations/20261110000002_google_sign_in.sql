-- Google sign-in through Firebase. Firebase only proves which Google account someone
-- holds; the app still decides who may enter. A Google account is linked to an
-- invited login the first time it is used, and from then on only that Google account
-- can sign in to it. If the email address is later given to a different Google
-- account, that account is refused.

create table app_auth.user_identities (
  provider text not null check (provider in ('google')),
  -- Google's own id for the account. It never changes, even if the email does.
  provider_user_id text not null,
  user_id uuid not null references app_auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  primary key (provider, provider_user_id),
  unique (user_id, provider)
);
