-- =============================================================================
-- Gradebook: course → grading period → category → assignment, plus letter
-- scales, forecasts, score history, imports, targets, upcoming items, and sync.
--
-- The hierarchy matches mobile/src/data/types.ts, so the app's local gradebook
-- (F13) maps 1:1 onto these tables for cloud sync (F14).
--
-- Every row carries `student_id`. Child tables use composite foreign keys
-- (parent_id, student_id) so a row can never point at another student's parent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enum types
-- -----------------------------------------------------------------------------

-- `weighted`: each category counts for a fixed percent.
-- `points`:   every point counts equally.                               (F07)
create type public.grading_mode as enum ('weighted', 'points');

-- `quarter`:       a normal grading period (Q1…Q4).
-- `semester_exam`: a midterm or final exam that blends into a semester grade (F10).
-- `other`:         anything else (for example a trimester or a summer term).
create type public.period_kind as enum ('quarter', 'semester_exam', 'other');

-- Where a piece of data came from.                            (F04, F05, F06, F01)
create type public.data_source as enum ('manual', 'screenshot', 'report', 'sample');

create type public.score_kind as enum ('actual', 'forecast');

-- -----------------------------------------------------------------------------
-- grading_scales + grading_scale_bands: percent → letter grade (F07)
-- A scale with student_id NULL is a built-in scale every student can use.
-- -----------------------------------------------------------------------------
create table public.grading_scales (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid references public.profiles (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

create table public.grading_scale_bands (
  scale_id    uuid not null references public.grading_scales (id) on delete cascade,
  letter      text not null check (char_length(letter) between 1 and 3),
  -- Lowest percent that still earns this letter.
  min_percent numeric(5, 2) not null check (min_percent >= 0),
  primary key (scale_id, letter),
  unique (scale_id, min_percent)
);

-- The default US +/- scale.
insert into public.grading_scales (id, student_id, name)
values ('00000000-0000-0000-0000-000000000001', null, 'US +/- (default)');

insert into public.grading_scale_bands (scale_id, letter, min_percent)
select '00000000-0000-0000-0000-000000000001', letter, min_percent
from (values
  ('A+', 97), ('A', 93), ('A-', 90),
  ('B+', 87), ('B', 83), ('B-', 80),
  ('C+', 77), ('C', 73), ('C-', 70),
  ('D+', 67), ('D', 63), ('D-', 60),
  ('F', 0)
) as bands (letter, min_percent);

-- -----------------------------------------------------------------------------
-- imports: one row per committed import, for history and undo (F04, F05, F06)
-- -----------------------------------------------------------------------------
create table public.imports (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.profiles (id) on delete cascade,
  source        public.data_source not null,
  -- Original file name for a saved report, when there was one.
  file_name     text,
  rows_imported integer not null default 0 check (rows_imported >= 0),
  created_at    timestamptz not null default now(),
  unique (id, student_id)
);

-- -----------------------------------------------------------------------------
-- courses (F02, F03)
-- -----------------------------------------------------------------------------
create table public.courses (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.profiles (id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 200),
  teacher          text,
  grading_mode     public.grading_mode not null default 'weighted',
  -- NULL means the default US +/- scale.
  grading_scale_id uuid references public.grading_scales (id) on delete set null,
  -- For example '2026-27'.
  school_year      text,
  source           public.data_source not null default 'manual',
  position         integer not null default 0,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, student_id)
);

create index courses_student_idx on public.courses (student_id, position);

-- -----------------------------------------------------------------------------
-- grading_periods: Q1, Q2, midterm exam, … (F03, F10)
-- -----------------------------------------------------------------------------
create table public.grading_periods (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null,
  student_id uuid not null,
  name       text not null check (char_length(name) between 1 and 100),
  kind       public.period_kind not null default 'quarter',
  -- 1 or 2. When NULL, the grade views infer it from the name (Q1/Q2/Midterm → 1,
  -- Q3/Q4/Final → 2), as F10 describes.
  semester   smallint check (semester in (1, 2)),
  -- Share of the course grade. For a semester exam this is instead the exam's
  -- share of the semester grade (NULL → user_settings.default_exam_weight).
  -- When no period in a course has a weight, all periods count equally.
  weight     numeric(6, 2) check (weight >= 0),
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, student_id),
  foreign key (course_id, student_id)
    references public.courses (id, student_id) on delete cascade
);

create index grading_periods_course_idx on public.grading_periods (course_id, position);

-- -----------------------------------------------------------------------------
-- categories: Tests, Quizzes, Homework, … (F03, F07)
-- -----------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  period_id   uuid not null,
  student_id  uuid not null,
  name        text not null check (char_length(name) between 1 and 100),
  -- Percent of the period grade in a weighted course. Ignored in a points course.
  -- When no category in a period has a weight, all categories count equally.
  weight      numeric(6, 2) check (weight >= 0),
  -- How many of the lowest scores in this category are dropped.
  drop_lowest smallint not null default 0 check (drop_lowest >= 0),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, student_id),
  foreign key (period_id, student_id)
    references public.grading_periods (id, student_id) on delete cascade
);

