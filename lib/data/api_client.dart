import 'dart:convert';

import 'package:http/http.dart' as http;

import '../domain/models/course.dart';

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

  factory AuthSession.fromJson(Map<String, dynamic> j) => AuthSession(
        userId: j['user']?['id'] as String? ?? '',
        email: j['user']?['email'] as String? ?? '',
        role: j['user']?['role'] as String? ?? 'student',
        accessToken: j['accessToken'] as String,
        refreshToken: j['refreshToken'] as String,
      );
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
class ApiClient {
  ApiClient({required Uri baseUrl, http.Client? httpClient})
      : _base = baseUrl,
        _http = httpClient ?? http.Client();

  final Uri _base;
  final http.Client _http;

  Uri _u(String path) => _base.replace(path: path);

  Future<AuthSession> signUp(String email, String password) =>
      _auth('/v1/auth/signup', {'email': email, 'password': password});

  Future<AuthSession> logIn(String email, String password) =>
      _auth('/v1/auth/login', {'email': email, 'password': password});

  Future<AuthSession> _auth(String path, Map<String, dynamic> body) async {
    final res = await _http.post(_u(path),
        headers: _jsonHeaders(), body: jsonEncode(body));
    return AuthSession.fromJson(_decode(res));
  }

  /// Pull the synced gradebook down as domain [Course]s.
  Future<List<Course>> pullGradebook(String accessToken) async {
    final res = await _http.get(_u('/v1/gradebook'), headers: _jsonHeaders(accessToken));
    final body = _decode(res);
    final courses = body['courses'] as List? ?? const [];
    return [for (final c in courses) Course.fromJson(c as Map<String, dynamic>)];
  }

  /// Push the local gradebook up; returns the server's change report.
  Future<SyncOutcome> pushGradebook(String accessToken, List<Course> courses) async {
    final res = await _http.put(
      _u('/v1/gradebook'),
      headers: _jsonHeaders(accessToken),
      body: jsonEncode({'courses': [for (final c in courses) c.toJson()]}),
    );
    final body = _decode(res);
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
  Future<void> registerDevice(String accessToken, String token, String platform) async {
    final res = await _http.post(_u('/v1/devices'),
        headers: _jsonHeaders(accessToken),
        body: jsonEncode({'token': token, 'platform': platform}));
    _decode(res);
  }

  void close() => _http.close();

  Map<String, String> _jsonHeaders([String? token]) => {
        'content-type': 'application/json',
        if (token != null) 'authorization': 'Bearer $token',
      };

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
