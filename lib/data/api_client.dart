import 'dart:async';
import 'dart:convert';

import 'package:grade_core/grade_core.dart';
import 'package:http/http.dart' as http;

/// A signed-in session returned by the auth endpoints.
class AuthSession {
  const AuthSession({
    required this.userId,
    required this.email,
    required this.role,
    required this.accessToken,
    required this.refreshToken,
  });

  final String userId;
  final String email;
  final String role;
  final String accessToken;
  final String refreshToken;

  /// Parses an auth endpoint response (`{user: {...}, accessToken, refreshToken}`).
  factory AuthSession.fromJson(Map<String, dynamic> j) => AuthSession(
        userId: j['user']?['id'] as String? ?? '',
        email: j['user']?['email'] as String? ?? '',
        role: j['user']?['role'] as String? ?? 'student',
        accessToken: j['accessToken'] as String,
        refreshToken: j['refreshToken'] as String,
      );

  /// Flat form persisted on-device by `LocalStore`.
  Map<String, dynamic> toStorageJson() => {
        'userId': userId,
        'email': email,
        'role': role,
        'accessToken': accessToken,
        'refreshToken': refreshToken,
      };

  factory AuthSession.fromStorageJson(Map<String, dynamic> j) => AuthSession(
        userId: j['userId'] as String? ?? '',
        email: j['email'] as String? ?? '',
        role: j['role'] as String? ?? 'student',
        accessToken: j['accessToken'] as String? ?? '',
        refreshToken: j['refreshToken'] as String? ?? '',
      );
}

/// Where [ApiClient] keeps the signed-in session. The client reads the access
/// token from here on every authenticated call, and writes back the new session
/// after login or a token refresh (or null once it's signed out) — so callers
/// never pass tokens around.
abstract interface class SessionStore {
  AuthSession? get session;
  Future<void> saveSession(AuthSession? session);
}

/// A [SessionStore] that only lives in memory — for tests and scripts.
class MemorySessionStore implements SessionStore {
  MemorySessionStore([this.session]);

  @override
  AuthSession? session;

  @override
  Future<void> saveSession(AuthSession? session) async => this.session = session;
}

/// One grade change reported by the server after a sync-up.
class GradeChangeInfo {
  const GradeChangeInfo({
    required this.type,
    required this.course,
    required this.assignment,
  });
  final String type; // posted | raised | dropped | changed
  final String course;
  final String assignment;

  factory GradeChangeInfo.fromJson(Map<String, dynamic> j) => GradeChangeInfo(
        type: j['type'] as String? ?? 'changed',
        course: j['course'] as String? ?? '',
        assignment: j['assignment'] as String? ?? '',
      );
}

/// The outcome of pushing the gradebook: the new version stamp + detected changes.
class SyncOutcome {
  const SyncOutcome({required this.updatedAt, required this.changes});
  final DateTime updatedAt;
  final List<GradeChangeInfo> changes;
}

/// Raised for any non-2xx API response, carrying the server's error code.
/// `not_signed_in` (status 401) means there was no session to send.
class ApiClientException implements Exception {
  const ApiClientException(this.status, this.code, [this.message]);
  final int status;
  final String code;
  final String? message;
  @override
  String toString() => 'ApiClientException($status $code)';
}

/// Thin, dependency-injected HTTP client for the BessyV2 API. The [http.Client]
/// is injectable so tests drive it with a mock and no real network. This is the
/// network half of the `GradeRepository` → `SyncRepository` seam.
///
/// Auth is handled here once: [logIn]/[signUp] store the session in the
/// [SessionStore], every authenticated call sends its bearer token, and an
/// expired access token is refreshed and the call retried automatically. To add
/// an endpoint, call [_authed] — no token plumbing needed.
class ApiClient {
  ApiClient({
    required this.baseUrl,
    http.Client? httpClient,
    SessionStore? sessions,
  })  : _http = httpClient ?? http.Client(),
        _sessions = sessions ?? MemorySessionStore();

  final Uri baseUrl;
  final http.Client _http;
  final SessionStore _sessions;

  /// The in-flight refresh, shared so concurrent 401s refresh only once (the
  /// server rotates refresh tokens, so a second refresh would be rejected).
  Future<AuthSession>? _refreshing;

  bool get isSignedIn => _sessions.session != null;

  // --- auth ----------------------------------------------------------------

  Future<AuthSession> signUp(String email, String password) =>
      _auth('signup', {'email': email, 'password': password});

  Future<AuthSession> logIn(String email, String password) =>
      _auth('login', {'email': email, 'password': password});

  /// Revoke the session server-side (best effort) and forget it locally.
  Future<void> logOut() async {
    try {
      if (isSignedIn) await _authed('POST', ['auth', 'logout']);
    } finally {
      await _sessions.saveSession(null);
    }
  }

  Future<AuthSession> _auth(String action, Map<String, dynamic> body) async {
    final res = await _send('POST', ['auth', action], body: body);
    final session = AuthSession.fromJson(_decode(res));
    await _sessions.saveSession(session);
    return session;
  }

  // --- gradebook sync ------------------------------------------------------

  /// Pull the synced gradebook down as domain [Course]s.
  Future<List<Course>> pullGradebook() async {
    final body = await _authed('GET', ['gradebook']);
    final courses = body['courses'] as List? ?? const [];
    return [for (final c in courses) Course.fromJson(c as Map<String, dynamic>)];
  }