create index categories_period_idx on public.categories (period_id, position);

-- -----------------------------------------------------------------------------
-- assignments (F03, F04, F05, F06, F07, F08)
--
-- Forecasts and actual grades live side by side:
--   * actual_score   — the real grade from Schoology (import or manual entry).
--   * forecast_score — the grade the student expects to get.
-- The "projected" grade uses actual_score when there is one and falls back to
-- forecast_score. Recording an actual grade therefore overrides the forecast
-- everywhere, while the forecast itself is kept so the app can show how
-- accurate the student's forecasts were.
--
-- A forecast for work that is not in Schoology yet is a placeholder row:
-- is_placeholder = true, actual_score NULL, forecast_score set. When the real
-- assignment is imported, the app sets actual_score on the placeholder and
-- clears is_placeholder (see record_actual_score in the grade engine file).
-- -----------------------------------------------------------------------------
create table public.assignments (
  id                  uuid primary key default gen_random_uuid(),
  category_id         uuid not null,
  student_id          uuid not null,
  title               text not null check (char_length(title) between 1 and 300),
  due_date            date,
  max_score           numeric(8, 2) not null check (max_score >= 0),
  actual_score        numeric(8, 2) check (actual_score >= 0),
  forecast_score      numeric(8, 2) check (forecast_score >= 0),
  -- Excused assignments never count toward the grade.
  excused             boolean not null default false,
  -- Extra-credit points add to the earned total without adding to the possible total.
  extra_credit        boolean not null default false,
  is_placeholder      boolean not null default false,
  source              public.data_source not null default 'manual',
  import_id           uuid,
  actual_recorded_at  timestamptz,
  forecast_updated_at timestamptz,
  position            integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, student_id),
  foreign key (category_id, student_id)
    references public.categories (id, student_id) on delete cascade,
  foreign key (import_id, student_id)
    references public.imports (id, student_id) on delete set null (import_id),
  -- A normal assignment needs points possible; only extra credit may be out of 0.
  check (extra_credit or max_score > 0),
  -- A placeholder is a forecast only; once it has an actual grade it is real.
  check (not (is_placeholder and actual_score is not null))
);

create index assignments_category_idx on public.assignments (category_id, position);
create index assignments_student_due_idx on public.assignments (student_id, due_date);

-- Stamp when each kind of score last changed.
create or replace function public.stamp_assignment_scores()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.actual_score is not null then new.actual_recorded_at := coalesce(new.actual_recorded_at, now()); end if;
    if new.forecast_score is not null then new.forecast_updated_at := coalesce(new.forecast_updated_at, now()); end if;
  else
    if new.actual_score is distinct from old.actual_score then new.actual_recorded_at := now(); end if;
    if new.forecast_score is distinct from old.forecast_score then new.forecast_updated_at := now(); end if;
  end if;
  return new;
end;
$$;

create trigger assignments_stamp_scores
  before insert or update on public.assignments
  for each row execute function public.stamp_assignment_scores();

-- -----------------------------------------------------------------------------
-- score_history: every change to an actual or forecast score
-- Used for "grade over time" and forecast-accuracy reports.
-- -----------------------------------------------------------------------------
create table public.score_history (
  id            bigint generated always as identity primary key,
  assignment_id uuid not null,
  student_id    uuid not null,
  kind          public.score_kind not null,
  old_score     numeric(8, 2),
  new_score     numeric(8, 2),
  changed_at    timestamptz not null default now(),
  foreign key (assignment_id, student_id)
    references public.assignments (id, student_id) on delete cascade
);

create index score_history_assignment_idx on public.score_history (assignment_id, changed_at);

-- SECURITY DEFINER because students may not write score_history directly.
create or replace function public.log_score_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.actual_score is not null then
      insert into public.score_history (assignment_id, student_id, kind, old_score, new_score)
      values (new.id, new.student_id, 'actual', null, new.actual_score);
    end if;
    if new.forecast_score is not null then
      insert into public.score_history (assignment_id, student_id, kind, old_score, new_score)
      values (new.id, new.student_id, 'forecast', null, new.forecast_score);
    end if;
  else
    if new.actual_score is distinct from old.actual_score then
      insert into public.score_history (assignment_id, student_id, kind, old_score, new_score)
      values (new.id, new.student_id, 'actual', old.actual_score, new.actual_score);
    end if;
    if new.forecast_score is distinct from old.forecast_score then
      insert into public.score_history (assignment_id, student_id, kind, old_score, new_score)
      values (new.id, new.student_id, 'forecast', old.forecast_score, new.forecast_score);
    end if;
  end if;
  return null;
