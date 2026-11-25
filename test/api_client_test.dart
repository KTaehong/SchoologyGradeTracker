import 'dart:convert';

import 'package:bessy/data/api_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:grade_core/grade_core.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

AuthSession _session(String access, [String refresh = 'rt1']) => AuthSession(
      userId: 'u_1',
      email: 'a@b.com',
      role: 'student',
      accessToken: access,
      refreshToken: refresh,
    );

http.Response _json(Object body, [int status = 200]) => http.Response(
    jsonEncode(body), status,
    headers: {'content-type': 'application/json'});

Map<String, dynamic> _snapshotJson({double? projected}) {
  Map<String, dynamic> grade(double p, String l) => {
        'overall': {'percent': p, 'letter': l},
        'periods': [
          {
            'id': 'q1',
            'title': 'Quarter 1',
            'grade': {'percent': p, 'letter': l},
            'categories': [
              {'id': 'tests', 'title': 'Tests', 'weight': 1.0, 'percent': p},
            ],
          },
        ],
        'semesters': [],
      };
  return {
    'sectionId': 'calc 1/A',
    'title': 'Calculus',
    'current': grade(0.88, 'B+'),
    'projected': projected == null ? null : grade(projected, 'A'),
    'activeForecasts': projected == null ? 0 : 1,
  };
}

void main() {
  final base = Uri.parse('https://api.bessy.test');

  group('grade engine endpoints', () {
    test('fetchGrades parses the overview', () async {
      final mock = MockClient((req) async {
        expect(req.method, 'GET');
        expect(req.url.path, '/v1/grades');
        expect(req.headers['authorization'], 'Bearer at');
        return _json({
          'updatedAt': '2026-09-28T00:00:00.000Z',
          'courses': [_snapshotJson()],
        });
      });
      final api = ApiClient(
          baseUrl: base, httpClient: mock, sessions: MemorySessionStore(_session('at')));

      final overview = await api.fetchGrades();
      final course = overview.courses.single;
      expect(course.current.overall.percent, 0.88);
      expect(course.current.overall.letter, 'B+');
      expect(course.current.periods.single.categories.single.title, 'Tests');
      expect(course.projected, isNull);
    });

    test('addForecast sends the body and encodes the section id', () async {
      final mock = MockClient((req) async {
        expect(req.method, 'POST');
        expect(req.url.pathSegments, ['v1', 'grades', 'calc 1/A', 'forecasts']);
        expect(jsonDecode(req.body),
            {'periodId': 'q1', 'categoryId': 'tests', 'earned': 95.0, 'assignmentId': 't2'});
        return _json({
          'grade': _snapshotJson(projected: 0.94),
          'forecasts': [
            {
              'id': 'f_1',
              'periodId': 'q1',
              'categoryId': 'tests',
              'assignmentId': 't2',
              'earned': 95,
              'status': 'active',
            },
          ],
        }, 201);
      });
      final api = ApiClient(
          baseUrl: base, httpClient: mock, sessions: MemorySessionStore(_session('at')));

      final result = await api.addForecast('calc 1/A',
          periodId: 'q1', categoryId: 'tests', assignmentId: 't2', earned: 95);
      expect(result.grade.projected!.overall.percent, 0.94);
      expect(result.forecasts.single.forecast.id, 'f_1');
      expect(result.forecasts.single.status, ForecastStatus.active);
    });

    test('deleteForecast targets the forecast by id', () async {
      final mock = MockClient((req) async {
        expect(req.method, 'DELETE');
        expect(req.url.path, '/v1/grades/calc/forecasts/f_1');
        return _json({'grade': _snapshotJson(), 'forecasts': []});
      });
      final api = ApiClient(
          baseUrl: base, httpClient: mock, sessions: MemorySessionStore(_session('at')));
      expect((await api.deleteForecast('calc', 'f_1')).forecasts, isEmpty);
    });
  });

  group('session handling', () {
    test('an expired access token is refreshed once and the call retried', () async {
      final seen = <String>[];
      final mock = MockClient((req) async {
        seen.add('${req.method} ${req.url.path} ${req.headers['authorization']}');
        if (req.url.path == '/v1/auth/refresh') {
          expect(jsonDecode(req.body), {'refreshToken': 'rt1'});
          return _json({
            'user': {'id': 'u_1', 'email': 'a@b.com', 'role': 'student'},
            'accessToken': 'new',
            'refreshToken': 'rt2',
          });
        }
        if (req.headers['authorization'] == 'Bearer old') {
          return _json({'error': 'token_expired'}, 401);
        }
        return _json({'updatedAt': '2026-09-28T00:00:00.000Z', 'courses': []});
      });
      final sessions = MemorySessionStore(_session('old'));
      final api = ApiClient(baseUrl: base, httpClient: mock, sessions: sessions);

      // Two concurrent calls hit the expired token; only one refresh happens.
      await Future.wait([api.fetchGrades(), api.fetchGrades()]);

      expect(seen.where((s) => s.contains('/v1/auth/refresh')), hasLength(1));
      expect(seen.where((s) => s.endsWith('Bearer new')), hasLength(2));
      expect(sessions.session!.accessToken, 'new');
      expect(sessions.session!.refreshToken, 'rt2');
    });

    test('a rejected refresh signs the user out', () async {
      final mock = MockClient((req) async => req.url.path == '/v1/auth/refresh'
          ? _json({'error': 'refresh_revoked'}, 401)
          : _json({'error': 'token_expired'}, 401));
      final sessions = MemorySessionStore(_session('old'));
      final api = ApiClient(baseUrl: base, httpClient: mock, sessions: sessions);

      await expectLater(
        api.fetchGrades(),
        throwsA(isA<ApiClientException>().having((e) => e.code, 'code', 'refresh_revoked')),
      );
      expect(sessions.session, isNull);
      expect(api.isSignedIn, isFalse);
    });

    test('other 401s are not retried', () async {
      var calls = 0;
      final mock = MockClient((req) async {
        calls++;
        return _json({'error': 'invalid_token'}, 401);
      });
      final api = ApiClient(
          baseUrl: base, httpClient: mock, sessions: MemorySessionStore(_session('bad')));
      await expectLater(api.fetchGrades(), throwsA(isA<ApiClientException>()));
      expect(calls, 1);
    });

    test('logOut revokes server-side and clears the session, even offline', () async {
      final mock = MockClient((req) async {
        expect(req.url.path, '/v1/auth/logout');
        expect(req.headers['authorization'], 'Bearer at');
        throw http.ClientException('offline');
      });
      final sessions = MemorySessionStore(_session('at'));
      final api = ApiClient(baseUrl: base, httpClient: mock, sessions: sessions);
      await expectLater(api.logOut(), throwsA(isA<http.ClientException>()));
      expect(sessions.session, isNull);
    });
  });
}
