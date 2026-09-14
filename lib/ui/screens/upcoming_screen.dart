import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../state/providers.dart';
import 'settings_screen.dart';

/// The upcoming-work agenda, built from the Schoology iCal feed: every
/// assignment still due, in date order, each tagged with the class it belongs to.
class UpcomingScreen extends ConsumerWidget {
  const UpcomingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final url = ref.watch(calendarFeedUrlProvider);
    final async = ref.watch(upcomingProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Upcoming'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(upcomingProvider),
          ),
        ],
      ),
      body: url == null
          ? _NoFeed()
          : async.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => _FeedError(message: '$e'),
              data: (items) => items.isEmpty
                  ? const _Empty()
                  : _Agenda(items: items),
            ),
    );
  }
}

class _Agenda extends StatelessWidget {
  const _Agenda({required this.items});
  final List<UpcomingItem> items;

  @override
  Widget build(BuildContext context) {
    // Group by calendar day.
    final groups = <DateTime, List<UpcomingItem>>{};
    for (final it in items) {
      final d = DateTime(it.event.start.year, it.event.start.month, it.event.start.day);
      (groups[d] ??= []).add(it);
    }
    final days = groups.keys.toList()..sort();

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      itemCount: days.length,
      itemBuilder: (context, i) {
        final day = days[i];
        final dayItems = groups[day]!;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(2, 16, 0, 6),
              child: Text(
                _dayLabel(day),
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: Theme.of(context).colorScheme.primary,
                    ),
              ),
            ),
            for (final it in dayItems) _UpcomingTile(item: it),
          ],
        );
      },
    );
  }

  static String _dayLabel(DateTime d) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final diff = d.difference(today).inDays;
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    const wdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    final base = '${wdays[d.weekday - 1]}, ${months[d.month - 1]} ${d.day}';
    if (diff == 0) return 'Today · $base';
    if (diff == 1) return 'Tomorrow · $base';
    return base;
  }
}

class _UpcomingTile extends StatelessWidget {
  const _UpcomingTile({required this.item});
  final UpcomingItem item;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final course = item.course;
    final color = course == null ? scheme.outline : Color(course.colorValue);
    final time = item.event.allDay
        ? 'All day'
        : TimeOfDay.fromDateTime(item.event.start).format(context);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: item.event.url == null
            ? null
            : () => launchUrl(Uri.parse(item.event.url!),
                mode: LaunchMode.externalApplication),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 4,
                height: 40,
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.event.summary,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        Text(
                          course?.title ?? 'Unfiled',
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: course == null ? scheme.outline : color,
                                fontWeight: FontWeight.w600,
                              ),
                        ),
                        Text('  ·  Due $time',
                            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                  color: scheme.outline,
                                )),
                      ],
                    ),
                  ],
                ),
              ),
              if (item.event.url != null)
                Icon(Icons.open_in_new, size: 15, color: scheme.outline),
            ],
          ),
        ),
      ),
    );
  }
}

class _NoFeed extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.event_note_outlined, size: 52, color: scheme.primary),
            const SizedBox(height: 14),
            Text('Connect your calendar', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(
              'Add your Schoology iCal feed in Settings to see every assignment '
              'and due date here, sorted and filed by class.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: scheme.outline),
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const SettingsScreen()),
              ),
              icon: const Icon(Icons.settings_outlined),
              label: const Text('Open Settings'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty();
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.check_circle_outline, size: 52, color: scheme.primary),
            const SizedBox(height: 14),
            Text('Nothing due', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text('No upcoming assignments in your calendar feed.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: scheme.outline)),
          ],
        ),
      ),
    );
  }
}

class _FeedError extends StatelessWidget {
  const _FeedError({required this.message});
  final String message;
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off_outlined, size: 52, color: scheme.error),
            const SizedBox(height: 14),
            Text("Couldn't load the feed", style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.outline),
            ),
          ],
        ),
      ),
    );
  }
}