end;
$$;

create trigger assignments_log_scores
  after insert or update of actual_score, forecast_score on public.assignments
  for each row execute function public.log_score_change();

-- -----------------------------------------------------------------------------
-- grade_targets: "I want at least X% in this course" (F09)
-- -----------------------------------------------------------------------------
create table public.grade_targets (
  id                 uuid primary key default gen_random_uuid(),
  course_id          uuid not null,
  student_id         uuid not null,
  target_percent     numeric(5, 2) not null check (target_percent between 0 and 200),
  -- The remaining item to solve for, usually the final exam.
  solve_for_assignment_id uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (course_id),
  foreign key (course_id, student_id)
    references public.courses (id, student_id) on delete cascade,
  foreign key (solve_for_assignment_id, student_id)
    references public.assignments (id, student_id) on delete set null (solve_for_assignment_id)
);

-- -----------------------------------------------------------------------------
-- upcoming_items: the agenda from the Schoology iCal feed (F11)
--
-- The feed URL itself is NOT stored here. It contains a password-equivalent
-- token, so per F11 it stays in the phone's secure storage and is never shared.
-- -----------------------------------------------------------------------------
create table public.upcoming_items (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles (id) on delete cascade,
  -- NULL = "Unfiled": the feed does not name the class and no title matched.
  course_id    uuid,
  -- The event's UID from the iCal feed, so re-fetching updates instead of duplicating.
  external_uid text not null,
  title        text not null,
  due_at       timestamptz not null,
  url          text,
  fetched_at   timestamptz not null default now(),
  unique (student_id, external_uid),
  foreign key (course_id, student_id)
    references public.courses (id, student_id) on delete set null (course_id)
);

create index upcoming_items_due_idx on public.upcoming_items (student_id, due_at);

-- -----------------------------------------------------------------------------
-- sync_state: one row per student for opt-in cloud sync (F14)
-- Each push bumps `revision`; a device whose last-seen revision is behind pulls.
-- -----------------------------------------------------------------------------
create table public.sync_state (
  student_id            uuid primary key references public.profiles (id) on delete cascade,
  revision              bigint not null default 0,
  last_pushed_at        timestamptz,
  last_pushed_device_id uuid references public.user_devices (id) on delete set null
);

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
create trigger courses_set_updated_at before update on public.courses
  for each row execute function public.set_updated_at();
create trigger grading_periods_set_updated_at before update on public.grading_periods
  for each row execute function public.set_updated_at();
create trigger categories_set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger assignments_set_updated_at before update on public.assignments
  for each row execute function public.set_updated_at();
create trigger grade_targets_set_updated_at before update on public.grade_targets
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Row-level security
-- -----------------------------------------------------------------------------
alter table public.grading_scales      enable row level security;
alter table public.grading_scale_bands enable row level security;
alter table public.imports             enable row level security;
alter table public.courses             enable row level security;
alter table public.grading_periods     enable row level security;
alter table public.categories          enable row level security;
alter table public.assignments         enable row level security;
alter table public.score_history       enable row level security;
alter table public.grade_targets       enable row level security;
alter table public.upcoming_items      enable row level security;
alter table public.sync_state          enable row level security;

-- Built-in scales are readable by everyone signed in; custom scales only by their owner.
create policy "grading_scales: read built-in and own" on public.grading_scales
  for select to authenticated
  using (student_id is null or student_id = (select auth.uid()));
create policy "grading_scales: write own" on public.grading_scales
  for all to authenticated
  using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));

create policy "grading_scale_bands: read built-in and own" on public.grading_scale_bands
  for select to authenticated
  using (exists (
    select 1 from public.grading_scales s
    where s.id = scale_id and (s.student_id is null or s.student_id = (select auth.uid()))
  ));
create policy "grading_scale_bands: write own" on public.grading_scale_bands
  for all to authenticated
  using (exists (
    select 1 from public.grading_scales s
    where s.id = scale_id and s.student_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.grading_scales s
    where s.id = scale_id and s.student_id = (select auth.uid())
  ));

-- Every other gradebook table: a student reads and writes only their own rows.
do $$
declare
  t text;
begin
  foreach t in array array[
    'imports', 'courses', 'grading_periods', 'categories', 'assignments',
    'grade_targets', 'upcoming_items', 'sync_state'
  ] loop
    execute format(
      'create policy "%1$s: own rows" on public.%1$I for all to authenticated
         using (student_id = (select auth.uid()))
         with check (student_id = (select auth.uid()))', t);
  end loop;
end;
$$;

-- History is written by the trigger; students can read it but not edit it.
create policy "score_history: read own" on public.score_history
  for select to authenticated using (student_id = (select auth.uid()));
