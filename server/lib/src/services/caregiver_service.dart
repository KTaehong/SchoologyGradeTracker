import 'dart:math';

import '../api/errors.dart';
import '../models/share_link.dart';
import '../store/store.dart';

/// Caregiver sharing: a student mints an invite code, a caregiver redeems it,
/// and the caregiver then has read-only access to that student's gradebook.
class CaregiverService {
  CaregiverService(this._store);
  final Store _store;

  static final _rng = Random.secure();
  static const _alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no easy-confuse chars

  /// Student creates an invite. Returns the share link (its `inviteCode` is what
  /// the student hands to the caregiver).
  Future<ShareLink> createInvite(String studentId) async {
    final code = List.generate(8, (_) => _alphabet[_rng.nextInt(_alphabet.length)]).join();
    return _store.createShareLink(ShareLink(
      id: '',
      studentId: studentId,
      inviteCode: code,
    ));
  }

  /// Caregiver redeems a code. Links the caregiver to the student.
  Future<ShareLink> acceptInvite(String caregiverId, String code) async {
    final link = await _store.findShareByCode(code.trim().toUpperCase());
    if (link == null) throw const ApiException.notFound('invite_not_found');
    if (link.status != ShareStatus.pending) {
      throw const ApiException.conflict('invite_already_used');
    }
    if (link.studentId == caregiverId) {
      throw const ApiException.badRequest('cannot_link_self');
    }
    link.caregiverId = caregiverId;
    link.status = ShareStatus.accepted;
    link.acceptedAt = DateTime.now().toUtc();
    await _store.updateShareLink(link);
    return link;
  }

  /// Student revokes a caregiver's access.
  Future<void> revoke(String studentId, String shareId) async {
    final shares = await _store.sharesForStudent(studentId);
    final link = shares.where((s) => s.id == shareId).firstOrNull;
    if (link == null) throw const ApiException.notFound('share_not_found');
    link.status = ShareStatus.revoked;
    await _store.updateShareLink(link);
  }

  Future<List<ShareLink>> listForStudent(String studentId) =>
      _store.sharesForStudent(studentId);

  Future<List<ShareLink>> listForCaregiver(String caregiverId) =>
      _store.sharesForCaregiver(caregiverId);

  /// Assert that [caregiverId] has an accepted, non-revoked link to
  /// [studentId]; throws 403 otherwise. Used to gate read-only gradebook reads.
  Future<void> assertCanView(String caregiverId, String studentId) async {
    final shares = await _store.sharesForCaregiver(caregiverId);
    final ok = shares.any((s) =>
        s.studentId == studentId && s.status == ShareStatus.accepted);
    if (!ok) throw const ApiException.forbidden('not_linked');
  }
}

extension _FirstOrNull<E> on Iterable<E> {
  E? get firstOrNull => isEmpty ? null : first;
}
