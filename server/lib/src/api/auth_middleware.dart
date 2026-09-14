import 'package:shelf/shelf.dart';

import '../models/user.dart';
import '../security/tokens.dart';
import '../store/store.dart';
import 'errors.dart';

/// Context key holding the authenticated [User] on a request.
const _userKey = 'bessy.user';

/// The authenticated user attached by [authenticate]. Throws if missing — which
/// only happens if a handler is mounted outside the auth middleware (a bug).
User currentUser(Request request) {
  final u = request.context[_userKey];
  if (u is! User) throw const ApiException.unauthorized();
  return u;
}

/// Middleware that requires a valid access token and loads the user. Optionally
/// restricts to a set of [roles] (used to fence the Admin/Support API set off
/// from student tokens). Sets the user in the request context.
Middleware authenticate(
  Store store,
  TokenService tokens, {
  Set<UserRole>? roles,
}) {
  return (Handler inner) {
    return (Request request) async {
      final header = request.headers['authorization'];
      if (header == null || !header.startsWith('Bearer ')) {
        throw const ApiException.unauthorized('missing_bearer');
      }
      final result = tokens.verify(header.substring(7), expectType: 'access');
      if (!result.isValid) {
        final code = result.error == TokenError.expired
            ? 'token_expired'
            : 'invalid_token';
        throw ApiException.unauthorized(code);
      }
      final user = await store.findUserById(result.claims!.subject);
      if (user == null || user.status != UserStatus.active) {
        throw const ApiException.forbidden('account_disabled');
      }
      if (roles != null && !roles.contains(user.role)) {
        throw const ApiException.forbidden('insufficient_role');
      }
      return inner(request.change(context: {_userKey: user}));
    };
  };
}
