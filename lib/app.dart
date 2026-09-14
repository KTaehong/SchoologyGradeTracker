import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'state/ui_providers.dart';
import 'theme/app_theme.dart';
import 'ui/screens/onboarding_screen.dart';

class BessyApp extends ConsumerWidget {
  const BessyApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);
    return MaterialApp(
      title: 'Grades',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      home: const OnboardingScreen(),
    );
  }
}