  /// Push the local gradebook up; returns the server's change report.
  Future<SyncOutcome> pushGradebook(List<Course> courses) async {
    final body = await _authed('PUT', ['gradebook'],
        body: {'courses': [for (final c in courses) c.toJson()]});
    return SyncOutcome(
      updatedAt: DateTime.tryParse(body['updatedAt'] as String? ?? '') ??
          DateTime.now(),
      changes: [
        for (final c in (body['changes'] as List? ?? const []))
          GradeChangeInfo.fromJson(c as Map<String, dynamic>),
      ],
    );
  }

  /// Register this device for push notifications.
  Future<void> registerDevice(String token, String platform) =>
      _authed('POST', ['devices'], body: {'token': token, 'platform': platform});

  // --- grade engine --------------------------------------------------------

  /// Server-computed grades for every synced course (current, plus projected
  /// where forecasts exist).
  Future<GradesOverview> fetchGrades() async =>
      GradesOverview.fromJson(await _authed('GET', ['grades']));

  /// Server-computed grades for one course.
  Future<CourseGradeSnapshot> fetchCourseGrade(String sectionId) async =>
      CourseGradeSnapshot.fromJson(await _authed('GET', ['grades', sectionId]));

  /// A course's saved forecasts and the grades they project.
  Future<CourseForecasts> fetchForecasts(String sectionId) async =>
      CourseForecasts.fromJson(
          await _authed('GET', ['grades', sectionId, 'forecasts']));

  /// Save a forecast. Pass [assignmentId] to predict an ungraded assignment's
  /// score (replaces any earlier prediction for it), or [title] + [maxPoints]
  /// to add a new hypothetical assignment to [categoryId].
  Future<CourseForecasts> addForecast(
    String sectionId, {
    required String periodId,
    required String categoryId,
    required double earned,
    String? assignmentId,
    String? title,
    double? maxPoints,
  }) async =>
      CourseForecasts.fromJson(await _authed(
        'POST',
        ['grades', sectionId, 'forecasts'],
        body: {
          'periodId': periodId,
          'categoryId': categoryId,
          'earned': earned,
          'assignmentId': ?assignmentId,
          'title': ?title,
          'maxPoints': ?maxPoints,
        },
      ));

  Future<CourseForecasts> deleteForecast(
          String sectionId, String forecastId) async =>
      CourseForecasts.fromJson(await _authed(
          'DELETE', ['grades', sectionId, 'forecasts', forecastId]));

  Future<CourseForecasts> clearForecasts(String sectionId) async =>
      CourseForecasts.fromJson(
          await _authed('DELETE', ['grades', sectionId, 'forecasts']));

  void close() => _http.close();

  // --- plumbing ------------------------------------------------------------

  /// Send an authenticated request and decode the JSON reply. If the access
  /// token has expired, refresh it once and retry.
  Future<Map<String, dynamic>> _authed(
    String method,
    List<String> path, {
    Map<String, dynamic>? body,
  }) async {
    final session = _sessions.session;
    if (session == null) {
      throw const ApiClientException(401, 'not_signed_in');
    }
    var res = await _send(method, path, body: body, token: session.accessToken);
    if (res.statusCode == 401 && _errorCode(res) == 'token_expired') {
      final fresh = await _refresh(session);
      res = await _send(method, path, body: body, token: fresh.accessToken);
    }
    return _decode(res);
  }

  Future<AuthSession> _refresh(AuthSession stale) {
    // Another call already refreshed while this one was in flight.
    final current = _sessions.session;
    if (current != null && current.accessToken != stale.accessToken) {
      return Future.value(current);
    }
    return _refreshing ??=
        _doRefresh(stale).whenComplete(() => _refreshing = null);
  }

  Future<AuthSession> _doRefresh(AuthSession stale) async {
    final res = await _send('POST', ['auth', 'refresh'],
        body: {'refreshToken': stale.refreshToken});
    try {
      final fresh = AuthSession.fromJson(_decode(res));
      await _sessions.saveSession(fresh);
      return fresh;
    } on ApiClientException catch (e) {
      // The refresh token was rejected: the session is over, sign out.
      if (e.status == 401 || e.status == 403) {
        await _sessions.saveSession(null);
      }
      rethrow;
    }
  }

  Future<http.Response> _send(
    String method,
    List<String> path, {
    Map<String, dynamic>? body,
    String? token,
  }) {
    final req = http.Request(
        method, baseUrl.replace(pathSegments: ['v1', ...path]))
      ..headers.addAll({
        'content-type': 'application/json',
        if (token != null) 'authorization': 'Bearer $token',
      });
    if (body != null) req.body = jsonEncode(body);
    return _http.send(req).then(http.Response.fromStream);
  }

  static String? _errorCode(http.Response res) {
    try {
      final body = jsonDecode(res.body);
      return body is Map ? body['error'] as String? : null;
    } catch (_) {
      return null;
    }
  }

  /// Decode a JSON object body, throwing [ApiClientException] on non-2xx.
  Map<String, dynamic> _decode(http.Response res) {
    final Map<String, dynamic> body;
    try {
      body = res.body.isEmpty
          ? <String, dynamic>{}
          : jsonDecode(res.body) as Map<String, dynamic>;
    } catch (_) {
      throw ApiClientException(res.statusCode, 'bad_response');
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw ApiClientException(
          res.statusCode, body['error'] as String? ?? 'error',
          body['message'] as String?);
    }
    return body;
  }
}
