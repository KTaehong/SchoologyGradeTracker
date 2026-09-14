import 'dart:convert';

import 'package:bessy/state/providers.dart';
import 'package:bessy/state/sync_providers.dart';
import 'package:bessy/ui/screens/settings_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('cloud sync: configure server then sign in', (tester) async {
    // A roomy surface so the whole Settings list lays out for the test.
    tester.view.physicalSize = const Size(1000, 3000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final mock = MockClient((req) async {
      if (req.url.path == '/v1/auth/login') {
        return http.Response(
          jsonEncode({
            'user': {'id': 'u_1', 'email': 'kid@b.com', 'role': 'student'},
            'accessToken': 'at',
            'refreshToken': 'rt',
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 404);
    });

    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();

    await tester.pumpWidget(ProviderScope(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        httpClientProvider.overrideWithValue(mock),
      ],
      child: const MaterialApp(home: SettingsScreen()),
    ));
    await tester.pumpAndSettle();

    // The section renders and starts in the "configure server" state.
    expect(find.text('CLOUD SYNC (BETA)'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Server URL'), findsOneWidget);

    await tester.enterText(
        find.widgetWithText(TextField, 'Server URL'), 'https://api.bessy.test');
    await tester.tap(find.widgetWithText(FilledButton, 'Save server'));
    await tester.pumpAndSettle();

    // Now it asks for credentials.
    expect(find.widgetWithText(TextField, 'Email'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Email'), 'kid@b.com');
    await tester.enterText(find.widgetWithText(TextField, 'Password'), 'password1');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();

    // Signed in: shows the account and a Sync now action.
    expect(find.text('Signed in as kid@b.com'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Sync now'), findsOneWidget);
  });
}
