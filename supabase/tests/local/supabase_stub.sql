-- Minimal stand-in for the parts of Supabase the migrations use, so they can be
-- tested on a plain local Postgres. NOT for use on Supabase itself.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;

create table auth.users (
  instance_id        uuid,
  id                 uuid primary key,
  aud                text,
  role               text,
  email_confirmed_at timestamptz,
  updated_at         timestamptz,
  email              text,
  phone              text,
  raw_user_meta_data jsonb,
  raw_app_meta_data  jsonb,
  created_at         timestamptz default now(),
  -- Used by demo_accounts.sql (accounts that can sign in).
  encrypted_password     text,
  confirmation_token     text,
  recovery_token         text,
  email_change           text,
  email_change_token_new text
);

create table auth.identities (
  id              uuid primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  provider        text not null,
  provider_id     text not null,
  identity_data   jsonb not null,
  last_sign_in_at timestamptz,
  created_at      timestamptz,
  updated_at      timestamptz,
  unique (provider_id, provider)
);

-- Supabase keeps pgcrypto (crypt, gen_salt) in the `extensions` schema. Only
-- demo_accounts.sql needs it, so carry on where it is not installed (the
-- in-memory database used by `npm test`).
create schema extensions;
do $$
begin
  create extension pgcrypto with schema extensions;
exception when others then
  raise notice 'pgcrypto is not available; demo_accounts.sql cannot run here.';
end;
$$;

create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
