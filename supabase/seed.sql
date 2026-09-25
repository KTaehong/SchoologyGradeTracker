-- =============================================================================
-- Sample data: three demo students with gradebooks.
--
-- Run this after the migrations (Supabase SQL Editor: paste and Run).
-- Running it again does nothing, so it is safe to repeat.
--
--   Ana Park   — the sample gradebook, with forecasts not yet replaced.
--   Ben Ortiz  — the sample gradebook, with some forecasts replaced by actual grades.
--   Chris Lee  — one class built by hand (manual entry, F06).
--
-- The demo students exist only for SQL queries. They have no password, so
-- nobody can sign in as them.
-- =============================================================================

do $$
declare
  ana   constant uuid := '11111111-1111-4111-8111-111111111111';
  ben   constant uuid := '22222222-2222-4222-8222-222222222222';
  chris constant uuid := '33333333-3333-4333-8333-333333333333';
  v_course uuid;
  v_period uuid;
  v_cat    uuid;
begin
  if exists (select 1 from auth.users where id in (ana, ben, chris)) then
    raise notice 'Sample data is already loaded. Nothing to do.';
    return;
  end if;

  -- 1. Accounts. The sign-up triggers create profiles, settings, and login methods.
  insert into auth.users
    (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at,
     raw_app_meta_data, raw_user_meta_data)
  values
    ('00000000-0000-0000-0000-000000000000', ana, 'authenticated', 'authenticated',
     'ana.park@example.com', now(), now(), now(),
     '{"provider": "email", "providers": ["email", "google"]}',
     '{"full_name": "Ana Park", "username": "ana_park", "phone": "+12065550101"}'),
    ('00000000-0000-0000-0000-000000000000', ben, 'authenticated', 'authenticated',
     'ben.ortiz@example.com', now(), now(), now(),
     '{"provider": "apple", "providers": ["apple"]}',
     '{"full_name": "Ben Ortiz", "username": "ben_ortiz"}'),
    ('00000000-0000-0000-0000-000000000000', chris, 'authenticated', 'authenticated',
     'chris.lee@example.com', now(), now(), now(),
     '{"provider": "email", "providers": ["email"]}',
     '{"full_name": "Chris Lee", "username": "chris_lee", "phone": "+13055550199"}');

  update public.profiles set school_name = 'American Heritage School', graduation_year = 2027
   where id in (ana, ben, chris);
  update public.user_settings set theme = 'dark', sync_enabled = true, onboarding_completed_at = now()
   where student_id = ana;
  update public.user_settings set sync_enabled = true, onboarding_completed_at = now()
   where student_id in (ben, chris);

  insert into public.user_devices
    (student_id, installation_id, device_name, platform, app_version, biometric_kind, biometric_unlock_enabled, last_synced_at)
  values
    (ana,   'demo-ana-iphone',   'Ana''s iPhone 16',  'ios',     '0.1.0', 'face_id',             true,  now()),
    (ana,   'demo-ana-ipad',     'Ana''s iPad',       'ios',     '0.1.0', 'touch_id',            false, now() - interval '2 days'),
    (ben,   'demo-ben-pixel',    'Ben''s Pixel 9',    'android', '0.1.0', 'android_fingerprint', true,  now()),
    (chris, 'demo-chris-galaxy', 'Chris''s Galaxy',   'android', '0.1.0', null,                  false, now());

  -- 2. Ana and Ben get the sample gradebook (5 AP courses, forecasts, upcoming items).
  perform public.load_sample_gradebook(ana);
  perform public.load_sample_gradebook(ben);

  -- 3. Ben's real grades arrived: replace some forecasts with actual scores.
  perform public.record_actual_score(a.id, s.score)
  from public.assignments a
  join (values
    ('Quiz 2.2', 7),
    ('Unit 3 Test: Integrals', 94),
    ('Semester 1 Midterm Exam', 91)
  ) as s (title, score) on s.title = a.title
  where a.student_id = ben;

  -- Ben wants 92% in Calc and asks what he needs (F09).
  insert into public.grade_targets (course_id, student_id, target_percent, solve_for_assignment_id)
  select c.id, ben, 92, null
  from public.courses c
  where c.student_id = ben and c.name = 'AP Calculus BC';

  -- 4. Chris built one class by hand (F06): a points course with default sections.
  insert into public.imports (student_id, source, rows_imported) values (chris, 'manual', 6);

  insert into public.courses (student_id, name, teacher, grading_mode, school_year, source)
  values (chris, 'Honors Chemistry', 'Mrs. Alvarez', 'points', '2026-27', 'manual')
  returning id into v_course;

  insert into public.grading_periods (course_id, student_id, name, kind, semester, position)
  values (v_course, chris, 'Q1', 'quarter', 1, 1)
  returning id into v_period;

  insert into public.categories (period_id, student_id, name, position)
  values (v_period, chris, 'Tests', 1) returning id into v_cat;
  insert into public.assignments (category_id, student_id, title, actual_score, forecast_score, max_score, due_date, source, position)
  values
    (v_cat, chris, 'Atomic Structure Test', 78, null, 100, current_date - 20, 'manual', 1),
    (v_cat, chris, 'Periodic Trends Test',  null, 85,  100, current_date + 6,  'manual', 2);

  insert into public.categories (period_id, student_id, name, position)
  values (v_period, chris, 'Quizzes', 2) returning id into v_cat;
  insert into public.assignments (category_id, student_id, title, actual_score, max_score, due_date, source, position)
  values
    (v_cat, chris, 'Quiz: Isotopes',        9, 10, current_date - 25, 'manual', 1),
    (v_cat, chris, 'Quiz: Electron Config', 8, 10, current_date - 12, 'manual', 2);

  insert into public.categories (period_id, student_id, name, position)
  values (v_period, chris, 'Homework', 3) returning id into v_cat;
  insert into public.assignments (category_id, student_id, title, actual_score, max_score, excused, due_date, source, position)
  values
    (v_cat, chris, 'Lab Safety Worksheet', 10, 10, false, current_date - 28, 'manual', 1),
    (v_cat, chris, 'Mole Practice',        null, 10, true, current_date - 5,  'manual', 2);

  insert into public.upcoming_items (student_id, course_id, external_uid, title, due_at)
  values (chris, v_course, 'demo-chris-1', 'Periodic Trends Test',
          date_trunc('day', now()) + interval '6 days 23 hours 59 minutes');

  raise notice 'Loaded 3 demo students: ana_park, ben_ortiz, chris_lee.';
end;
$$;
