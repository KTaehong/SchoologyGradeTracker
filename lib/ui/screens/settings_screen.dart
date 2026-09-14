import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../import/html_report_parser.dart';
import '../../state/providers.dart';
import '../../state/sync_providers.dart';
import '../../state/ui_providers.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  final _icalCtl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _icalCtl.text = ref.read(calendarFeedUrlProvider) ?? '';
  }

  @override
  void dispose() {
    _icalCtl.dispose();
    super.dispose();
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  void _connect() {
    final url = _icalCtl.text.trim();
    if (!RegExp(r'^(webcal|https?)://', caseSensitive: false).hasMatch(url) ||
        !RegExp(r'ical|\.ics', caseSensitive: false).hasMatch(url)) {
      _toast('Paste your webcal:// …/ical.ics feed link');
      return;
    }
    ref.read(calendarFeedUrlProvider.notifier).set(url);
    ref.invalidate(upcomingProvider);
    _toast('Calendar connected — see Upcoming');
  }

  Future<void> _openInSystemCalendar() async {
    final url = _icalCtl.text.trim();
    if (url.isEmpty) return;
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      _toast('No calendar app could open this link.');
    }
  }

  Future<void> _importReport() async {
    final picked = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['html', 'htm'],
      withData: true,
    );
    if (picked == null || picked.files.isEmpty) return;
    final file = picked.files.first;
    String source;
    if (file.bytes != null) {
      source = utf8.decode(file.bytes!, allowMalformed: true);
    } else {
      _toast('Could not read the file.');
      return;
    }
    final courses = HtmlReportParser.parse(source);
    if (courses.isEmpty) {
      _toast('No classes found in that page.');
      return;
    }
    ref.read(gradebookProvider.notifier).importCourses(courses);
    _toast('Imported ${courses.length} class${courses.length == 1 ? '' : 'es'}');
  }

  Future<void> _pasteReport() async {
    final ctl = TextEditingController();
    try {
      final ok = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Paste Grades page'),
          content: TextField(
            controller: ctl,
            minLines: 4,
            maxLines: 10,
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              hintText: 'Paste the saved Grades page HTML or its text',
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Import')),
          ],
        ),
      );
      if (ok != true) return;
      final courses = HtmlReportParser.parse(ctl.text);
      if (courses.isEmpty) {
        _toast('No classes found in that text.');
        return;
      }
      ref.read(gradebookProvider.notifier).importCourses(courses);
      _toast('Imported ${courses.length} class${courses.length == 1 ? '' : 'es'}');
    } finally {
      ctl.dispose();
    }
  }

  @override
  Widget build(BuildContext context) {
    final mode = ref.watch(themeModeProvider);
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        children: [
          const _SectionHeader('Import grades'),
          ListTile(
            leading: const Icon(Icons.description_outlined),
            title: const Text('Import grade-report file'),
            subtitle: const Text('Pick a saved Schoology Grades page (.html)'),
            onTap: _importReport,
          ),
          ListTile(
            leading: const Icon(Icons.content_paste_outlined),
            title: const Text('Paste grade-report text'),
            subtitle: const Text('Most accurate — exact scores, categories, weights'),
            onTap: _pasteReport,
          ),

          const Divider(height: 32),
          const _SectionHeader('Calendar'),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Connect your Schoology iCal feed to power the Upcoming tab — '
                  'every assignment and due date, filed by class. Get it from '
                  'Schoology web → your name → Settings → iCal. The link holds a '
                  'private token, so treat it like a password.',
                  style: Theme.of(context).textTheme.bodySmall
                      ?.copyWith(color: scheme.outline),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _icalCtl,
                  decoration: const InputDecoration(
                    border: OutlineInputBorder(),
                    isDense: true,
                    hintText: 'webcal://…schoology.com/…/ical.ics',
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    TextButton(
                      onPressed: _openInSystemCalendar,
                      child: const Text('System calendar'),
                    ),
                    const SizedBox(width: 8),
                    FilledButton.icon(
                      onPressed: _connect,
                      icon: const Icon(Icons.event_available_outlined, size: 18),
                      label: const Text('Connect'),
                    ),
                  ],
                ),
              ],
            ),
          ),

          const Divider(height: 32),
          const _CloudSyncSection(),

          const Divider(height: 32),
          const _SectionHeader('Appearance'),
          RadioGroup<ThemeMode>(
            groupValue: mode,
            onChanged: (v) {
              if (v != null) ref.read(themeModeProvider.notifier).state = v;
            },
            child: const Column(
              children: [
                RadioListTile(value: ThemeMode.system, title: Text('System default')),
                RadioListTile(value: ThemeMode.light, title: Text('Light')),
                RadioListTile(value: ThemeMode.dark, title: Text('Dark')),
              ],
            ),
          ),

          const Divider(height: 32),
          const _SectionHeader('Data'),
          ListTile(
            leading: const Icon(Icons.dataset_outlined),
            title: const Text('Load sample classes'),
            subtitle: const Text('Replace with example data to look around'),
            onTap: () {
              ref.read(gradebookProvider.notifier).loadSample();
              _toast('Loaded sample classes');
            },
          ),
          ListTile(
            leading: Icon(Icons.delete_outline, color: scheme.error),
            title: Text('Clear all grades', style: TextStyle(color: scheme.error)),
            subtitle: const Text('Erase everything stored on this device'),
            onTap: () async {
              final ok = await showDialog<bool>(
                context: context,
                builder: (context) => AlertDialog(
                  title: const Text('Clear all grades?'),
                  content: const Text('This erases every imported class from this device.'),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
                    FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Clear')),
                  ],
                ),
              );
              if (ok == true) {
                ref.read(gradebookProvider.notifier).clear();
                _toast('Cleared');
              }
            },
          ),

          const Divider(height: 32),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.lock_outline, size: 20, color: scheme.primary),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Keyless & private: your grades are the ones you import, stored '
                    'on this device and never scraped. Cloud sync is opt-in and '
                    'off until you set it up below.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

