import { describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';

import { ApiError } from '../errors';
import { createGradesApi } from '../grades';
import { createRpcCaller, type RpcCaller } from '../rpc';

// Real output of get_grades() for the sample Calc BC course, captured from the
// SQL tests' database (supabase/tests/run_local.sh), so the mapping below is
// checked against what the server actually sends.
import calcSnapshot from './fixtures/calc-snapshot.json';

type RpcResponse = { data: unknown; error: { code: string; message: string } | null };

function fakeClient({
  signedIn = true,
  response,
}: { signedIn?: boolean; response?: RpcResponse } = {}) {
  const rpc = jest.fn(
    async (_fn: string, _args?: object) => response ?? { data: null, error: null },
  );
  const getSession = jest.fn(async () => ({
    data: { session: signedIn ? { access_token: 'jwt' } : null },
    error: null,
  }));
  const client = { rpc, auth: { getSession } } as unknown as SupabaseClient;
  return { client, rpc, getSession };
}

describe('createRpcCaller', () => {
  it('does not call the server when no one is signed in', async () => {
    const { client, rpc } = fakeClient({ signedIn: false });
    const call = createRpcCaller(() => client);

    await expect(call('get_grades')).rejects.toMatchObject({ kind: 'not_signed_in' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes the function name and arguments through', async () => {
    const { client, rpc } = fakeClient({ response: { data: { ok: true }, error: null } });
    const call = createRpcCaller(() => client);

    await expect(
      call('set_forecast', { p_assignment_id: 'a1', p_forecast_score: 9 }),
    ).resolves.toEqual({
      ok: true,
    });
    expect(rpc).toHaveBeenCalledWith('set_forecast', {
      p_assignment_id: 'a1',
      p_forecast_score: 9,
    });
  });

  it('turns server errors into ApiErrors', async () => {
    const { client } = fakeClient({
      response: { data: null, error: { code: 'P0002', message: 'Assignment x not found' } },
    });
    const call = createRpcCaller(() => client);

    const error = await call('set_forecast').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'not_found', message: 'Assignment x not found' });
  });

  it('rejects (instead of throwing) when the API is not configured', async () => {
    const call = createRpcCaller(() => {
      throw new ApiError('not_configured', 'missing');
    });
    await expect(call('get_grades')).rejects.toMatchObject({ kind: 'not_configured' });
  });
});

describe('gradesApi', () => {
  function apiReturning(data: unknown) {
    const call = jest.fn<RpcCaller>(async () => data);
    return { api: createGradesApi(call), call };
  }

  it('getGrades maps the snapshot to app types', async () => {
    const { api, call } = apiReturning(calcSnapshot);
    const snapshot = await api.getGrades();

    expect(call).toHaveBeenCalledWith('get_grades');
    expect(snapshot.computedAt).toBe(calcSnapshot.computed_at);

    const [calc] = snapshot.courses;
    expect(calc.name).toBe('AP Calculus BC');
    expect(calc.gradingMode).toBe('weighted');
    expect(calc.current).toEqual({ percent: 90, letter: 'A-' });
    expect(calc.projected).toEqual({ percent: 89, letter: 'B+' });
    expect(calc.periods.map((p) => p.name)).toEqual(['Q1', 'Q2', 'Midterm Exam']);

    const q1 = calc.periods[0];
    expect(q1).toMatchObject({ kind: 'quarter', semester: 1, currentPercent: 90 });
    expect(q1.categories.find((c) => c.name === 'Homework')).toMatchObject({
      weight: 20,
      dropLowest: 1,
      currentPercent: 90,
    });
    expect(calc.periods[1].currentPercent).toBeNull();

    expect(calc.semesters).toEqual([
      { semester: 1, label: 'Midterm', examWeight: 20, currentPercent: 90, projectedPercent: 89 },
    ]);
    expect(calc.ungraded.map((f) => f.title).sort()).toEqual([
      'Quiz 2.2',
      'Semester 1 Midterm Exam',
      'Unit 3 Test: Integrals',
    ]);
    expect(calc.ungraded.find((f) => f.title === 'Quiz 2.2')).toMatchObject({
      maxScore: 10,
      forecastScore: 9,
      isPlaceholder: false,
    });
  });

  it('loadSampleGradebook calls the sample loader', async () => {
    const { api, call } = apiReturning(null);
    await api.loadSampleGradebook();
    expect(call).toHaveBeenCalledWith('load_sample_gradebook');
  });

  it('getCourseGrades asks for one course', async () => {
    const { api, call } = apiReturning(calcSnapshot);
    const course = await api.getCourseGrades('c1');

    expect(call).toHaveBeenCalledWith('get_grades', { p_course_id: 'c1' });
    expect(course.name).toBe('AP Calculus BC');
  });

  const assignment = {
    id: 'a1',
    category_id: 'cat1',
    student_id: 's1',
    title: 'Quiz 3.1',
    due_date: '2026-10-02',
    max_score: 10,
    actual_score: null,
    forecast_score: 8,
    is_placeholder: true,
  };

  it('addForecast sends the new item and returns the updated course', async () => {
    const course = calcSnapshot.courses[0];
    const { api, call } = apiReturning({ assignment, course });
    const result = await api.addForecast({
      categoryId: 'cat1',
      title: 'Quiz 3.1',
      maxScore: 10,
      forecastScore: 8,
    });

    expect(call).toHaveBeenCalledWith('add_forecast', {
      p_category_id: 'cat1',
      p_title: 'Quiz 3.1',
      p_max_score: 10,
      p_forecast_score: 8,
      p_due_date: null,
    });
    expect(result.assignment).toEqual({
      id: 'a1',
      categoryId: 'cat1',
      title: 'Quiz 3.1',
      dueDate: '2026-10-02',
      maxScore: 10,
      actualScore: null,
      forecastScore: 8,
      isPlaceholder: true,
    });
    expect(result.course.courseId).toBe(course.course_id);
  });

  it('setForecast sends the assignment and score', async () => {
    const { api, call } = apiReturning({ assignment, course: calcSnapshot.courses[0] });
    await api.setForecast('a1', 9.5);
    expect(call).toHaveBeenCalledWith('set_forecast', {
      p_assignment_id: 'a1',
      p_forecast_score: 9.5,
    });
  });

  it('removeForecast handles a deleted placeholder', async () => {
    const { api, call } = apiReturning({ assignment: null, course: calcSnapshot.courses[0] });
    const result = await api.removeForecast('a1');

    expect(call).toHaveBeenCalledWith('remove_forecast', { p_assignment_id: 'a1' });
    expect(result.assignment).toBeNull();
    expect(result.course.name).toBe('AP Calculus BC');
  });
});
