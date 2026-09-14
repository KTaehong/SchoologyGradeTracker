import '../models/gradebook.dart';
import '../store/store.dart';
import 'notification_service.dart';

/// The result of a sync-up: the new version stamp and any grade changes that
/// were detected (and, therefore, notified).
class SyncResult {
  const SyncResult({required this.updatedAt, required this.changes});
  final DateTime updatedAt;
  final List<GradeChange> changes;

  Map<String, dynamic> toJson() => {
        'updatedAt': updatedAt.toIso8601String(),
        'changes': [for (final c in changes) c.toJson()],
      };
}

/// Gradebook sync + change detection. This is the "change-detection worker"
/// (§2.3) run inline on every push — the diff is cheap (O(assignments)), so the
/// student sees changes immediately rather than on a polling delay.
class GradebookService {
  GradebookService(this._store, this._notifications);

  final Store _store;
  final NotificationService _notifications;

  /// Read a user's synced gradebook (empty list if they've never synced).
  Future<StoredGradebook> pull(String userId) async {
    return await _store.loadGradebook(userId) ??
        StoredGradebook(courses: const [], updatedAt: DateTime.fromMillisecondsSinceEpoch(0, isUtc: true));
  }

  /// Push a fresh gradebook up. Diffs against the stored copy, saves the new
  /// one, and fans out notifications for any real grade changes.
  Future<SyncResult> push(String userId, List<dynamic> courses) async {
    final previous = await _store.loadGradebook(userId);
    final changes = detectChanges(previous?.courses ?? const [], courses);
    final saved = await _store.saveGradebook(userId, courses);
    if (changes.isNotEmpty) {
      await _notifications.notify(userId, changes);
    }
    return SyncResult(updatedAt: saved.updatedAt, changes: changes);
  }
}