/// Opt-in cloud sync: configure the API server, sign in, and push the local
/// gradebook up. Purely additive — the app works fully without ever touching it.
class _CloudSyncSection extends ConsumerStatefulWidget {
  const _CloudSyncSection();

  @override
  ConsumerState<_CloudSyncSection> createState() => _CloudSyncSectionState();
}

class _CloudSyncSectionState extends ConsumerState<_CloudSyncSection> {
  final _serverCtl = TextEditingController();
  final _emailCtl = TextEditingController();
  final _passwordCtl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _serverCtl.text = ref.read(syncControllerProvider).serverUrl ?? '';
  }

  @override
  void dispose() {
    _serverCtl.dispose();
    _emailCtl.dispose();
    _passwordCtl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(syncControllerProvider);
    final ctl = ref.read(syncControllerProvider.notifier);
    final scheme = Theme.of(context).colorScheme;
    final small = Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.outline);

    final Widget body;
    if (!state.isConfigured) {
      body = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Sync your grades to your own BessyV2 server for backup, '
              'cross-device access, and grade-change notifications.', style: small),
          const SizedBox(height: 10),
          TextField(
            controller: _serverCtl,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              isDense: true,
              labelText: 'Server URL',
              hintText: 'https://api.your-bessy.example',
            ),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton.icon(
              onPressed: () => ctl.configure(_serverCtl.text),
              icon: const Icon(Icons.cloud_outlined, size: 18),
              label: const Text('Save server'),
            ),
          ),
        ],
      );
    } else if (!state.isSignedIn) {
      body = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Server: ${state.serverUrl}', style: small),
          const SizedBox(height: 10),
          TextField(
            controller: _emailCtl,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            decoration: const InputDecoration(
              border: OutlineInputBorder(), isDense: true, labelText: 'Email'),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _passwordCtl,
            obscureText: true,
            decoration: const InputDecoration(
              border: OutlineInputBorder(), isDense: true, labelText: 'Password'),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              TextButton(
                onPressed: () => ctl.configure(null),
                child: const Text('Change server'),
              ),
              const Spacer(),
              OutlinedButton(
                onPressed: state.busy
                    ? null
                    : () => ctl.signUp(_emailCtl.text.trim(), _passwordCtl.text),
                child: const Text('Create account'),
              ),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: state.busy
                    ? null
                    : () => ctl.signIn(_emailCtl.text.trim(), _passwordCtl.text),
                child: const Text('Sign in'),
              ),
            ],
          ),
        ],
      );
    } else {
      body = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.check_circle_outline, size: 18, color: scheme.primary),
              const SizedBox(width: 8),
              Expanded(child: Text('Signed in as ${state.session!.email}')),
            ],
          ),
          if (state.lastSyncedAt != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                'Last synced ${state.lastSyncedAt!.toLocal()} · '
                '${state.lastChangeCount} change${state.lastChangeCount == 1 ? '' : 's'}',
                style: small,
              ),
            ),
          const SizedBox(height: 10),
          Row(
            children: [
              TextButton(onPressed: ctl.signOut, child: const Text('Sign out')),
              const Spacer(),
              FilledButton.icon(
                onPressed: state.busy ? null : ctl.syncNow,
                icon: state.busy
                    ? const SizedBox(
                        width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.sync, size: 18),
                label: const Text('Sync now'),
              ),
            ],
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _SectionHeader('Cloud sync (beta)'),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
          child: body,
        ),
        if (state.message != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Text(state.message!,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: scheme.primary)),
          ),
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Text(
        text.toUpperCase(),
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: Theme.of(context).colorScheme.primary,
              letterSpacing: 1.1,
              fontWeight: FontWeight.w700,
            ),
      ),
    );
  }
}
