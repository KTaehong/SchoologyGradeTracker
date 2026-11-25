import 'package:bessy_server/bessy_server.dart';
import 'package:test/test.dart';

import 'support/api.dart';

/// Q1: Tests 60% (Test 1 = 80/100, Test 2 ungraded), Homework 40% (10/10).
/// Current Q1 grade = 0.6 * 0.8 + 0.4 * 1.0 = 0.88.
List<dynamic> gradebook() => [
      {
        'sectionId': 'calc',
        'title': 'Calculus',
        'periods': [
          {
            'id': 'q1',
            'title': 'Quarter 1',
            'categories': [
              {
                'id': 'tests',
                'title': 'Tests',
                'weight': 0.6,
                'assignments': [
                  {'id': 't1', 'title': 'Test 1', 'earned': 80, 'maxPoints': 100},
                  {'id': 't2', 'title': 'Test 2', 'earned': null, 'maxPoints': 100},
                ],
              },
              {
                'id': 'hw',
                'title': 'Homework',
                'weight': 0.4,
                'assignments': [
                  {'id': 'h1', 'title': 'HW 1', 'earned': 10, 'maxPoints': 10},
                ],
              },
            ],
          },
        ],
      },
    ];

void main() {
  late Api api;
  late String token;

  setUp(() async {
    api = Api(BessyApp(hasher: const PasswordHasher(iterations: 500)));
    token = (await api.call('POST', '/v1/auth/signup',
            json: {'email': 's@b.com', 'password': 'password1'}))
        .body['accessToken'] as String;
    await api.call('PUT', '/v1/gradebook',
        json: {'courses': gradebook()}, token: token);
  });

  Map<String, dynamic> overall(Map<String, dynamic> snapshot, String which) =>
      snapshot[which]['overall'] as Map<String, dynamic>;

  group('grade snapshot', () {
    test('requires a bearer token', () async {
      expect((await api.call('GET', '/v1/grades')).status, 401);
      expect((await api.call('GET', '/v1/grades/calc/forecasts')).status, 401);
    });

    test('lists every course with its computed grade', () async {
      final r = await api.call('GET', '/v1/grades', token: token);
      expect(r.status, 200);
      final course = (r.body['courses'] as List).single as Map<String, dynamic>;
      expect(course['sectionId'], 'calc');
      expect(overall(course, 'current')['percent'], closeTo(0.88, 1e-9));
      expect(overall(course, 'current')['letter'], 'B+');
      expect(course['projected'], isNull);
      final q1 = (course['current']['periods'] as List).single;
      expect((q1['categories'] as List).map((c) => c['id']), ['tests', 'hw']);
      expect(r.body['updatedAt'], isNotNull);
    });

    test('an empty gradebook gives an empty list', () async {
      final other = (await api.call('POST', '/v1/auth/signup',
              json: {'email': 'new@b.com', 'password': 'password1'}))
          .body['accessToken'] as String;
      final r = await api.call('GET', '/v1/grades', token: other);
      expect(r.status, 200);
      expect(r.body['courses'], isEmpty);
    });

    test('one course by section id, 404 for an unknown one', () async {
      final r = await api.call('GET', '/v1/grades/calc', token: token);
      expect(r.status, 200);
      expect(r.body['title'], 'Calculus');
      final missing = await api.call('GET', '/v1/grades/nope', token: token);
      expect(missing.status, 404);
      expect(missing.body['error'], 'course_not_found');
    });

    test('section ids are URL-decoded', () async {
      final synced = gradebook();
      synced[0]['sectionId'] = 'calc 1/A';
      await api.call('PUT', '/v1/gradebook', json: {'courses': synced}, token: token);
      final id = Uri.encodeComponent('calc 1/A');
      final r = await api.call('GET', '/v1/grades/$id', token: token);
      expect(r.status, 200);
      expect(r.body['sectionId'], 'calc 1/A');
      final f = await api.call('POST', '/v1/grades/$id/forecasts',
          json: {'periodId': 'q1', 'categoryId': 'tests', 'assignmentId': 't2', 'earned': 90},
          token: token);
      expect(f.status, 201);
    });

    test('sync rejects a gradebook the engine cannot read', () async {
      final r = await api.call('PUT', '/v1/gradebook',
          json: {
            'courses': [
              {'title': 'no section id'},
            ],
          },
          token: token);
      expect(r.status, 400);
      expect(r.body['error'], 'invalid_course');
    });
  });

  group('forecasts', () {
    Future<({int status, Map<String, dynamic> body})> add(Map<String, dynamic> json) =>
        api.call('POST', '/v1/grades/calc/forecasts', json: json, token: token);

    test('predicting an ungraded assignment projects a new grade', () async {
      final r = await add(
          {'periodId': 'q1', 'categoryId': 'tests', 'assignmentId': 't2', 'earned': 100});
      expect(r.status, 201);
      final grade = r.body['grade'] as Map<String, dynamic>;
      expect(overall(grade, 'current')['percent'], closeTo(0.88, 1e-9));
      expect(overall(grade, 'projected')['percent'], closeTo(0.94, 1e-9));
      expect(grade['activeForecasts'], 1);
      final entry = (r.body['forecasts'] as List).single;
      expect(entry['status'], 'active');
      expect(entry['id'], isNotEmpty);
    });

    test('adding a new hypothetical assignment', () async {
      final r = await add({
        'periodId': 'q1',
        'categoryId': 'tests',
        'title': 'Test 3',
        'earned': 50,
        'maxPoints': 100,
      });
      expect(r.status, 201);
      // Tests (80 + 50) / 200 = 0.65 → 0.6 * 0.65 + 0.4 = 0.79
      expect(overall(r.body['grade'], 'projected')['percent'], closeTo(0.79, 1e-9));
    });

    test('forecasts persist and show up in the overview', () async {
      await add({'periodId': 'q1', 'categoryId': 'tests', 'assignmentId': 't2', 'earned': 100});
      final list = await api.call('GET', '/v1/grades/calc/forecasts', token: token);
      expect(list.body['forecasts'], hasLength(1));
      final overview = await api.call('GET', '/v1/grades', token: token);
      final course = (overview.body['courses'] as List).single;
      expect(overall(course, 'projected')['percent'], closeTo(0.94, 1e-9));
    });

    test('predicting the same assignment again replaces the old prediction', () async {
      await add({'periodId': 'q1', 'categoryId': 'tests', 'assignmentId': 't2', 'earned': 60});
      final r = await add(
          {'periodId': 'q1', 'categoryId': 'tests', 'assignmentId': 't2', 'earned': 100});
      expect(r.body['forecasts'], hasLength(1));
      expect((r.body['forecasts'] as List).single['earned'], 100);
    });

    test('rejects bad input', () async {
      final graded = await add(
          {'periodId': 'q1', 'categoryId': 'tests', 'assignmentId': 't1', 'earned': 90});
      expect(graded.status, 409);
      expect(graded.body['error'], 'assignment_already_graded');

      final missingTarget = await add(
          {'periodId': 'q1', 'categoryId': 'tests', 'assignmentId': 'zzz', 'earned': 90});
      expect(missingTarget.status, 404);
      expect(missingTarget.body['error'], 'target_not_found');

      final noTitle = await add({'periodId': 'q1', 'categoryId': 'tests', 'earned': 90});
      expect(noTitle.status, 400);

      final negative = await add(
          {'periodId': 'q1', 'categoryId': 'tests', 'assignmentId': 't2', 'earned': -1});
      expect(negative.status, 400);

      final unknownCourse = await api.call('POST', '/v1/grades/nope/forecasts',
          json: {'periodId': 'q1', 'categoryId': 'tests', 'assignmentId': 't2', 'earned': 1},
          token: token);
      expect(unknownCourse.status, 404);
    });

    test('a real score posting supersedes the forecast', () async {
      await add({'periodId': 'q1', 'categoryId': 'tests', 'assignmentId': 't2', 'earned': 100});
      final synced = gradebook();
      synced[0]['periods'][0]['categories'][0]['assignments'][1]['earned'] = 70;
      await api.call('PUT', '/v1/gradebook', json: {'courses': synced}, token: token);

      final r = await api.call('GET', '/v1/grades/calc/forecasts', token: token);
      expect((r.body['forecasts'] as List).single['status'], 'superseded');
      expect(r.body['grade']['projected'], isNull);
      // Tests (80 + 70) / 200 = 0.75 → 0.6 * 0.75 + 0.4 = 0.85
      expect(overall(r.body['grade'], 'current')['percent'], closeTo(0.85, 1e-9));
    });

    test('delete one, then clear all', () async {
      final a = await add(
          {'periodId': 'q1', 'categoryId': 'tests', 'assignmentId': 't2', 'earned': 100});
      await add(
          {'periodId': 'q1', 'categoryId': 'hw', 'title': 'HW 2', 'earned': 5, 'maxPoints': 10});
      final id = (a.body['forecasts'] as List).first['id'];

      final del = await api.call('DELETE', '/v1/grades/calc/forecasts/$id', token: token);
      expect(del.status, 200);
      expect(del.body['forecasts'], hasLength(1));

      final again = await api.call('DELETE', '/v1/grades/calc/forecasts/$id', token: token);
      expect(again.status, 404);

      final clear = await api.call('DELETE', '/v1/grades/calc/forecasts', token: token);
      expect(clear.body['forecasts'], isEmpty);
    });

    test("one student can't see another's forecasts", () async {
      await add({'periodId': 'q1', 'categoryId': 'tests', 'assignmentId': 't2', 'earned': 100});
      final other = (await api.call('POST', '/v1/auth/signup',
              json: {'email': 'other@b.com', 'password': 'password1'}))
          .body['accessToken'] as String;
      await api.call('PUT', '/v1/gradebook',
          json: {'courses': gradebook()}, token: other);
      final r = await api.call('GET', '/v1/grades/calc/forecasts', token: other);
      expect(r.body['forecasts'], isEmpty);
    });
  });
}
