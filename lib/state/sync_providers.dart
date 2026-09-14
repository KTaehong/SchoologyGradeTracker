import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import '../data/api_client.dart';
import '../data/sync_repository.dart';
import 'providers.dart';

/// The injectable HTTP client. Real network by default; tests override this with
/// a `MockClient` so the whole sync flow runs without a server.
final httpClientProvider = Provider<http.Client>((ref) {
  final client = http.Client();
  ref.onDispose(client.close);
  return client;
});

/// Immutable snapshot of the cloud-sync feature's state.
class SyncState {
  const SyncState({
    this.serverUrl,
    this.session,
    this.busy = false,
    this.message,
    this.lastSyncedAt,
    this.lastChangeCount = 0,
  });

  /// Configured API base URL (null = cloud sync not set up).
  final String? serverUrl;

  /// Current signed-in session (null = signed out).
  final AuthSession? session;

  final bool busy;
  final String? message;
  final DateTime? lastSyncedAt;
  final int lastChangeCount;

  bool get isConfigured => serverUrl != null && serverUrl!.isNotEmpty;
  bool get isSignedIn => session != null;

  SyncState copyWith({
    Object? serverUrl = _keep,
    Object? session = _keep,
    bool? busy,
    Object? message = _keep,
    Object? lastSyncedAt = _keep,
    int? lastChangeCount,
  }) {
    return SyncState(
      serverUrl: serverUrl == _keep ? this.serverUrl : serverUrl as String?,
      session: session == _keep ? this.session : session as AuthSession?,
      busy: busy ?? this.busy,
      message: message == _keep ? this.message : message as String?,
      lastSyncedAt:
          lastSyncedAt == _keep ? this.lastSyncedAt : lastSyncedAt as DateTime?,
      lastChangeCount: lastChangeCount ?? this.lastChangeCount,
    );
  }
}

const Object _keep = Object();

/// Drives the opt-in cloud-sync feature (docs/SYSTEM_COMPONENTS.md §1.1 / §3):
/// configure the server, sign in, and push the local gradebook up. The local
/// [gradebookProvider] stays the offline-first source of truth; this only syncs
/// it to the API — keeping the `GradeRepository` → `SyncRepository` seam honest.
final syncControllerProvider =
    NotifierProvider<SyncController, SyncState>(SyncController.new);

class SyncController extends Notifier<SyncState> {
  @override
  SyncState build() {
    final store = ref.read(localStoreProvider);
    final url = store.loadServerUrl();
    final raw = store.loadSession();
    final session = raw == null
        ? null
        : AuthSession(
            userId: raw['userId'] as String? ?? '',
            email: raw['email'] as String? ?? '',
            role: raw['role'] as String? ?? 'student',
            accessToken: raw['accessToken'] as String? ?? '',
            refreshToken: raw['refreshToken'] as String? ?? '',
          );
    return SyncState(serverUrl: url, session: session);
  }

  ApiClient _client() {
    final url = state.serverUrl;
    if (url == null || url.isEmpty) {
      throw StateError('Cloud sync is not configured.');
    }
    return ApiClient(
      baseUrl: Uri.parse(url),
      httpClient: ref.read(httpClientProvider),
    );
  }

  /// Save (or clear) the API base URL.
  Future<void> configure(String? url) async {
    final v = (url == null || url.trim().isEmpty) ? null : url.trim();
    await ref.read(localStoreProvider).saveServerUrl(v);
    state = state.copyWith(serverUrl: v, message: null);
  }

  Future<void> signUp(String email, String password) =>
      _authenticate((c) => c.signUp(email, password), 'Account created');

  Future<void> signIn(String email, String password) =>
      _authenticate((c) => c.logIn(email, password), 'Signed in');

  Future<void> _authenticate(
      Future<AuthSession> Function(ApiClient) op, String okMessage) async {
    state = state.copyWith(busy: true, message: null);
    try {
      final session = await op(_client());
      await _persistSession(session);
      state = state.copyWith(session: session, busy: false, message: okMessage);
    } on ApiClientException catch (e) {
      state = state.copyWith(busy: false, message: _friendly(e));
    } catch (e) {
      state = state.copyWith(busy: false, message: 'Could not reach the server.');
    }
  }

  /// Push the local gradebook up and report how many changes the server saw.
  Future<void> syncNow() async {
    final session = state.session;
    if (session == null) {
      state = state.copyWith(message: 'Sign in first.');
      return;
    }
    state = state.copyWith(busy: true, message: null);
    try {
      final repo = SyncRepository(_client(), () => state.session?.accessToken);
      final courses = ref.read(gradebookProvider);
      final outcome = await repo.pushGradebook(courses);
      state = state.copyWith(
        busy: false,
        lastSyncedAt: outcome.updatedAt,
        lastChangeCount: outcome.changes.length,
        message: outcome.changes.isEmpty
            ? 'Synced — no changes'
            : 'Synced — ${outcome.changes.length} change'
                '${outcome.changes.length == 1 ? '' : 's'}',
      );
    } on ApiClientException catch (e) {
      state = state.copyWith(busy: false, message: _friendly(e));
    } catch (e) {
      state = state.copyWith(busy: false, message: 'Could not reach the server.');
    }
  }

  Future<void> signOut() async {
    await ref.read(localStoreProvider).saveSession(null);
    state = state.copyWith(session: null, message: 'Signed out', lastSyncedAt: null);
  }

  Future<void> _persistSession(AuthSession s) {
    return ref.read(localStoreProvider).saveSession({
      'userId': s.userId,
      'email': s.email,
      'role': s.role,
      'accessToken': s.accessToken,
      'refreshToken': s.refreshToken,
    });
  }

  String _friendly(ApiClientException e) {
    switch (e.code) {
      case 'invalid_credentials':
        return 'Wrong email or password.';
      case 'email_taken':
        return 'That email already has an account.';
      case 'weak_password':
        return 'Password must be at least 8 characters.';
      case 'invalid_email':
        return 'That email address looks invalid.';
      case 'account_disabled':
        return 'This account is disabled.';
      default:
        return e.message ?? 'Something went wrong (${e.status}).';
    }
  }
}
