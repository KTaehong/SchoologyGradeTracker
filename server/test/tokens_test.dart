import 'package:bessy_server/bessy_server.dart';
import 'package:test/test.dart';

void main() {
  final tokens = TokenService('a-sufficiently-long-secret-key');

  test('issues and verifies an access token', () {
    final t = tokens.issueAccess('u_1', 'student');
    final res = tokens.verify(t, expectType: 'access');
    expect(res.isValid, isTrue);
    expect(res.claims!.subject, 'u_1');
    expect(res.claims!.role, 'student');
    expect(res.claims!.type, 'access');
  });

  test('rejects a tampered payload', () {
    final t = tokens.issueAccess('u_1', 'student');
    final parts = t.split('.');
    // Flip the payload to a different subject but keep the old signature.
    final forged = '${parts[0]}.${parts[1]}x.${parts[2]}';
    expect(tokens.verify(forged).error, TokenError.badSignature);
  });

  test('rejects a token signed with another secret', () {
    final other = TokenService('a-different-secret-key-entirely');
    final t = other.issueAccess('u_1', 'admin');
    expect(tokens.verify(t).error, TokenError.badSignature);
  });

  test('rejects a malformed token', () {
    expect(tokens.verify('not.a.jwt.at.all').error, TokenError.malformed);
    expect(tokens.verify('only-one-part').error, TokenError.malformed);
  });

  test('enforces the expected token type', () {
    final refresh = tokens.issueRefresh('u_1', 'student');
    expect(tokens.verify(refresh, expectType: 'access').error,
        TokenError.wrongType);
    expect(tokens.verify(refresh, expectType: 'refresh').isValid, isTrue);
  });

  test('detects expiry', () {
    final shortLived =
        TokenService('a-sufficiently-long-secret-key', accessTtl: Duration.zero);
    final t = shortLived.issueAccess('u_1', 'student');
    expect(shortLived.verify(t).error, TokenError.expired);
  });

  test('requires a non-trivial secret', () {
    expect(() => TokenService('short'), throwsA(isA<AssertionError>()));
  });
}
