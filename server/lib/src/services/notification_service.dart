import '../models/gradebook.dart';
import '../store/store.dart';

/// One notification the worker decided to send.
class QueuedNotification {
  QueuedNotification({
    required this.userId,
    required this.title,
    required this.body,
    required this.change,
    DateTime? queuedAt,
  }) : queuedAt = queuedAt ?? DateTime.now().toUtc();

  final String userId;
  final String title;
  final String body;
  final GradeChange change;
  final DateTime queuedAt;

  Map<String, dynamic> toJson() => {
        'userId': userId,
        'title': title,
        'body': body,
        'change': change.toJson(),
        'queuedAt': queuedAt.toIso8601String(),
      };
}

/// Change-detection → notification fan-out. Turns detected [GradeChange]s into
/// per-device notifications, honoring each user's [NotificationPrefs], and hands
/// them to a [PushDispatcher]. The dispatcher is injected so tests can assert on
/// what would be sent without hitting APNs/FCM.
class NotificationService {
  NotificationService(this._store, {PushDispatcher? dispatcher})
      : _dispatcher = dispatcher ?? LoggingPushDispatcher();

  final Store _store;
  final PushDispatcher _dispatcher;

  final List<QueuedNotification> _queue = [];
  List<QueuedNotification> get queued => List.unmodifiable(_queue);

  /// Filter changes by the user's prefs, enqueue one notification per allowed
  /// change, and dispatch to every registered device. Returns what was sent.
  Future<List<QueuedNotification>> notify(
      String userId, List<GradeChange> changes) async {
    if (changes.isEmpty) return const [];
    final prefs = await _store.prefsFor(userId);
    final devices = await _store.devicesFor(userId);

    final sent = <QueuedNotification>[];
    for (final change in changes) {
      if (!_allowed(prefs, change.type)) continue;
      final n = QueuedNotification(
        userId: userId,
        title: 'Grade update',
        body: change.message,
        change: change,
      );
      _queue.add(n);
      sent.add(n);
      for (final device in devices) {
        await _dispatcher.send(device, n);
      }
    }
    return sent;
  }

  bool _allowed(NotificationPrefs prefs, GradeChangeType type) {
    switch (type) {
      case GradeChangeType.posted:
        return prefs.gradePosted;
      case GradeChangeType.dropped:
        return prefs.gradeDropped;
      case GradeChangeType.raised:
      case GradeChangeType.changed:
        return prefs.gradeChanged;
    }
  }
}

/// Abstraction over the platform push services (APNs / FCM).
abstract class PushDispatcher {
  Future<void> send(DeviceToken device, QueuedNotification notification);
}

/// Default dispatcher for local runs — records instead of hitting a network.
/// A real deployment swaps in an APNs/FCM dispatcher behind this interface.
class LoggingPushDispatcher implements PushDispatcher {
  final List<String> log = [];
  @override
  Future<void> send(DeviceToken device, QueuedNotification n) async {
    log.add('[${device.platform}] ${device.token} → ${n.body}');
  }
}
