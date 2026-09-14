import '../models/audit.dart';
import '../models/share_link.dart';
import '../models/user.dart';
import 'store.dart';

/// In-memory [Store] — hash-map backed, O(1) lookups, no I/O. Used by tests and
/// `dart run bin/server.dart` for a zero-dependency local run. A `PostgresStore`
/// implements the same interface against db/schema.sql for production.
class MemoryStore implements Store {
  final Map<String, User> _usersById = {};
  final Map<String, String> _idByEmail = {}; // lower(email) -> id
  final Map<String, StoredGradebook> _gradebooks = {};
  final Map<String, Set<String>> _refreshHashes = {}; // userId -> hashes
  final Map<String, List<DeviceToken>> _devices = {};
  final Map<String, NotificationPrefs> _prefs = {};
  final Map<String, ShareLink> _sharesById = {};
  final Map<String, String> _shareIdByCode = {};
  final List<AuditEntry> _audit = [];

  var _userSeq = 0;
  var _shareSeq = 0;
  var _auditSeq = 0;

  String _newUserId() => 'u_${++_userSeq}';
  String _newShareId() => 's_${++_shareSeq}';

  @override
  Future<User?> findUserByEmail(String email) async {
    final id = _idByEmail[email.toLowerCase()];
    return id == null ? null : _usersById[id];
  }

  @override
  Future<User?> findUserById(String id) async => _usersById[id];

  @override
  Future<List<User>> searchUsers(String query, {int limit = 25}) async {
    final q = query.toLowerCase();
    final hits = _usersById.values
        .where((u) =>
            u.status != UserStatus.deleted &&
            (u.email.toLowerCase().contains(q) || u.id == query))
        .take(limit)
        .toList();
    return hits;
  }

  @override
  Future<User> insertUser(User user) async {
    final id = user.id.isEmpty ? _newUserId() : user.id;
    final created = User(
      id: id,
      email: user.email,
      role: user.role,
      passwordHash: user.passwordHash,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    );
    _usersById[id] = created;
    _idByEmail[created.email.toLowerCase()] = id;
    return created;
  }

  @override
  Future<void> updateUser(User user) async {
    if (!_usersById.containsKey(user.id)) return;
    // Services mutate the stored User reference in place, so we can't compare
    // against a previous email — reconcile the index by dropping every stale
    // key that points at this id, then re-point the current address.
    _idByEmail.removeWhere((_, id) => id == user.id);
    _idByEmail[user.email.toLowerCase()] = user.id;
    user.updatedAt = DateTime.now().toUtc();
    _usersById[user.id] = user;
  }

  @override
  Future<void> deleteUser(String id) async {
    final u = _usersById.remove(id);
    if (u != null) _idByEmail.remove(u.email.toLowerCase());
    _gradebooks.remove(id);
    _refreshHashes.remove(id);
    _devices.remove(id);
    _prefs.remove(id);
    // Remove share links the user was part of.
    _sharesById.removeWhere((_, s) {
      final drop = s.studentId == id || s.caregiverId == id;
      if (drop) _shareIdByCode.remove(s.inviteCode);
      return drop;
    });
  }

  @override
  Future<void> saveRefreshSession(String userId, String refreshHash,
      {String? deviceLabel, required DateTime expiresAt}) async {
    (_refreshHashes[userId] ??= {}).add(refreshHash);
  }

  @override
  Future<bool> refreshSessionValid(String userId, String refreshHash) async =>
      _refreshHashes[userId]?.contains(refreshHash) ?? false;

  @override
  Future<void> revokeRefreshSessions(String userId) async =>
      _refreshHashes.remove(userId);

  @override
  Future<StoredGradebook?> loadGradebook(String userId) async =>
      _gradebooks[userId];

  @override
  Future<StoredGradebook> saveGradebook(
      String userId, List<dynamic> courses) async {
    final gb = StoredGradebook(courses: courses, updatedAt: DateTime.now().toUtc());
    _gradebooks[userId] = gb;
    return gb;
  }

  @override
  Future<void> registerDevice(String userId, DeviceToken token) async {
    final list = _devices[userId] ??= [];
    list.removeWhere((d) => d.token == token.token);
    list.add(token);
  }

  @override
  Future<List<DeviceToken>> devicesFor(String userId) async =>
      List.unmodifiable(_devices[userId] ?? const []);

  @override
  Future<NotificationPrefs> prefsFor(String userId) async =>
      _prefs[userId] ?? const NotificationPrefs();

  @override
  Future<void> setPrefs(String userId, NotificationPrefs prefs) async =>
      _prefs[userId] = prefs;

  @override
  Future<ShareLink> createShareLink(ShareLink link) async {
    final id = link.id.isEmpty ? _newShareId() : link.id;
    final stored = ShareLink(
      id: id,
      studentId: link.studentId,
      inviteCode: link.inviteCode,
      caregiverId: link.caregiverId,
      scope: link.scope,
      status: link.status,
      createdAt: link.createdAt,
      acceptedAt: link.acceptedAt,
    );
    _sharesById[id] = stored;
    _shareIdByCode[stored.inviteCode] = id;
    return stored;
  }

  @override
  Future<ShareLink?> findShareByCode(String code) async {
    final id = _shareIdByCode[code];
    return id == null ? null : _sharesById[id];
  }

  @override
  Future<void> updateShareLink(ShareLink link) async =>
      _sharesById[link.id] = link;

  @override
  Future<List<ShareLink>> sharesForStudent(String studentId) async =>
      _sharesById.values.where((s) => s.studentId == studentId).toList();

  @override
  Future<List<ShareLink>> sharesForCaregiver(String caregiverId) async =>
      _sharesById.values.where((s) => s.caregiverId == caregiverId).toList();

  @override
  Future<AuditEntry> appendAudit(AuditEntry Function(int id) build) async {
    final entry = build(++_auditSeq);
    _audit.add(entry);
    return entry;
  }

  @override
  Future<List<AuditEntry>> auditLog({String? targetId, int limit = 100}) async {
    final rows = _audit.reversed
        .where((e) => targetId == null || e.targetId == targetId)
        .take(limit)
        .toList();
    return rows;
  }
}
