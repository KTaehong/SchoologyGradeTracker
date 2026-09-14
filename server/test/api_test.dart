import 'dart:convert';

import 'package:bessy_server/bessy_server.dart';
import 'package:shelf/shelf.dart';
import 'package:test/test.dart';

/// Thin harness: fire a JSON request at the real handler, get back the status
/// and decoded body — exercises routing, middleware and auth exactly as HTTP.
class Api {
  Api(this.app) : handler = app.handler;
  final BessyApp app;
  final Handler handler;

  Future<({int status, Map<String, dynamic> body})> call(
    String method,
    String path, {
    Object? json,
    String? token,
  }) async {
    final req = Request(
      method,
      Uri.parse('http://localhost$path'),
      headers: {
        'content-type': 'application/json',
        if (token != null) 'authorization': 'Bearer $token',
      },
      body: json == null ? null : jsonEncode(json),
    );
    final resp = await handler(req);
    final raw = await resp.readAsString();
    final decoded = raw.isEmpty ? <String, dynamic>{} : jsonDecode(raw);
    return (
      status: resp.statusCode,
      body: decoded is Map<String, dynamic> ? decoded : {'_': decoded},
    );
  }
}

/// A one-assignment gradebook, optionally scored.
List<dynamic> book({double? earned}) => [
      {
        'sectionId': 's1',
        'title': 'Calculus BC AP',
        'periods': [
          {
            'id': 'q1',
            'title': 'Quarter 1',
            'categories': [
              {
                'id': 'c1',
                'title': 'Tests',
                'weight': 1.0,
                'assignments': [
                  {'id': 'a1', 'title': 'Test 1', 'earned': earned, 'maxPoints': 100},
                ],
              },
            ],
          },
        ],
      },
    ];

