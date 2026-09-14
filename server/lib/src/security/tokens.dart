import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';

/// A decoded, verified token payload.
class TokenClaims {
  const TokenClaims({
    required this.subject,
    required this.role,
    required this.type,
    required this.issuedAt,
    required this.expiresAt,
  });

  final String subject; // user id
  final String role; // student | caregiver | support | admin
  final String type; // 'access' | 'refresh'
  final DateTime issuedAt;
  final DateTime expiresAt;

  bool get isExpired => DateTime.now().toUtc().isAfter(expiresAt);
}

/// Reason a token failed verification (so the API can distinguish 401 causes).
enum TokenError { malformed, badSignature, expired, wrongType }

class TokenResult {
  const TokenResult.ok(this.claims) : error = null;
  const TokenResult.fail(this.error) : claims = null;
  final TokenClaims? claims;
  final TokenError? error;
  bool get isValid => claims != null;
}

/// Compact HMAC-SHA256 signed tokens (a minimal JWT: `header.payload.sig`,
/// base64url, no padding). Self-contained so the server needs no JWT dependency
/// and the signing path is fully unit-tested.
class TokenService {
  TokenService(
    this._secret, {
    this.accessTtl = const Duration(minutes: 30),
    this.refreshTtl = const Duration(days: 30),
  }) : assert(_secret.length >= 16, 'token secret must be >= 16 bytes');

  final String _secret;
  final Duration accessTtl;
  final Duration refreshTtl;
  static final Random _rng = Random.secure();

  String issueAccess(String userId, String role) =>
      _issue(userId, role, 'access', accessTtl);

  String issueRefresh(String userId, String role) =>
      _issue(userId, role, 'refresh', refreshTtl);

  String _issue(String userId, String role, String type, Duration ttl) {
    final now = DateTime.now().toUtc();
    final header = {'alg': 'HS256', 'typ': 'JWT'};
    final payload = {
      'sub': userId,
      'role': role,
      'typ': type,
      'jti': _newJti(), // unique per token, so rotation distinguishes them
      'iat': now.millisecondsSinceEpoch ~/ 1000,
      'exp': now.add(ttl).millisecondsSinceEpoch ~/ 1000,
    };
    final h = _b64(utf8.encode(jsonEncode(header)));
    final p = _b64(utf8.encode(jsonEncode(payload)));
    final sig = _sign('$h.$p');
    return '$h.$p.$sig';
  }

  /// Verifies signature, expiry and (optionally) the token type.
  TokenResult verify(String token, {String? expectType}) {
    final parts = token.split('.');
    if (parts.length != 3) return const TokenResult.fail(TokenError.malformed);
    final signingInput = '${parts[0]}.${parts[1]}';
    if (!_constantTimeEquals(_sign(signingInput), parts[2])) {
      return const TokenResult.fail(TokenError.badSignature);
    }
    final Map<String, dynamic> payload;
    try {
      payload = jsonDecode(utf8.decode(_unb64(parts[1]))) as Map<String, dynamic>;
    } catch (_) {
      return const TokenResult.fail(TokenError.malformed);
    }
    final exp = payload['exp'];
    final iat = payload['iat'];
    if (exp is! int || iat is! int) {
      return const TokenResult.fail(TokenError.malformed);
    }
    final claims = TokenClaims(
      subject: '${payload['sub']}',
      role: '${payload['role']}',
      type: '${payload['typ']}',
      issuedAt: DateTime.fromMillisecondsSinceEpoch(iat * 1000, isUtc: true),
      expiresAt: DateTime.fromMillisecondsSinceEpoch(exp * 1000, isUtc: true),
    );
    if (claims.isExpired) return const TokenResult.fail(TokenError.expired);
    if (expectType != null && claims.type != expectType) {
      return const TokenResult.fail(TokenError.wrongType);
    }
    return TokenResult.ok(claims);
  }

  static String _newJti() {
    final bytes = List.generate(12, (_) => _rng.nextInt(256));
    return _b64(bytes);
  }

  String _sign(String input) {
    final mac = Hmac(sha256, utf8.encode(_secret)).convert(utf8.encode(input));
    return _b64(mac.bytes);
  }

  static String _b64(List<int> bytes) => base64Url.encode(bytes).replaceAll('=', '');

  static List<int> _unb64(String s) {
    final pad = (4 - s.length % 4) % 4;
    return base64Url.decode(s + '=' * pad);
  }

  static bool _constantTimeEquals(String a, String b) {
    if (a.length != b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) {
      diff |= a.codeUnitAt(i) ^ b.codeUnitAt(i);
    }
    return diff == 0;
  }
}
