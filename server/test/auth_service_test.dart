import 'package:bessy_server/bessy_server.dart';
import 'package:test/test.dart';

BessyApp _app() => BessyApp(hasher: const PasswordHasher(iterations: 500));

void main() {
  test('sign up creates a student and issues tokens', () async {
    final app = _app();
    final res = await app.auth.signUp('a@b.com', 'password1');
    expect(res.user.email, 'a@b.com');
    expect(res.user.role, UserRole.student);
    expect(res.accessToken, isNotEmpty);
    expect(res.refreshToken, isNotEmpty);
    // The access token verifies and carries the user id.
    final claims = app.tokens.verify(res.accessToken, expectType: 'access').claims!;
    expect(claims.subject, res.user.id);
  });

  test('rejects invalid email and weak password', () async {
    final app = _app();
    expect(() => app.auth.signUp('nope', 'password1'),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', 'invalid_email')));
    expect(() => app.auth.signUp('a@b.com', 'short'),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', 'weak_password')));
  });

  test('rejects duplicate email (case-insensitive)', () async {
    final app = _app();
    await app.auth.signUp('a@b.com', 'password1');
    expect(() => app.auth.signUp('A@B.com', 'password2'),
        throwsA(isA<ApiException>().having((e) => e.status, 'status', 409)));
  });

  test('will not self-serve a staff role', () async {
    final app = _app();
    expect(() => app.auth.signUp('x@y.com', 'password1', role: UserRole.admin),
        throwsA(isA<ApiException>().having((e) => e.status, 'status', 403)));
  });

  test('login succeeds with the right password, fails otherwise', () async {
    final app = _app();
    await app.auth.signUp('a@b.com', 'password1');
    final ok = await app.auth.logIn('a@b.com', 'password1');
    expect(ok.user.email, 'a@b.com');
    expect(() => app.auth.logIn('a@b.com', 'wrong'),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', 'invalid_credentials')));
  });

  test('login on an unknown email fails uniformly', () async {
    final app = _app();
    expect(() => app.auth.logIn('ghost@b.com', 'password1'),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', 'invalid_credentials')));
  });

  test('deactivated accounts cannot log in', () async {
    final app = _app();
    final res = await app.auth.signUp('a@b.com', 'password1');
    final u = await app.store.findUserById(res.user.id);
    u!.status = UserStatus.deactivated;
    await app.store.updateUser(u);
    expect(() => app.auth.logIn('a@b.com', 'password1'),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', 'account_disabled')));
  });

  test('refresh rotates the token and invalidates the old one', () async {
    final app = _app();
    final res = await app.auth.signUp('a@b.com', 'password1');
    final first = await app.auth.refresh(res.refreshToken);
    expect(first.accessToken, isNotEmpty);
    // The original refresh token is now revoked.
    expect(() => app.auth.refresh(res.refreshToken),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', 'refresh_revoked')));
    // The newly minted one works.
    final second = await app.auth.refresh(first.refreshToken);
    expect(second.accessToken, isNotEmpty);
  });

  test('an access token is not accepted as a refresh token', () async {
    final app = _app();
    final res = await app.auth.signUp('a@b.com', 'password1');
    expect(() => app.auth.refresh(res.accessToken),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', 'invalid_refresh')));
  });
}
