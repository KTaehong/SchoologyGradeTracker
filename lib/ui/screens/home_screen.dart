import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../widgets/course_card.dart';
import 'course_detail_screen.dart';
import 'import_screen.dart';
import 'settings_screen.dart';
import 'upcoming_screen.dart';

/// The home screen: every class with its current grade. This is the app's main
/// surface. Imports (screenshot, report) flow into the gradebook shown here.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final courses = ref.watch(gradebookProvider);
    final engine = ref.watch(gradeEngineProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Grades'),
        actions: [
          IconButton(
            icon: const Icon(Icons.event_note_outlined),
            tooltip: 'Upcoming',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const UpcomingScreen()),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            tooltip: 'Settings',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const SettingsScreen()),
            ),
          ),
        ],
      ),
      floatingActionButton: courses.isEmpty
          ? null
          : FloatingActionButton.extended(
              onPressed: () => _import(context),
              icon: const Icon(Icons.photo_camera_outlined),
              label: const Text('Import screenshot'),
            ),
      body: courses.isEmpty
          ? _EmptyState(onImport: () => _import(context))
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
              itemCount: courses.length,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (context, i) {
                final course = courses[i];
                return CourseCard(
                  course: course,
                  engine: engine,
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => CourseDetailScreen(sectionId: course.sectionId),
                    ),
                  ),
                );
              },
            ),
    );
  }

  Future<void> _import(BuildContext context) async {
    final result = await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const ImportScreen()),
    );
    if (result != null && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Added to your gradebook')),
      );
    }
  }
}

class _EmptyState extends ConsumerWidget {
  const _EmptyState({required this.onImport});
  final VoidCallback onImport;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.school_outlined, size: 56, color: scheme.primary),
            const SizedBox(height: 16),
            Text('No classes yet',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(
              'Import a screenshot of your Schoology grades, or start with the '
              'sample classes to look around.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: scheme.outline),
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: onImport,
              icon: const Icon(Icons.photo_camera_outlined),
              label: const Text('Import from a screenshot'),
            ),
            const SizedBox(height: 10),
            TextButton(
              onPressed: () => ref.read(gradebookProvider.notifier).loadSample(),
              child: const Text('Load sample classes'),
            ),
          ],
        ),
      ),
    );
  }
}