void main() {
  late BessyApp app;
  late Api api;

  setUp(() {
    app = BessyApp(hasher: const PasswordHasher(iterations: 500));
    api = Api(app);
  });

  test('health check', () async {
    final r = await api.call('GET', '/health');
    expect(r.status, 200);
    expect(r.body['status'], 'ok');
  });

  group('auth', () {
    test('signup returns 201 with tokens', () async {
      final r = await api.call('POST', '/v1/auth/signup',
          json: {'email': 'a@b.com', 'password': 'password1'});
      expect(r.status, 201);
      expect(r.body['accessToken'], isNotEmpty);
      expect(r.body['user']['role'], 'student');
    });

    test('missing field is a 400', () async {
      final r = await api.call('POST', '/v1/auth/signup', json: {'email': 'a@b.com'});
      expect(r.status, 400);
    });

    test('login works via HTTP', () async {
      await api.call('POST', '/v1/auth/signup',
          json: {'email': 'a@b.com', 'password': 'password1'});
      final r = await api.call('POST', '/v1/auth/login',
          json: {'email': 'a@b.com', 'password': 'password1'});
      expect(r.status, 200);
      expect(r.body['accessToken'], isNotEmpty);
    });
  });

  group('gradebook + notifications', () {
    Future<String> signedInStudent() async {
      final r = await api.call('POST', '/v1/auth/signup',
          json: {'email': 's@b.com', 'password': 'password1'});
      return r.body['accessToken'] as String;
    }

    test('requires a bearer token', () async {
      final r = await api.call('GET', '/v1/gradebook');
      expect(r.status, 401);
    });

    test('push then pull round-trips the gradebook', () async {
      final token = await signedInStudent();
      final put = await api.call('PUT', '/v1/gradebook',
          json: {'courses': book(earned: 90)}, token: token);
      expect(put.status, 200);
      final get = await api.call('GET', '/v1/gradebook', token: token);
      expect((get.body['courses'] as List).single['title'], 'Calculus BC AP');
    });

    test('a new score is detected and a notification is enqueued', () async {
      final token = await signedInStudent();
      // Register a device so a push would be dispatched.
      await api.call('POST', '/v1/devices',
          json: {'token': 'devicetoken', 'platform': 'ios'}, token: token);
      // First sync: ungraded.
      await api.call('PUT', '/v1/gradebook', json: {'courses': book()}, token: token);
      // Second sync: score appears.
      final put = await api.call('PUT', '/v1/gradebook',
          json: {'courses': book(earned: 88)}, token: token);
      final changes = put.body['changes'] as List;
      expect(changes, hasLength(1));
      expect(changes.single['type'], 'posted');
      expect(app.notifications.queued, hasLength(1));
    });

    test('notification prefs suppress unwanted alerts', () async {
      final token = await signedInStudent();
      await api.call('PUT', '/v1/notifications/prefs',
          json: {'gradePosted': false}, token: token);
      await api.call('PUT', '/v1/gradebook', json: {'courses': book()}, token: token);
      await api.call('PUT', '/v1/gradebook',
          json: {'courses': book(earned: 88)}, token: token);
      expect(app.notifications.queued, isEmpty); // posted alerts are off
    });
  });

  group('caregiver sharing', () {
    test('invite → accept → read-only access, and gating', () async {
      final student = (await api.call('POST', '/v1/auth/signup',
              json: {'email': 'kid@b.com', 'password': 'password1'}))
          .body;
      final studentToken = student['accessToken'] as String;
      final studentId = student['user']['id'] as String;

      // Student syncs some grades.
      await api.call('PUT', '/v1/gradebook',
          json: {'courses': book(earned: 91)}, token: studentToken);

      // Student mints an invite.
      final invite = await api.call('POST', '/v1/caregiver/invites', token: studentToken);
      expect(invite.status, 201);
      final code = invite.body['inviteCode'] as String;

      // Caregiver signs up.
      final caregiverToken = (await api.call('POST', '/v1/auth/signup',
              json: {'email': 'mom@b.com', 'password': 'password1', 'role': 'caregiver'}))
          .body['accessToken'] as String;

      // Before accepting, the caregiver cannot read the student's book.
      final blocked = await api.call(
          'GET', '/v1/caregiver/students/$studentId/gradebook',
          token: caregiverToken);
      expect(blocked.status, 403);

      // Accept, then read.
      final accept = await api.call('POST', '/v1/caregiver/accept',
          json: {'code': code}, token: caregiverToken);
      expect(accept.status, 200);
      final read = await api.call(
          'GET', '/v1/caregiver/students/$studentId/gradebook',
          token: caregiverToken);
      expect(read.status, 200);
      expect((read.body['courses'] as List).single['title'], 'Calculus BC AP');
    });

    test('a used invite cannot be redeemed twice', () async {
      final studentToken = (await api.call('POST', '/v1/auth/signup',
              json: {'email': 'kid@b.com', 'password': 'password1'}))
          .body['accessToken'] as String;
      final code = (await api.call('POST', '/v1/caregiver/invites', token: studentToken))
          .body['inviteCode'] as String;
      final c1 = (await api.call('POST', '/v1/auth/signup',
              json: {'email': 'a@x.com', 'password': 'password1'}))
          .body['accessToken'] as String;
      final c2 = (await api.call('POST', '/v1/auth/signup',
              json: {'email': 'b@x.com', 'password': 'password1'}))
          .body['accessToken'] as String;
      expect((await api.call('POST', '/v1/caregiver/accept',
                  json: {'code': code}, token: c1))
              .status,
          200);
      expect((await api.call('POST', '/v1/caregiver/accept',
                  json: {'code': code}, token: c2))
              .status,
          409);
    });
  });

  group('admin / support', () {
    /// Provision a staff account directly (staff can't self-serve) and log in.
    Future<String> adminToken() async {
      await app.store.insertUser(User(
        id: '',
        email: 'admin@bessy.app',
        role: UserRole.admin,
        passwordHash: const PasswordHasher(iterations: 500).hash('adminpass1'),
      ));
      return (await api.call('POST', '/v1/auth/login',
              json: {'email': 'admin@bessy.app', 'password': 'adminpass1'}))
          .body['accessToken'] as String;
    }

    test('student tokens are rejected by the admin API', () async {
      final studentToken = (await api.call('POST', '/v1/auth/signup',
              json: {'email': 's@b.com', 'password': 'password1'}))
          .body['accessToken'] as String;
      final r =
          await api.call('GET', '/v1/admin/users?query=s@b.com', token: studentToken);
      expect(r.status, 403);
    });

    test('lookup, reset password, email change, deactivate, delete — all audited',
        () async {
      final admin = await adminToken();
      final target = (await api.call('POST', '/v1/auth/signup',
              json: {'email': 'user@b.com', 'password': 'password1'}))
          .body['user'];
      final id = target['id'] as String;

      // Lookup
      final look = await api.call('GET', '/v1/admin/users?query=user@b.com', token: admin);
      expect(look.status, 200);
      expect((look.body['users'] as List).single['id'], id);

      // Reset password → old password no longer works, new temp does
      final reset =
          await api.call('POST', '/v1/admin/users/$id/reset-password', token: admin);
      final temp = reset.body['temporaryPassword'] as String;
      expect((await api.call('POST', '/v1/auth/login',
                  json: {'email': 'user@b.com', 'password': 'password1'}))
              .status,
          401);
      expect((await api.call('POST', '/v1/auth/login',
                  json: {'email': 'user@b.com', 'password': temp}))
              .status,
          200);

      // Email change
      final email = await api.call('PATCH', '/v1/admin/users/$id/email',
          json: {'email': 'renamed@b.com'}, token: admin);
      expect(email.body['email'], 'renamed@b.com');

      // Deactivate → login blocked
      await api.call('POST', '/v1/admin/users/$id/deactivate', token: admin);
      expect((await api.call('POST', '/v1/auth/login',
                  json: {'email': 'renamed@b.com', 'password': temp}))
              .status,
          403);

      // Delete → gone from lookup
      final del = await api.call('DELETE', '/v1/admin/users/$id', token: admin);
      expect(del.status, 200);

      // Audit log recorded every action
      final audit = await api.call('GET', '/v1/admin/audit-log', token: admin);
      final actions =
          (audit.body['entries'] as List).map((e) => e['action']).toList();
      expect(actions,
          containsAll(['account_lookup', 'reset_password', 'update_email', 'deactivate', 'delete_account']));
    });
  });
}
