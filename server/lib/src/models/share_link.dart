enum ShareStatus { pending, accepted, revoked }

class ShareLink {
  ShareLink({
    required this.id,
    required this.studentId,
    required this.inviteCode,
    this.caregiverId,
    this.scope = 'read',
    this.status = ShareStatus.pending,
    DateTime? createdAt,
    this.acceptedAt,
  }) : createdAt = createdAt ?? DateTime.now().toUtc();

  final String id;
  final String studentId;
  String? caregiverId;
  final String inviteCode;
  final String scope;
  ShareStatus status;
  final DateTime createdAt;
  DateTime? acceptedAt;

  Map<String, dynamic> toJson() => {
        'id': id,
        'studentId': studentId,
        'caregiverId': caregiverId,
        'inviteCode': inviteCode,
        'scope': scope,
        'status': status.name,
        'createdAt': createdAt.toIso8601String(),
        'acceptedAt': acceptedAt?.toIso8601String(),
      };
}
