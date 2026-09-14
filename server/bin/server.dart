import 'dart:io';

import 'package:shelf/shelf_io.dart' as shelf_io;

import 'package:bessy_server/bessy_server.dart';

/// Local / container entrypoint. Reads config from the environment and serves
/// the API over HTTP. Uses the in-memory store by default; point [BessyApp] at a
/// PostgreSQL-backed [Store] for production.
Future<void> main(List<String> args) async {
  final env = Platform.environment;
  final port = int.tryParse(env['PORT'] ?? '') ?? 8787;
  final secret = env['BESSY_TOKEN_SECRET'] ?? 'dev-secret-change-me-0123456789';

  final app = BessyApp(tokenSecret: secret);

  // Bootstrap a first admin so the Admin/Support API is reachable (staff cannot
  // self-serve via /signup). Configure via env; skipped if unset.
  final adminEmail = env['BESSY_ADMIN_EMAIL'];
  final adminPassword = env['BESSY_ADMIN_PASSWORD'];
  if (adminEmail != null && adminPassword != null) {
    if (await app.store.findUserByEmail(adminEmail) == null) {
      await app.store.insertUser(User(
        id: '',
        email: adminEmail,
        role: UserRole.admin,
        passwordHash: const PasswordHasher().hash(adminPassword),
      ));
      stdout.writeln('Bootstrapped admin account: $adminEmail');
    }
  }

  final server = await shelf_io.serve(app.handler, InternetAddress.anyIPv4, port);
  stdout.writeln('BessyV2 API listening on http://${server.address.host}:${server.port}');
}
