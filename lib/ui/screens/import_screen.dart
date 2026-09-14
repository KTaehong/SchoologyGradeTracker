import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/models/assignment.dart';
import '../../domain/models/course.dart';
import '../../import/ocr_service.dart';
import '../../import/screenshot_classifier.dart';
import '../../state/providers.dart';

/// The screenshot import flow. Reads a grade screenshot (on-device OCR on
/// mobile, or pasted text anywhere), then cascades: auto-sort into a class →
/// if it can't, the student picks; then auto-sort into a section → if it can't,
/// the student picks. Finally the rows are reviewed and committed to the
/// gradebook.
class ImportScreen extends ConsumerStatefulWidget {
  const ImportScreen({super.key, this.presetSectionId, this.presetCategoryId});

  /// When launched from a course section ("Add from photo"), the class and
  /// section are already known and locked.
  final String? presetSectionId;
  final String? presetCategoryId;

  @override
  ConsumerState<ImportScreen> createState() => _ImportScreenState();
}

class _ImportScreenState extends ConsumerState<ImportScreen> {
  List<String>? _lines;
  String? _classId;
  int _catIndex = -1;
  bool _classAuto = false;
  bool _catAuto = false;
  bool _newClass = false;
  bool _busy = false;
  String? _error;

  final _pasteCtl = TextEditingController();
  final _newClassCtl = TextEditingController();
  final List<_RowCtl> _rows = [];

  bool get _locked => widget.presetSectionId != null;

  @override
  void initState() {
    super.initState();
    if (_locked) {
      _classId = widget.presetSectionId;
      // resolve category index after first build (needs providers)
      WidgetsBinding.instance.addPostFrameCallback((_) => _applyPreset());
    }
  }

  void _applyPreset() {
    final course = ref.read(gradebookProvider.notifier).courseById(_classId!);
    final cats = course?.currentPeriod?.categories ?? const [];
    setState(() {
      _catIndex = cats.indexWhere((c) => c.id == widget.presetCategoryId);
      _classAuto = false;
      _catAuto = false;
      if (_rows.isEmpty) _rows.add(_RowCtl());
    });
  }

  @override
  void dispose() {
    _pasteCtl.dispose();
    _newClassCtl.dispose();
    for (final r in _rows) {
      r.dispose();
    }
    super.dispose();
  }

