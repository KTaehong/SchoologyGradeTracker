import 'package:shelf/shelf.dart';
import 'package:shelf_router/shelf_router.dart';

import '../models/user.dart';
import '../store/store.dart';
import 'app.dart';
import 'auth_middleware.dart';
import 'errors.dart';
import 'json.dart';

/// Builds the full API surface: three separately-authorized sets (Student,
/// Caregiver, Admin/Support) under `/v1`, wrapped in a JSON error boundary.
Handler buildRouter(BessyApp app) {
  final root = Router();

  root.get('/health', (Request r) => ok({'status': 'ok'}));

  // --- Auth set (public) ---------------------------------------------------
  root.mount('/v1/auth', _authRouter(app).call);

  // --- Admin / Support set (staff only) -----------------------------------
  root.mount(
    '/v1/admin',
    Pipeline()
        .addMiddleware(authenticate(app.store, app.tokens,
            roles: {UserRole.support, UserRole.admin}))
        .addHandler(_adminRouter(app).call),
  );

  // --- Student + Caregiver set (any active account) -----------------------
  root.mount(
    '/v1',
    Pipeline()
        .addMiddleware(authenticate(app.store, app.tokens))
        .addHandler(_studentRouter(app).call),
  );

  return Pipeline().addMiddleware(_errorBoundary).addHandler(root.call);
}

/// Turns thrown [ApiException]s into JSON responses and anything else into a
/// 500 (without leaking internals).
Middleware get _errorBoundary => (Handler inner) {
      return (Request request) async {
        try {
          return await inner(request);
        } on ApiException catch (e) {
          return jsonResponse(e.status, e.toJson());
        } catch (e, st) {
          // ignore: avoid_print
          print('Unhandled error on ${request.method} ${request.requestedUri}: $e\n$st');
          return jsonResponse(500, {'error': 'internal'});
        }
      };
    };

// ---------------------------------------------------------------------------
Router _authRouter(BessyApp app) {
  final r = Router();

  r.post('/signup', (Request req) async {
    final body = await readJsonMap(req);
    final role = body['role'] == null
        ? UserRole.student
        : roleFromString('${body['role']}');
    final result = await app.auth.signUp(
      requireString(body, 'email'),
      requireString(body, 'password'),
      role: role,
    );
    return created(result.toJson());
  });

  r.post('/login', (Request req) async {
    final body = await readJsonMap(req);
    final result = await app.auth.logIn(
      requireString(body, 'email'),
      requireString(body, 'password'),
    );
    return ok(result.toJson());
  });

  r.post('/refresh', (Request req) async {
    final body = await readJsonMap(req);
    final result = await app.auth.refresh(requireString(body, 'refreshToken'));
    return ok(result.toJson());
  });

  return r;
}

// ---------------------------------------------------------------------------
Router _studentRouter(BessyApp app) {
  final r = Router();

  r.post('/auth/logout', (Request req) async {
    await app.auth.logOut(currentUser(req).id);
    return ok({'ok': true});
  });

  r.get('/me', (Request req) async => ok(currentUser(req).toJson()));

  // Gradebook sync
  r.get('/gradebook', (Request req) async {
    final gb = await app.gradebook.pull(currentUser(req).id);
    return ok({'courses': gb.courses, 'updatedAt': gb.updatedAt.toIso8601String()});
  });

  r.put('/gradebook', (Request req) async {
    final body = await readJsonMap(req);
    final courses = body['courses'];
    if (courses is! List) {
      throw const ApiException.badRequest('courses_must_be_list');
    }
    final result = await app.gradebook.push(currentUser(req).id, courses);
    return ok(result.toJson());
  });

  // Devices + notification prefs
  r.post('/devices', (Request req) async {
    final body = await readJsonMap(req);
    final platform = requireString(body, 'platform');
    if (platform != 'ios' && platform != 'android') {
      throw const ApiException.badRequest('invalid_platform');
    }
    await app.store.registerDevice(currentUser(req).id,
        DeviceToken(token: requireString(body, 'token'), platform: platform));
    return created({'ok': true});
  });

  r.get('/notifications/prefs', (Request req) async {
    final prefs = await app.store.prefsFor(currentUser(req).id);
    return ok(prefs.toJson());
  });

  r.put('/notifications/prefs', (Request req) async {
    final body = await readJsonMap(req);
    await app.store.setPrefs(currentUser(req).id, NotificationPrefs.fromJson(body));
    final prefs = await app.store.prefsFor(currentUser(req).id);
    return ok(prefs.toJson());
  });

  // Caregiver sharing — student side
  r.post('/caregiver/invites', (Request req) async {
    final link = await app.caregiver.createInvite(currentUser(req).id);
    return created(link.toJson());
  });

  r.get('/caregiver/invites', (Request req) async {
    final links = await app.caregiver.listForStudent(currentUser(req).id);
    return ok({'invites': [for (final l in links) l.toJson()]});
  });

  r.delete('/caregiver/invites/<shareId>', (Request req, String shareId) async {
    await app.caregiver.revoke(currentUser(req).id, shareId);
    return ok({'ok': true});
  });

  // Caregiver sharing — caregiver side
  r.post('/caregiver/accept', (Request req) async {
    final body = await readJsonMap(req);
    final link =
        await app.caregiver.acceptInvite(currentUser(req).id, requireString(body, 'code'));
    return ok(link.toJson());
  });

  r.get('/caregiver/students', (Request req) async {
    final links = await app.caregiver.listForCaregiver(currentUser(req).id);
    return ok({'students': [for (final l in links) l.toJson()]});
  });

  r.get('/caregiver/students/<studentId>/gradebook',
      (Request req, String studentId) async {
    await app.caregiver.assertCanView(currentUser(req).id, studentId);
    final gb = await app.gradebook.pull(studentId);
    return ok({'courses': gb.courses, 'updatedAt': gb.updatedAt.toIso8601String()});
  });

  return r;
}

// ---------------------------------------------------------------------------
Router _adminRouter(BessyApp app) {
  final r = Router();

  r.get('/users', (Request req) async {
    final query = req.url.queryParameters['query'] ?? '';
    if (query.isEmpty) throw const ApiException.badRequest('query_required');
    final users = await app.admin.lookup(currentUser(req), query);
    return ok({'users': [for (final u in users) u.toJson()]});
  });

  r.post('/users/<id>/reset-password', (Request req, String id) async {
    final temp = await app.admin.resetPassword(currentUser(req), id);
    return ok({'temporaryPassword': temp});
  });

  r.patch('/users/<id>/email', (Request req, String id) async {
    final body = await readJsonMap(req);
    final user =
        await app.admin.updateEmail(currentUser(req), id, requireString(body, 'email'));
    return ok(user.toJson());
  });

  r.post('/users/<id>/deactivate', (Request req, String id) async {
    final user = await app.admin.deactivate(currentUser(req), id);
    return ok(user.toJson());
  });

  r.post('/users/<id>/reactivate', (Request req, String id) async {
    final user = await app.admin.reactivate(currentUser(req), id);
    return ok(user.toJson());
  });

  r.delete('/users/<id>', (Request req, String id) async {
    await app.admin.deleteAccount(currentUser(req), id);
    return ok({'ok': true});
  });

  r.get('/audit-log', (Request req) async {
    final targetId = req.url.queryParameters['targetId'];
    final entries = await app.admin.auditLog(currentUser(req), targetId: targetId);
    return ok({'entries': [for (final e in entries) e.toJson()]});
  });

  return r;
}
