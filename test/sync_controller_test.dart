import 'dart:convert';

import 'package:bessy/state/providers.dart';
import 'package:bessy/state/sync_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<ProviderContainer> _container(MockClient mock) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  return ProviderContainer(overrides: [
    sharedPreferencesProvider.overrideWithValue(prefs),
    httpClientProvider.overrideWithValue(mock),
  ]);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('configure persists the server URL', () async {
    final c = await _container(MockClient((_) async => http.Response('{}', 200)));
    addTearDown(c.dispose);
    final ctl = c.read(syncControllerProvider.notifier);
    expect(c.read(syncControllerProvider).isConfigured, isFalse);
    await ctl.configure('https://api.bessy.test');
    expect(c.read(syncControllerProvider).isConfigured, isTrue);
    expect(c.read(syncControllerProvider).serverUrl, 'https://api.bessy.test');
  });

  test('sign up stores the session', () async {
    final mock = MockClient((req) async {
      expect(req.url.path, '/v1/auth/signup');
      return http.Response(
        jsonEncode({
          'user': {'id': 'u_1', 'email': 'a@b.com', 'role': 'student'},
          'accessToken': 'at',
          'refreshToken': 'rt',
        }),
        201,
        headers: {'content-type': 'application/json'},
      );
    });
    final c = await _container(mock);
    addTearDown(c.dispose);
    final ctl = c.read(syncControllerProvider.notifier);
    await ctl.configure('https://api.bessy.test');
    await ctl.signUp('a@b.com', 'password1');
    final s = c.read(syncControllerProvider);
    expect(s.isSignedIn, isTrue);
    expect(s.session!.email, 'a@b.com');
    expect(s.message, 'Account created');
  });

  test('bad credentials surface a friendly message, no session', () async {
    final mock = MockClient((req) async => http.Response(
        jsonEncode({'error': 'invalid_credentials'}), 401,
        headers: {'content-type': 'application/json'}));
    final c = await _container(mock);
    addTearDown(c.dispose);
    final ctl = c.read(syncControllerProvider.notifier);
    await ctl.configure('https://api.bessy.test');
    await ctl.signIn('a@b.com', 'nope');
    final s = c.read(syncControllerProvider);
    expect(s.isSignedIn, isFalse);
    expect(s.message, 'Wrong email or password.');
  });

  test('syncNow pushes and reports the change count', () async {
    var puts = 0;
    final mock = MockClient((req) async {
      if (req.url.path == '/v1/auth/login') {
        return http.Response(
          jsonEncode({
            'user': {'id': 'u_1', 'email': 'a@b.com', 'role': 'student'},
            'accessToken': 'at',
            'refreshToken': 'rt',
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (req.method == 'PUT' && req.url.path == '/v1/gradebook') {
        puts++;
        expect(req.headers['authorization'], 'Bearer at');
        return http.Response(
          jsonEncode({
            'updatedAt': '2026-09-13T00:00:00.000Z',
            'changes': [
              {'type': 'posted', 'course': 'Calc', 'assignment': 'Test 1'},
            ],
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 404);
    });
    final c = await _container(mock);
    addTearDown(c.dispose);
    final ctl = c.read(syncControllerProvider.notifier);
    await ctl.configure('https://api.bessy.test');
    await ctl.signIn('a@b.com', 'password1');
    await ctl.syncNow();
    final s = c.read(syncControllerProvider);
    expect(puts, 1);
    expect(s.lastChangeCount, 1);
    expect(s.message, 'Synced — 1 change');
  });

  test('syncNow without a session asks the user to sign in', () async {
    final c = await _container(MockClient((_) async => http.Response('{}', 200)));
    addTearDown(c.dispose);
    final ctl = c.read(syncControllerProvider.notifier);
    await ctl.configure('https://api.bessy.test');
    await ctl.syncNow();
    expect(c.read(syncControllerProvider).message, 'Sign in first.');
  });

  test('session is restored from local storage on rebuild', () async {
    final mock = MockClient((req) async => http.Response(
        jsonEncode({
          'user': {'id': 'u_1', 'email': 'a@b.com', 'role': 'student'},
          'accessToken': 'at',
          'refreshToken': 'rt',
        }),
        201,
        headers: {'content-type': 'application/json'}));
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final overrides = [
      sharedPreferencesProvider.overrideWithValue(prefs),
      httpClientProvider.overrideWithValue(mock),
    ];
    final c1 = ProviderContainer(overrides: overrides);
    final ctl = c1.read(syncControllerProvider.notifier);
    await ctl.configure('https://api.bessy.test');
    await ctl.signUp('a@b.com', 'password1');
    c1.dispose();

    // A fresh container reading the same prefs restores the session + URL.
    final c2 = ProviderContainer(overrides: overrides);
    addTearDown(c2.dispose);
    final restored = c2.read(syncControllerProvider);
    expect(restored.isConfigured, isTrue);
    expect(restored.isSignedIn, isTrue);
    expect(restored.session!.email, 'a@b.com');
  });
}
