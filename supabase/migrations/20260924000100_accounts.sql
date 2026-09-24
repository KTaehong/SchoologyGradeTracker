-- =============================================================================
-- Accounts: student profiles, sign-in methods, devices, and settings.
--
-- Sign-in itself is handled by Supabase Auth (the `auth` schema). Every student
-- gets one row in `auth.users`; this file adds the app's own data around it.
-- Feature IDs (F01…F14) refer to docs/mvp.md.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shared helper: keep `updated_at` current on every UPDATE.
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Enum types
-- -----------------------------------------------------------------------------

-- How the student signs in. Mirrors the provider names Supabase Auth uses.
-- 'email' = email + password or magic link, 'phone' = SMS one-time code,
-- 'azure' = Microsoft (school Office 365 accounts).
create type public.login_provider as enum ('email', 'phone', 'google', 'apple', 'azure');

create type public.device_platform as enum ('ios', 'android', 'web');

-- Biometric unlock is a device feature, not a sign-in method: the phone checks
-- the face or fingerprint, then unlocks the Supabase session saved in the
-- Keychain / Keystore. The database only records which devices have it on.
create type public.biometric_kind as enum ('face_id', 'touch_id', 'android_fingerprint', 'android_face');

create type public.theme_preference as enum ('system', 'light', 'dark');

-- -----------------------------------------------------------------------------
-- profiles: one row per student (1:1 with auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  full_name       text not null check (char_length(full_name) between 1 and 100),
  -- Lowercase letters, digits, underscore, dot. Stored lowercase so the plain
  -- UNIQUE constraint is case-insensitive.
  username        text not null unique
                  check (username ~ '^[a-z0-9_.]{3,30}$'),
  -- Copied from auth.users by the triggers below; auth.users is the source of truth.
  email           text,
  -- E.164 format, for example +12065550123.
  phone           text check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  school_name     text,
  graduation_year smallint check (graduation_year between 2000 and 2100),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.profiles is 'A student account. One row per auth.users row.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- login_methods: which ways a student can sign in (F14)
-- -----------------------------------------------------------------------------
create table public.login_methods (
  student_id uuid not null references public.profiles (id) on delete cascade,
  provider   public.login_provider not null,
  linked_at  timestamptz not null default now(),
  primary key (student_id, provider)
);

comment on table public.login_methods is
  'Sign-in methods linked to a student. Kept in step with auth.users by a trigger.';

-- -----------------------------------------------------------------------------
-- user_devices: phones signed in to the account, and biometric unlock (F14)
-- -----------------------------------------------------------------------------
create table public.user_devices (
  id                       uuid primary key default gen_random_uuid(),
  student_id               uuid not null references public.profiles (id) on delete cascade,
  -- Random ID the app generates once per install.
  installation_id          text not null,
  device_name              text not null,
  platform                 public.device_platform not null,
  app_version              text,
  biometric_kind           public.biometric_kind,
  biometric_unlock_enabled boolean not null default false,
  last_synced_at           timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (student_id, installation_id),
  -- Biometric unlock can only be on when the device has a biometric sensor.
  check (not biometric_unlock_enabled or biometric_kind is not null)
);

create trigger user_devices_set_updated_at
  before update on public.user_devices
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- user_settings: per-student preferences (F01, F10, F12, F14)
-- -----------------------------------------------------------------------------
create table public.user_settings (
  student_id              uuid primary key references public.profiles (id) on delete cascade,
  theme                   public.theme_preference not null default 'system',
  sync_enabled            boolean not null default false,
  -- Weight of a semester exam when the exam period has no weight of its own (F10).
  default_exam_weight     numeric(5, 2) not null default 20
                          check (default_exam_weight between 0 and 100),
  onboarding_completed_at timestamptz,
  updated_at              timestamptz not null default now()
);

create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Keep profiles and login_methods in step with Supabase Auth.
--
-- The app passes full_name, username, and phone as sign-up metadata:
--   supabase.auth.signUp({ email, password,
--     options: { data: { full_name, username, phone } } })
-- OAuth sign-ups (Google, Apple, Microsoft) send a name but no username, so a
-- username is generated; the student can change it later.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wanted_username text := lower(meta ->> 'username');
begin
  if wanted_username is null
     or wanted_username !~ '^[a-z0-9_.]{3,30}$'
     or exists (select 1 from public.profiles p where p.username = wanted_username) then
    wanted_username := 'student_' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;

  insert into public.profiles (id, full_name, username, email, phone)
  values (
    new.id,
    coalesce(nullif(meta ->> 'full_name', ''), nullif(meta ->> 'name', ''), 'Student'),
    wanted_username,
    new.email,
    coalesce(nullif(new.phone, ''), nullif(meta ->> 'phone', ''))
  );

  insert into public.user_settings (student_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.handle_auth_user_contact_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set email = new.email,
         phone = coalesce(nullif(new.phone, ''), phone)
   where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_contact_changed
  after update of email, phone on auth.users
  for each row execute function public.handle_auth_user_contact_change();

-- Record which sign-in methods are linked. Supabase Auth lists them in
-- auth.users.raw_app_meta_data -> 'providers' and updates that list whenever
-- the student links or unlinks Google, Apple, and so on.
create or replace function public.sync_login_methods()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked text[] := array(
    select jsonb_array_elements_text(coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb))
    intersect
    select unnest(enum_range(null::public.login_provider))::text
  );
begin
  delete from public.login_methods
   where student_id = new.id and provider::text <> all (linked);

  insert into public.login_methods (student_id, provider)
  select new.id, p::public.login_provider from unnest(linked) as p
  on conflict do nothing;
  return new;
end;
$$;

-- Named to sort after on_auth_user_created, so the profile exists first.
create trigger on_auth_user_providers_changed
  after insert or update of raw_app_meta_data on auth.users
  for each row execute function public.sync_login_methods();

-- -----------------------------------------------------------------------------
-- Row-level security: a student can only see and change their own rows.
-- -----------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.login_methods enable row level security;
alter table public.user_devices  enable row level security;
alter table public.user_settings enable row level security;

-- Profiles are created by the sign-up trigger and deleted with the auth user,
-- so students may only read and update their own.
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Login methods are managed by Supabase Auth; students can only read them.
create policy "login_methods: read own" on public.login_methods
  for select to authenticated using (student_id = (select auth.uid()));

create policy "user_devices: own rows" on public.user_devices
  for all to authenticated
  using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));

create policy "user_settings: read own" on public.user_settings
  for select to authenticated using (student_id = (select auth.uid()));
create policy "user_settings: update own" on public.user_settings
  for update to authenticated
  using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));

-- Email and phone come from Supabase Auth; students change them through
-- supabase.auth.updateUser(), not by editing the profile row.
revoke update on public.profiles from authenticated;
grant update (full_name, username, school_name, graduation_year) on public.profiles to authenticated;
