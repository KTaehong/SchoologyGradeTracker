import '../models/audit.dart';
import '../models/share_link.dart';
import '../models/user.dart';

/// A user's stored gradebook: the raw list of course JSON plus a version stamp.
class StoredGradebook {
  const StoredGradebook({required this.courses, required this.updatedAt});
  final List<dynamic> courses;
  final DateTime updatedAt;
}

class DeviceToken {
  const DeviceToken({required this.token, required this.platform});
  final String token;
  final String platform; // ios | android
  Map<String, dynamic> toJson() => {'token': token, 'platform': platform};
}

class NotificationPrefs {
  const NotificationPrefs({
    this.gradePosted = true,
    this.gradeChanged = true,
    this.gradeDropped = true,
  });
  final bool gradePosted;
  final bool gradeChanged;
  final bool gradeDropped;

  Map<String, dynamic> toJson() => {
        'gradePosted': gradePosted,
        'gradeChanged': gradeChanged,
        'gradeDropped': gradeDropped,
      };

  factory NotificationPrefs.fromJson(Map<String, dynamic> j) => NotificationPrefs(
        gradePosted: j['gradePosted'] as bool? ?? true,
        gradeChanged: j['gradeChanged'] as bool? ?? true,
        gradeDropped: j['gradeDropped'] as bool? ?? true,
      );
}

/// The persistence contract. The in-memory implementation backs tests and local
/// runs; a PostgreSQL implementation backs production (same methods, mapped to
/// the tables in db/schema.sql).
abstract class Store {
  // Users / identity
  Future<User?> findUserByEmail(String email);
  Future<User?> findUserById(String id);
  Future<List<User>> searchUsers(String query, {int limit = 25});
  Future<User> insertUser(User user);
  Future<void> updateUser(User user);
  Future<void> deleteUser(String id); // hard delete (erasure)

  // Refresh sessions (stores a hash of the refresh token, never the token)
  Future<void> saveRefreshSession(String userId, String refreshHash,
      {String? deviceLabel, required DateTime expiresAt});
  Future<bool> refreshSessionValid(String userId, String refreshHash);
  Future<void> revokeRefreshSessions(String userId);

  // Gradebook sync
  Future<StoredGradebook?> loadGradebook(String userId);
  Future<StoredGradebook> saveGradebook(String userId, List<dynamic> courses);

  // Devices + notification prefs
  Future<void> registerDevice(String userId, DeviceToken token);
  Future<List<DeviceToken>> devicesFor(String userId);
  Future<NotificationPrefs> prefsFor(String userId);
  Future<void> setPrefs(String userId, NotificationPrefs prefs);

  // Caregiver sharing
  Future<ShareLink> createShareLink(ShareLink link);
  Future<ShareLink?> findShareByCode(String code);
  Future<void> updateShareLink(ShareLink link);
  Future<List<ShareLink>> sharesForStudent(String studentId);
  Future<List<ShareLink>> sharesForCaregiver(String caregiverId);

  // Audit
  Future<AuditEntry> appendAudit(AuditEntry Function(int id) build);
  Future<List<AuditEntry>> auditLog({String? targetId, int limit = 100});
}
