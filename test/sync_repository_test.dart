import 'dart:convert';

import 'package:bessy/data/api_client.dart';
import 'package:bessy/data/sync_repository.dart';
import 'package:bessy/domain/models/assignment.dart';
import 'package:bessy/domain/models/category.dart';
import 'package:bessy/domain/models/course.dart';
import 'package:bessy/domain/models/grading_period.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

Course _sampleCourse() => const Course(
      sectionId: 's1',
      title: 'Calculus BC AP',
      periods: [
        GradingPeriod(id: 'q1', title: 'Quarter 1', categories: [
          Category(id: 'c1', title: 'Tests', weight: 1.0, assignments: [
            Assignment(id: 'a1', title: 'Test 1', earned: 95, maxPoints: 100),
          ]),
        ]),
      ],
    );

void main() {
  final base = Uri.parse('https://api.bessy.test');

  test('pushGradebook serializes courses and parses the change report', () async {
    late Map<String, dynamic> sentBody;
    final mock = MockClient((req) async {
      expect(req.method, 'PUT');
      expect(req.url.path, '/v1/gradebook');
      expect(req.headers['authorization'], 'Bearer tok123');
      sentBody = jsonDecode(req.body) as Map<String, dynamic>;
      return http.Response(
        jsonEncode({
          'updatedAt': '2026-09-13T00:00:00.000Z',
          'changes': [
            {'type': 'posted', 'course': 'Calculus BC AP', 'assignment': 'Test 1'},
          ],
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    final repo = SyncRepository(ApiClient(baseUrl: base, httpClient: mock), () => 'tok123');

    final outcome = await repo.pushGradebook([_sampleCourse()]);

    // The request carried the course JSON in the server's expected shape.
    final courses = sentBody['courses'] as List;
    expect(courses.single['title'], 'Calculus BC AP');
    expect(courses.single['periods'][0]['categories'][0]['assignments'][0]['earned'], 95);
    // The change report parsed back.
    expect(outcome.changes.single.type, 'posted');
    expect(outcome.changes.single.assignment, 'Test 1');
  });

  test('fetchCourses maps server JSON back into domain Courses', () async {
    final mock = MockClient((req) async {
      expect(req.method, 'GET');
      expect(req.url.path, '/v1/gradebook');
      return http.Response(
        jsonEncode({
          'updatedAt': '2026-09-13T00:00:00.000Z',
          'courses': [_sampleCourse().toJson()],
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    final repo = SyncRepository(ApiClient(baseUrl: base, httpClient: mock), () => 'tok');

    final courses = await repo.fetchCourses();
    expect(courses, hasLength(1));
    expect(courses.single.sectionId, 's1');
    expect(courses.single.periods.single.categories.single.assignments.single.earned, 95);
  });

  test('fetchCourse finds the matching section', () async {
    final mock = MockClient((req) async => http.Response(
        jsonEncode({'courses': [_sampleCourse().toJson()]}), 200,
        headers: {'content-type': 'application/json'}));
    final repo = SyncRepository(ApiClient(baseUrl: base, httpClient: mock), () => 'tok');
    expect((await repo.fetchCourse('s1')).title, 'Calculus BC AP');
    expect(() => repo.fetchCourse('missing'), throwsStateError);
  });

  test('requires a signed-in token', () async {
    final mock = MockClient((req) async => http.Response('{}', 200));
    final repo = SyncRepository(ApiClient(baseUrl: base, httpClient: mock), () => null);
    expect(() => repo.fetchCourses(), throwsStateError);
  });

  test('non-2xx surfaces as ApiClientException with the server error code', () async {
    final mock = MockClient((req) async => http.Response(
        jsonEncode({'error': 'account_disabled'}), 403,
        headers: {'content-type': 'application/json'}));
    final api = ApiClient(baseUrl: base, httpClient: mock);
    expect(
      () => api.pullGradebook('tok'),
      throwsA(isA<ApiClientException>()
          .having((e) => e.status, 'status', 403)
          .having((e) => e.code, 'code', 'account_disabled')),
    );
  });

  test('login parses the session', () async {
    final mock = MockClient((req) async => http.Response(
        jsonEncode({
          'user': {'id': 'u_1', 'email': 'a@b.com', 'role': 'student'},
          'accessToken': 'at',
          'refreshToken': 'rt',
        }),
        200,
        headers: {'content-type': 'application/json'}));
    final api = ApiClient(baseUrl: base, httpClient: mock);
    final session = await api.logIn('a@b.com', 'password1');
    expect(session.userId, 'u_1');
    expect(session.accessToken, 'at');
  });
}
