import 'dart:math';

import '../api/errors.dart';
import '../models/audit.dart';
import '../models/user.dart';
import '../security/password.dart';
import '../store/store.dart';

/// Staff-facing account operations (§5). Every method takes the acting staff
/// [User] and writes an [AuditEntry], so every privileged action is attributable
/// and reviewable. This service is only ever reachable through the Admin/Support
/// API set, which is role-gated at the router.
class AdminService {
  AdminService(this._store, this._hasher);
  final Store _store;
  final PasswordHasher _hasher;

  static final _rng = Random.secure();

  /// Scoped account lookup for a support ticket — minimal fields, and never the
  /// student's grades. Matches on email substring or exact id.
  Future<List<User>> lookup(User actor, String query) async {
    final users = await _store.searchUsers(query);
    await _audit(actor, 'account_lookup', detail: {'query': query, 'hits': users.length});
    return users;
  }

  /// Reset a locked-out user's password. Generates a temporary password the
  /// agent relays out-of-band (a production build would instead email a
  /// one-time reset link). Revokes existing sessions so old tokens die.
  Future<String> resetPassword(User actor, String targetId) async {
    final target = await _require(targetId);
    final temp = _tempPassword();
    target.passwordHash = _hasher.hash(temp);
    await _store.updateUser(target);
    await _store.revokeRefreshSessions(target.id);
    await _audit(actor, 'reset_password', target: target);
    return temp;
  }

  /// Fix a typo'd signup email. Enforces uniqueness.
  Future<User> updateEmail(User actor, String targetId, String newEmail) async {
    newEmail = newEmail.trim();
    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(newEmail)) {
      throw const ApiException.badRequest('invalid_email');
    }
    final target = await _require(targetId);
    final clash = await _store.findUserByEmail(newEmail);
    if (clash != null && clash.id != target.id) {
      throw const ApiException.conflict('email_taken');
    }
    final old = target.email;
    target.email = newEmail;
    await _store.updateUser(target);
    await _audit(actor, 'update_email',
        target: target, detail: {'from': old, 'to': newEmail});
    return target;
  }

  /// Reversible deactivation.
  Future<User> deactivate(User actor, String targetId) async {
    final target = await _require(targetId);
    target.status = UserStatus.deactivated;
    await _store.updateUser(target);
    await _store.revokeRefreshSessions(target.id);
    await _audit(actor, 'deactivate', target: target);
    return target;
  }

  Future<User> reactivate(User actor, String targetId) async {
    final target = await _require(targetId);
    target.status = UserStatus.active;
    await _store.updateUser(target);
    await _audit(actor, 'reactivate', target: target);
    return target;
  }

  /// Permanent erasure on user request (GDPR/CCPA-style). Audit is written with
  /// the target's email denormalized *before* the row disappears.
  Future<void> deleteAccount(User actor, String targetId) async {
    final target = await _require(targetId);
    await _audit(actor, 'delete_account', target: target);
    await _store.deleteUser(target.id);
  }

  Future<List<AuditEntry>> auditLog(User actor,
      {String? targetId, int limit = 100}) async {
    return _store.auditLog(targetId: targetId, limit: limit);
  }

  Future<User> _require(String id) async {
    final u = await _store.findUserById(id);
    if (u == null) throw const ApiException.notFound('user_not_found');
    return u;
  }

  Future<void> _audit(User actor, String action,
      {User? target, Map<String, dynamic>? detail}) {
    return _store.appendAudit((id) => AuditEntry(
          id: id,
          actorId: actor.id,
          actorEmail: actor.email,
          targetId: target?.id,
          targetEmail: target?.email,
          action: action,
          detail: detail,
        ));
  }

  static String _tempPassword() {
    const chars =
        'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    return List.generate(14, (_) => chars[_rng.nextInt(chars.length)]).join();
  }
}
