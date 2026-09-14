/// One append-only audit record for a staff/admin action.
class AuditEntry {
  AuditEntry({
    required this.id,
    required this.actorId,
    required this.actorEmail,
    required this.action,
    this.targetId,
    this.targetEmail,
    this.detail,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now().toUtc();

  final int id;
  final String? actorId;
  final String actorEmail;
  final String? targetId;
  final String? targetEmail;
  final String action;
  final Map<String, dynamic>? detail;
  final DateTime createdAt;

  Map<String, dynamic> toJson() => {
        'id': id,
        'actorId': actorId,
        'actorEmail': actorEmail,
        'targetId': targetId,
        'targetEmail': targetEmail,
        'action': action,
        'detail': detail,
        'createdAt': createdAt.toIso8601String(),
      };
}
