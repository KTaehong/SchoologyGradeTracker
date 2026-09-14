import 'dart:convert';

import 'package:bessy_server/bessy_server.dart';
import 'package:crypto/crypto.dart';
import 'package:test/test.dart';

String _hex(List<int> b) =>
    b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();

void main() {
  group('PBKDF2-HMAC-SHA256 known vectors', () {
    // Widely-published PBKDF2-HMAC-SHA256 test vectors.
    test('password/salt, 1 iteration, 32 bytes', () {
      final dk = PasswordHasher.pbkdf2(
          utf8.encode('password'), utf8.encode('salt'), 1, 32);
      expect(_hex(dk),
          '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b');
    });

    test('password/salt, 2 iterations, 32 bytes', () {
      final dk = PasswordHasher.pbkdf2(
          utf8.encode('password'), utf8.encode('salt'), 2, 32);
      expect(_hex(dk),
          'ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43');
    });

    test('password/salt, 4096 iterations, 32 bytes', () {
      final dk = PasswordHasher.pbkdf2(
          utf8.encode('password'), utf8.encode('salt'), 4096, 32);
      expect(_hex(dk),
          'c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a');
    });

    test('matches package:crypto Hmac as the PRF for a single block', () {
      // Sanity: our HMAC use lines up with the crypto package for c=1.
      final salted = [...utf8.encode('salt'), 0, 0, 0, 1];
      final expected = Hmac(sha256, utf8.encode('pw')).convert(salted).bytes;
      final dk = PasswordHasher.pbkdf2(utf8.encode('pw'), utf8.encode('salt'), 1, 32);
      expect(dk, expected);
    });
  });

  group('hash / verify', () {
    const hasher = PasswordHasher(iterations: 1000); // fast for tests

    test('round-trips the correct password', () {
      final h = hasher.hash('correct horse battery staple');
      expect(hasher.verify('correct horse battery staple', h), isTrue);
    });

    test('rejects the wrong password', () {
      final h = hasher.hash('s3cret');
      expect(hasher.verify('S3cret', h), isFalse);
      expect(hasher.verify('', h), isFalse);
    });

    test('embeds the iteration count and salts randomly', () {
      final a = hasher.hash('same');
      final b = hasher.hash('same');
      expect(a, isNot(equals(b))); // different salt each time
      expect(a, startsWith('pbkdf2_sha256\$1000\$'));
    });

    test('verify tolerates malformed stored values', () {
      expect(hasher.verify('x', 'not-a-hash'), isFalse);
      expect(hasher.verify('x', 'pbkdf2_sha256\$abc\$def\$ghi'), isFalse);
      expect(hasher.verify('x', 'pbkdf2_sha256\$1000\$!!\$??'), isFalse);
    });

    test('needsRehash flags weaker (lower-iteration) hashes', () {
      final weak = const PasswordHasher(iterations: 500).hash('pw');
      final strong = const PasswordHasher(iterations: 2000);
      expect(strong.needsRehash(weak), isTrue);
      expect(strong.needsRehash(strong.hash('pw')), isFalse);
    });
  });
}
