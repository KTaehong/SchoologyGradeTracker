import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

/// PBKDF2-HMAC-SHA256 password hashing.
///
/// Stored format (Django-compatible, easy to eyeball):
///   `pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>`
///
/// The iteration count is embedded in every hash, so the cost can be raised
/// later without invalidating existing hashes. Verification is constant-time.
class PasswordHasher {
  const PasswordHasher({this.iterations = 120000, this.keyLength = 32});

  /// Work factor. Production default is high (~120k). Tests pass a tiny value
  /// so the suite stays fast — the algorithm is identical either way.
  final int iterations;
  final int keyLength;

  static final Random _rng = Random.secure();

  String hash(String password) {
    final salt = _randomBytes(16);
    final dk = _pbkdf2(utf8.encode(password), salt, iterations, keyLength);
    return 'pbkdf2_sha256'
        '\$$iterations'
        '\$${base64.encode(salt)}'
        '\$${base64.encode(dk)}';
  }

  /// Constant-time verification. Returns false for any malformed stored value
  /// rather than throwing, so a corrupt row can't crash the auth path.
  bool verify(String password, String stored) {
    final parts = stored.split('\$');
    if (parts.length != 4 || parts[0] != 'pbkdf2_sha256') return false;
    final iter = int.tryParse(parts[1]);
    if (iter == null || iter < 1) return false;
    final Uint8List salt;
    final Uint8List expected;
    try {
      salt = base64.decode(parts[2]);
      expected = base64.decode(parts[3]);
    } catch (_) {
      return false;
    }
    final dk = _pbkdf2(utf8.encode(password), salt, iter, expected.length);
    return _constantTimeEquals(dk, expected);
  }

  /// True when a hash was produced with an older cost and should be re-hashed
  /// on the user's next successful login.
  bool needsRehash(String stored) {
    final parts = stored.split('\$');
    if (parts.length != 4) return true;
    final iter = int.tryParse(parts[1]);
    return iter == null || iter < iterations;
  }

  static Uint8List _randomBytes(int n) =>
      Uint8List.fromList(List.generate(n, (_) => _rng.nextInt(256)));

  /// PBKDF2 with HMAC-SHA256 as the PRF (RFC 2898). Exposed for testing against
  /// published vectors.
  static Uint8List pbkdf2(
      List<int> password, List<int> salt, int iterations, int dkLen) =>
      _pbkdf2(password, salt, iterations, dkLen);

  static Uint8List _pbkdf2(
      List<int> password, List<int> salt, int iterations, int dkLen) {
    final hmac = Hmac(sha256, password);
    const hLen = 32; // SHA-256 output
    final blocks = (dkLen / hLen).ceil();
    final out = BytesBuilder();

    for (var block = 1; block <= blocks; block++) {
      // U1 = PRF(password, salt || INT_32_BE(block))
      final salted = Uint8List(salt.length + 4)
        ..setRange(0, salt.length, salt)
        ..setRange(salt.length, salt.length + 4, _int32be(block));
      var u = Uint8List.fromList(hmac.convert(salted).bytes);
      final t = Uint8List.fromList(u); // T = U1

      for (var i = 1; i < iterations; i++) {
        u = Uint8List.fromList(hmac.convert(u).bytes);
        for (var j = 0; j < hLen; j++) {
          t[j] ^= u[j];
        }
      }
      out.add(t);
    }
    return Uint8List.fromList(out.toBytes().sublist(0, dkLen));
  }

  static Uint8List _int32be(int v) => Uint8List(4)
    ..[0] = (v >> 24) & 0xff
    ..[1] = (v >> 16) & 0xff
    ..[2] = (v >> 8) & 0xff
    ..[3] = v & 0xff;

  static bool _constantTimeEquals(List<int> a, List<int> b) {
    if (a.length != b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) {
      diff |= a[i] ^ b[i];
    }
    return diff == 0;
  }
}
