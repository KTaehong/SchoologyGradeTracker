import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../domain/models/course.dart';

/// On-device persistence for the imported gradebook. Grades live only here, in
/// this app's own storage — never on a server. Everything is plain JSON so it
/// can be inspected, exported, or wiped by the student at will.
class LocalStore {
  LocalStore(this._prefs);

  final SharedPreferences _prefs;
  static const _coursesKey = 'bessy.courses.v1';
  static const _feedUrlKey = 'bessy.calendarFeedUrl.v1';
  static const _serverUrlKey = 'bessy.sync.serverUrl.v1';
  static const _sessionKey = 'bessy.sync.session.v1';

  String? loadFeedUrl() => _prefs.getString(_feedUrlKey);

  Future<void> saveFeedUrl(String? url) {
    if (url == null || url.isEmpty) return _prefs.remove(_feedUrlKey);
    return _prefs.setString(_feedUrlKey, url);
  }

  // --- Cloud sync config (opt-in). Tokens are sensitive; a hardened build
  // should move the session to the Keychain/Keystore — see providers.dart. ---

  String? loadServerUrl() => _prefs.getString(_serverUrlKey);

  Future<void> saveServerUrl(String? url) {
    if (url == null || url.isEmpty) return _prefs.remove(_serverUrlKey);
    return _prefs.setString(_serverUrlKey, url);
  }

  Map<String, dynamic>? loadSession() {
    final raw = _prefs.getString(_sessionKey);
    if (raw == null || raw.isEmpty) return null;
    try {
      return jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  Future<void> saveSession(Map<String, dynamic>? session) {
    if (session == null) return _prefs.remove(_sessionKey);
    return _prefs.setString(_sessionKey, jsonEncode(session));
  }

  List<Course> loadCourses() {
    final raw = _prefs.getString(_coursesKey);
    if (raw == null || raw.isEmpty) return [];
    try {
      final list = jsonDecode(raw) as List;
      return [
        for (final e in list) Course.fromJson(e as Map<String, dynamic>),
      ];
    } catch (_) {
      return [];
    }
  }

  Future<void> saveCourses(List<Course> courses) {
    final raw = jsonEncode([for (final c in courses) c.toJson()]);
    return _prefs.setString(_coursesKey, raw);
  }
}