  Future<void> _pickImage({required bool camera}) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await OcrService.pickAndRecognize(camera: camera);
      if (result == null) {
        setState(() => _busy = false);
        return;
      }
      _ingest(result.lines);
    } catch (e) {
      setState(() {
        _busy = false;
        _error = '$e';
      });
    }
  }

  void _readPasted() {
    final lines = _pasteCtl.text
        .split('\n')
        .map((l) => l.trim())
        .where((l) => l.isNotEmpty)
        .toList();
    if (lines.isEmpty) {
      setState(() => _error = 'Paste the text from your screenshot first.');
      return;
    }
    _ingest(lines);
  }

  void _ingest(List<String> lines) {
    final courses = ref.read(gradebookProvider);
    for (final r in _rows) {
      r.dispose();
    }
    _rows.clear();

    if (!_locked) {
      _classId = ScreenshotClassifier.matchCourseId(lines, courses);
      _classAuto = _classId != null;
      _newClass = false;
      _catIndex = -1;
      _catAuto = false;
      if (_classId != null) {
        final period = courses
            .firstWhere((c) => c.sectionId == _classId)
            .currentPeriod;
        if (period != null) {
          _catIndex = ScreenshotClassifier.matchCategoryIndex(period, lines);
          _catAuto = _catIndex >= 0;
        }
      }
    }
    for (final row in ScreenshotClassifier.extractRows(lines)) {
      _rows.add(_RowCtl(
        title: row.title,
        earned: row.earned,
        max: row.max,
      ));
    }
    if (_rows.isEmpty) _rows.add(_RowCtl());
    setState(() {
      _lines = lines;
      _busy = false;
      _error = null;
    });
  }

  List<Course> get _courses => ref.watch(gradebookProvider);

  Course? get _selectedCourse {
    if (_classId == null || _classId == '__new') return null;
    for (final c in _courses) {
      if (c.sectionId == _classId) return c;
    }
    return null;
  }

  void _commit() {
    final gb = ref.read(gradebookProvider.notifier);
    Course? course;
    if (_newClass) {
      final name = _newClassCtl.text.trim();
      if (name.isEmpty) {
        setState(() => _error = 'Name the new class.');
        return;
      }
      course = gb.createClass(name);
      _classId = course.sectionId;
    } else {
      course = _selectedCourse;
    }
    if (course == null) {
      setState(() => _error = 'Pick the class first.');
      return;
    }
    final period = course.currentPeriod;
    if (period == null || _catIndex < 0 || _catIndex >= period.categories.length) {
      setState(() => _error = 'Pick the section first.');
      return;
    }
    final category = period.categories[_catIndex];

    final items = <Assignment>[];
    for (final r in _rows) {
      final title = r.titleCtl.text.trim();
      final maxTxt = r.maxCtl.text.trim();
      if (title.isEmpty || maxTxt.isEmpty) continue;
      final max = double.tryParse(maxTxt);
      if (max == null) continue;
      items.add(Assignment(
        id: 'imp-${DateTime.now().microsecondsSinceEpoch}-${items.length}',
        title: title,
        earned: double.tryParse(r.earnedCtl.text.trim()),
        maxPoints: max,
        categoryId: category.id,
      ));
    }
    if (items.isEmpty) {
      setState(() => _error = 'Add at least one item with a name and “out of”.');
      return;
    }
    gb.addAssignments(course.sectionId, period.id, category.id, items);
    Navigator.of(context).pop(_ImportResult(course.title, category.title, items.length));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_locked ? 'Add from photo' : 'Import from a screenshot'),
      ),
      body: _lines == null && !_locked ? _buildCapture() : _buildResolve(),
    );
  }

  Widget _buildCapture() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        Text(
          'Snap or upload your Schoology grades screenshot. Bessy reads it with '
          'on-device text recognition, then files it automatically.',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: 20),
        if (OcrService.isSupported) ...[
          FilledButton.icon(
            onPressed: _busy ? null : () => _pickImage(camera: true),
            icon: const Icon(Icons.photo_camera_outlined),
            label: const Text('Take a photo'),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: _busy ? null : () => _pickImage(camera: false),
            icon: const Icon(Icons.image_outlined),
            label: const Text('Choose a screenshot'),
          ),
          const SizedBox(height: 20),
          const _OrDivider(),
          const SizedBox(height: 12),
        ],
        Text('Paste the text from your screenshot',
            style: Theme.of(context).textTheme.labelLarge),
        if (!OcrService.isSupported)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              'On-device OCR runs on the phone app. On this platform, paste the '
              'lines you see instead.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.outline),
            ),
          ),
        const SizedBox(height: 8),
        TextField(
          controller: _pasteCtl,
          minLines: 4,
          maxLines: 10,
          decoration: const InputDecoration(
            border: OutlineInputBorder(),
            hintText: 'Calculus BC AP: P5\n'
                'Form: HW/CW/Part. (10%)\n'
                'HW: 8.1 Basic Integration Rules 9/01/26 10 / 10',
          ),
        ),
        const SizedBox(height: 12),
        FilledButton(onPressed: _readPasted, child: const Text('Read this text')),
        if (_busy) ...[
          const SizedBox(height: 20),
          const Center(child: CircularProgressIndicator()),
        ],
        if (_error != null) ...[
          const SizedBox(height: 16),
          _ErrorText(_error!),
        ],
      ],
    );
  }

  Widget _buildResolve() {
    final scheme = Theme.of(context).colorScheme;
    final course = _selectedCourse;
    final cats = course?.currentPeriod?.categories ?? const [];

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        if (_lines != null && !_locked) _OcrPreview(lines: _lines!),
        if (_lines != null && !_locked) const SizedBox(height: 20),

        // CLASS
        _FieldLabel(
          label: 'Class',
          status: _locked
              ? null
              : _classId != null
                  ? (_classAuto ? _Status.auto : _Status.set)
                  : _Status.pick,
        ),
        const SizedBox(height: 6),
        if (_locked)
          _LockedValue(_courseTitle(course))
        else
          DropdownButtonFormField<String>(
            initialValue: _classId,
            isExpanded: true,
            decoration: const InputDecoration(border: OutlineInputBorder()),
            hint: const Text('Choose a class'),
            items: [
              for (final c in _courses)
                DropdownMenuItem(value: c.sectionId, child: Text(c.title, overflow: TextOverflow.ellipsis)),
              const DropdownMenuItem(value: '__new', child: Text('＋ New class…')),
            ],
            onChanged: (v) => setState(() {
              _classId = v;
              _newClass = v == '__new';
              _classAuto = false;
              _catIndex = -1;
              _catAuto = false;
            }),
          ),
        if (_newClass) ...[
          const SizedBox(height: 8),
          TextField(
            controller: _newClassCtl,
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              labelText: 'New class name',
            ),
          ),
        ],
        const SizedBox(height: 18),

        // SECTION
        _FieldLabel(
          label: 'Section',
          status: _locked || _classId == null
              ? null
              : _catIndex >= 0
                  ? (_catAuto ? _Status.auto : _Status.set)
                  : _Status.pick,
        ),
        const SizedBox(height: 6),
        if (_locked)
          _LockedValue(_catIndex >= 0 && _catIndex < cats.length
              ? cats[_catIndex].title
              : 'Section')
        else if (_newClass)
          _LockedValue('New classes start with Form/Sum sections — chosen after creating')
        else
          DropdownButtonFormField<int>(
            initialValue: _catIndex >= 0 ? _catIndex : null,
            isExpanded: true,
            decoration: const InputDecoration(border: OutlineInputBorder()),
            hint: Text(_classId == null ? 'Choose a class first' : 'Choose a section'),
            items: [
              for (var i = 0; i < cats.length; i++)
                DropdownMenuItem(value: i, child: Text(cats[i].title, overflow: TextOverflow.ellipsis)),
            ],
            onChanged: _classId == null
                ? null
                : (v) => setState(() {
                      _catIndex = v ?? -1;
                      _catAuto = false;
                    }),
          ),
        const SizedBox(height: 22),

        // ROWS
        Text('Assignments', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 4),
        Text(
          'Bessy reads the score off each row — double-check names, since OCR can '
          'misread them.',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.outline),
        ),
        const SizedBox(height: 8),
        for (final r in _rows) _RowEditor(row: r, onDelete: () => _deleteRow(r)),
        TextButton.icon(
          onPressed: () => setState(() => _rows.add(_RowCtl())),
          icon: const Icon(Icons.add, size: 18),
          label: const Text('Add another item'),
        ),
        const SizedBox(height: 16),
        if (_error != null) ...[_ErrorText(_error!), const SizedBox(height: 12)],
        FilledButton(
          onPressed: _commit,
          style: FilledButton.styleFrom(
            minimumSize: const Size.fromHeight(48),
          ),
          child: const Text('Add to gradebook'),
        ),
      ],
    );
  }

  void _deleteRow(_RowCtl r) {
    setState(() {
      _rows.remove(r);
      r.dispose();
    });
  }

  String _courseTitle(Course? c) => c?.title ?? 'Class';
}

