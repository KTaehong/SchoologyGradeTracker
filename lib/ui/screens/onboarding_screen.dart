import 'package:flutter/material.dart';

import 'home_screen.dart';

/// Value-prop + privacy promise. In P0 the "Sign in" button just enters the
/// mock-data app; P1 replaces it with the real Schoology OAuth WebView flow.
class OnboardingScreen extends StatelessWidget {
  const OnboardingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: IntrinsicHeight(
                child: Padding(
                  padding: const EdgeInsets.all(28),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Spacer(),
                      Icon(
                        Icons.insights_rounded,
                        size: 56,
                        color: scheme.primary,
                      ),
                      const SizedBox(height: 24),
                      Text(
                        'Your grades,\nfinally clear.',
                        style: Theme.of(context).textTheme.displaySmall
                            ?.copyWith(
                              fontWeight: FontWeight.w700,
                              height: 1.1,
                            ),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Import your Schoology grades from a screenshot or the '
                        'report page, then play out What-If scores and see what '
                        'you need on the final.',
                        style: Theme.of(context).textTheme.bodyLarge
                            ?.copyWith(color: scheme.outline),
                      ),
                      const SizedBox(height: 28),
                      _PrivacyRow(
                        icon: Icons.lock_outline_rounded,
                        text: 'Your grades never leave your device.',
                      ),
                      const SizedBox(height: 12),
                      _PrivacyRow(
                        icon: Icons.verified_user_outlined,
                        text:
                            'No password, no API key — you import your own data, '
                            'nothing is scraped.',
                      ),
                      const Spacer(),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          onPressed: () {
                            Navigator.of(context).pushReplacement(
                              MaterialPageRoute(
                                builder: (_) => const HomeScreen(),
                              ),
                            );
                          },
                          style: FilledButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 16),
                          ),
                          child: const Text('Get started'),
                        ),
                      ),
                      const SizedBox(height: 8),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _PrivacyRow extends StatelessWidget {
  const _PrivacyRow({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: scheme.primary),
        const SizedBox(width: 12),
        Expanded(
          child: Text(text, style: Theme.of(context).textTheme.bodyMedium),
        ),
      ],
    );
  }
}
