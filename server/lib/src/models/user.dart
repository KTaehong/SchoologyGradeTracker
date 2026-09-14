enum UserRole { student, caregiver, support, admin }

enum UserStatus { active, deactivated, deleted }

UserRole roleFromString(String s) => UserRole.values.firstWhere(
      (r) => r.name == s,
      orElse: () => UserRole.student,
    );

class User {
  User({
    required this.id,
    required this.email,
    required this.role,
    required this.passwordHash,
    this.status = UserStatus.active,
    DateTime? createdAt,
    DateTime? updatedAt,
  })  : createdAt = createdAt ?? DateTime.now().toUtc(),
        updatedAt = updatedAt ?? DateTime.now().toUtc();

  final String id;
  String email;
  UserRole role;
  UserStatus status;
  String passwordHash;
  final DateTime createdAt;
  DateTime updatedAt;

  bool get isStaff => role == UserRole.support || role == UserRole.admin;

  /// Public projection — never leaks the password hash.
  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        'role': role.name,
        'status': status.name,
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
      };
}