/// Returned to the caller so it can show a confirmation.
class _ImportResult {
  _ImportResult(this.courseTitle, this.categoryTitle, this.count);
  final String courseTitle;
  final String categoryTitle;
  final int count;
}

enum _Status { auto, set, pick }

class _FieldLabel extends StatelessWidget {
  const _FieldLabel({required this.label, this.status});
  final String label;
  final _Status? status;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: Theme.of(context).textTheme.labelLarge),
        if (status != null) _StatusChip(status!),
      ],
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip(this.status);
  final _Status status;

  @override
  Widget build(BuildContext context) {
    final (text, fg, bg, icon) = switch (status) {
      _Status.auto => ('auto-detected', const Color(0xFF15803D), const Color(0xFFE7F4EC), Icons.check_circle_outline),
      _Status.set => ('set', const Color(0xFF15803D), const Color(0xFFE7F4EC), Icons.check_circle_outline),
      _Status.pick => ('pick one', const Color(0xFFB45309), const Color(0xFFFBF0E2), Icons.error_outline),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: fg),
          const SizedBox(width: 4),
          Text(text, style: TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class _LockedValue extends StatelessWidget {
  const _LockedValue(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(text),
    );
  }
}

class _OcrPreview extends StatelessWidget {
  const _OcrPreview({required this.lines});
  final List<String> lines;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF0E0E1A),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        lines.join('\n'),
        style: const TextStyle(
            color: Color(0xFFC8C8E0), fontFamily: 'monospace', fontSize: 11.5),
      ),
    );
  }
}

class _OrDivider extends StatelessWidget {
  const _OrDivider();
  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme.outlineVariant;
    return Row(children: [
      Expanded(child: Divider(color: c)),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10),
        child: Text('or', style: Theme.of(context).textTheme.bodySmall),
      ),
      Expanded(child: Divider(color: c)),
    ]);
  }
}

class _ErrorText extends StatelessWidget {
  const _ErrorText(this.text);
  final String text;
  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.error_outline, size: 16, color: Theme.of(context).colorScheme.error),
        const SizedBox(width: 6),
        Expanded(
          child: Text(text,
              style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 13)),
        ),
      ],
    );
  }
}

class _RowEditor extends StatelessWidget {
  const _RowEditor({required this.row, required this.onDelete});
  final _RowCtl row;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: row.titleCtl,
              decoration: const InputDecoration(
                isDense: true,
                border: OutlineInputBorder(),
                hintText: 'Assignment',
              ),
            ),
          ),
          const SizedBox(width: 6),
          SizedBox(
            width: 54,
            child: TextField(
              controller: row.earnedCtl,
              textAlign: TextAlign.center,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(isDense: true, border: OutlineInputBorder(), hintText: '—'),
            ),
          ),
          const Padding(padding: EdgeInsets.symmetric(horizontal: 4), child: Text('/')),
          SizedBox(
            width: 54,
            child: TextField(
              controller: row.maxCtl,
              textAlign: TextAlign.center,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(isDense: true, border: OutlineInputBorder(), hintText: '—'),
            ),
          ),
          IconButton(
            onPressed: onDelete,
            icon: const Icon(Icons.close, size: 18),
            visualDensity: VisualDensity.compact,
          ),
        ],
      ),
    );
  }
}

class _RowCtl {
  _RowCtl({String? title, double? earned, double? max})
      : titleCtl = TextEditingController(text: title ?? ''),
        earnedCtl = TextEditingController(text: earned == null ? '' : _trim(earned)),
        maxCtl = TextEditingController(text: max == null ? '' : _trim(max));

  final TextEditingController titleCtl;
  final TextEditingController earnedCtl;
  final TextEditingController maxCtl;

  void dispose() {
    titleCtl.dispose();
    earnedCtl.dispose();
    maxCtl.dispose();
  }

  static String _trim(double v) =>
      v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(1);
}
