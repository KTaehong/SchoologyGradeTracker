import 'dart:convert';

import 'package:crypto/crypto.dart';

import '../api/errors.dart';
import '../models/user.dart';
import '../security/password.dart';
import '../security/tokens.dart';
import '../store/store.dart';

/// The access + refresh pair plus the public user projection.
class AuthResult {
  const AuthResult(this.user, this.accessToken, this.refreshToken);
  final User user;
  final String accessToken;
  final String refreshToken;

  Map<String, dynamic> toJson() => {
        'user': user.toJson(),
        'accessToken': accessToken,
        'refreshToken': refreshToken,
      };
}

/// Sign-up, login, and refresh. Enforces email/password rules, hashes passwords,
/// issues tokens, and transparently upgrades old password hashes on login.
class AuthService {
  AuthService(this._store, this._hasher, this._tokens);

  final Store _store;
  final PasswordHasher _hasher;
  final TokenService _tokens;

  static final _emailRe = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

  Future<AuthResult> signUp(String email, String password,
      {UserRole role = UserRole.student}) async {
    email = email.trim();
    if (!_emailRe.hasMatch(email)) {
      throw const ApiException.badRequest('invalid_email');
    }
    if (password.length < 8) {
      throw const ApiException.badRequest(
          'weak_password', 'Password must be at least 8 characters.');
    }
    // Staff accounts are provisioned by admins, never self-served.
    if (role == UserRole.support || role == UserRole.admin) {
      throw const ApiException.forbidden('role_not_self_serviceable');
    }
    if (await _store.findUserByEmail(email) != null) {
      throw const ApiException.conflict('email_taken');
    }
    final user = await _store.insertUser(User(
      id: '',
      email: email,
      role: role,
      passwordHash: _hasher.hash(password),
    ));
    return _issueFor(user);
  }

  Future<AuthResult> logIn(String email, String password) async {
    final user = await _store.findUserByEmail(email.trim());
    // Uniform error + a real hash verification even on miss, to avoid leaking
    // which emails exist via response timing.
    if (user == null) {
      _hasher.verify(password, _dummyHash);
      throw const ApiException.unauthorized('invalid_credentials');
    }
    if (user.status == UserStatus.deactivated ||
        user.status == UserStatus.deleted) {
      throw const ApiException.forbidden('account_disabled');
    }
    if (!_hasher.verify(password, user.passwordHash)) {
      throw const ApiException.unauthorized('invalid_credentials');
    }
    // Opportunistic rehash if the stored cost is below the current default.
    if (_hasher.needsRehash(user.passwordHash)) {
      user.passwordHash = _hasher.hash(password);
      await _store.updateUser(user);
    }
    return _issueFor(user);
  }

  /// Exchange a valid, unrevoked refresh token for a fresh access token (and a
  /// rotated refresh token — old one is invalidated).
  Future<AuthResult> refresh(String refreshToken) async {
    final res = _tokens.verify(refreshToken, expectType: 'refresh');
    if (!res.isValid) throw const ApiException.unauthorized('invalid_refresh');
    final claims = res.claims!;
    if (!await _store.refreshSessionValid(claims.subject, _hash(refreshToken))) {
      throw const ApiException.unauthorized('refresh_revoked');
    }
    final user = await _store.findUserById(claims.subject);
    if (user == null || user.status != UserStatus.active) {
      throw const ApiException.forbidden('account_disabled');
    }
    // Rotate: drop the presented refresh token, mint a new pair.
    return _issueFor(user, rotate: true);
  }

  Future<void> logOut(String userId) => _store.revokeRefreshSessions(userId);

  Future<AuthResult> _issueFor(User user, {bool rotate = false}) async {
    if (rotate) await _store.revokeRefreshSessions(user.id);
    final access = _tokens.issueAccess(user.id, user.role.name);
    final refresh = _tokens.issueRefresh(user.id, user.role.name);
    await _store.saveRefreshSession(user.id, _hash(refresh),
        expiresAt: DateTime.now().toUtc().add(_tokens.refreshTtl));
    return AuthResult(user, access, refresh);
  }

  static String _hash(String token) =>
      sha256.convert(utf8.encode(token)).toString();

  // A fixed valid-format hash to burn CPU on for unknown emails.
  static const _dummyHash =
      'pbkdf2_sha256\$1\$AAAAAAAAAAAAAAAAAAAAAA==\$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
}
