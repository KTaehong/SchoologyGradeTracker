import 'package:shelf/shelf.dart';

import '../security/password.dart';
import '../security/tokens.dart';
import '../services/admin_service.dart';
import '../services/auth_service.dart';
import '../services/caregiver_service.dart';
import '../services/gradebook_service.dart';
import '../services/notification_service.dart';
import '../store/memory_store.dart';
import '../store/store.dart';
import 'router.dart';

/// Composition root. Wires the store, security primitives and services together
/// and exposes a single shelf [handler]. Everything is injectable so tests can
/// swap in a fast hasher, a deterministic token secret, or a capturing push
/// dispatcher.
class BessyApp {
  BessyApp({
    Store? store,
    PasswordHasher? hasher,
    TokenService? tokens,
    PushDispatcher? pushDispatcher,
    String tokenSecret = 'dev-secret-change-me-0123456789',
  })  : store = store ?? MemoryStore(),
        _hasher = hasher ?? const PasswordHasher() {
    this.tokens = tokens ?? TokenService(tokenSecret);
    notifications = NotificationService(this.store, dispatcher: pushDispatcher);
    auth = AuthService(this.store, _hasher, this.tokens);
    gradebook = GradebookService(this.store, notifications);
    caregiver = CaregiverService(this.store);
    admin = AdminService(this.store, _hasher);
  }

  final Store store;
  final PasswordHasher _hasher;
  late final TokenService tokens;
  late final NotificationService notifications;
  late final AuthService auth;
  late final GradebookService gradebook;
  late final CaregiverService caregiver;
  late final AdminService admin;

  Handler get handler => buildRouter(this);
}
