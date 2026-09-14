import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/grade_engine.dart';
import '../../domain/models/assignment.dart';
import '../../domain/models/category.dart';
import '../../domain/models/course.dart';
import '../../domain/models/grading_period.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/grade_pill.dart';
import 'final_grade_screen.dart';
import 'import_screen.dart';

/// Course detail: overall grade, weighted-category breakdown, and inline
/// What-If editing of any score.
class CourseDetailScreen extends ConsumerWidget {
  const CourseDetailScreen({super.key, required this.sectionId});

  final String sectionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final engine = ref.watch(gradeEngineProvider);
    final course = ref.watch(whatIfProvider(sectionId));
    final controller = ref.read(whatIfProvider(sectionId).notifier);
    final period = course?.currentPeriod;

    return Scaffold(
      appBar: AppBar(
        title: Text(course?.title ?? 'Course'),
        actions: [
          if (controller.isDirty)
            TextButton.icon(
              onPressed: controller.reset,
              icon: const Icon(Icons.restart_alt_rounded, size: 18),
              label: const Text('Reset'),
            ),
        ],
      ),
      body: course == null
          ? const Center(child: Text('Course not found.'))
          : period == null
              ? const Center(child: Text('No grading periods.'))
              : _DetailBody(
                  course: course,
                  period: period,
                  engine: engine,
                  controller: controller,
                ),
    );
  }
}

class _DetailBody extends StatelessWidget {
  const _DetailBody({
    required this.course,
    required this.period,
    required this.engine,
    required this.controller,
  });

  final Course course;
  final GradingPeriod period;
  final GradeEngine engine;
  final WhatIfController controller;

  @override
  Widget build(BuildContext context) {
    final projected = engine.evaluate(period);
    final basePeriod = controller.base?.currentPeriod;
    final baseResult = basePeriod == null ? null : engine.evaluate(basePeriod);
    final dirty = controller.isDirty;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        _GradeHeader(
          projected: projected.percent,
          projectedLetter: projected.letter,
          original: dirty ? baseResult?.percent : null,
          dirty: dirty,
        ),
        const SizedBox(height: 12),
        if (projected.schoologyFinalGrade != null && !dirty)
          _ValidationBanner(result: projected),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: () {
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => FinalGradeScreen(
                  courseTitle: course.title,
                  currentPercent: projected.percent ?? 0,
                ),
              ),
            );
          },
          icon: const Icon(Icons.flag_outlined),
          label: const Text('What do I need on the final?'),
        ),
        const SizedBox(height: 12),
        _SemesterGrades(course: course, engine: engine),
        for (final category in period.categories)
          _CategorySection(
            category: category,
            weighted: period.isWeighted,
            percent: engine.categoryPercent(category),
            onEdit: (a) => _editScore(context, a),
            onAdd: () => _addHypothetical(context, category),
            onAddPhoto: () => _addPhoto(context, category),
          ),
      ],
    );
  }

  Future<void> _addPhoto(BuildContext context, Category category) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ImportScreen(
          presetSectionId: course.sectionId,
          presetCategoryId: category.id,
        ),
      ),
    );
  }

  Future<void> _editScore(BuildContext context, Assignment a) async {
    final controllerText = TextEditingController(
      text: a.earned == null ? '' : _trim(a.earned!),
    );
    final _ScoreEdit? result;
    try {
      result = await showModalBottomSheet<_ScoreEdit>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (context) {
          return Padding(
            padding: EdgeInsets.only(
              left: 20,
              right: 20,
              top: 8,
              bottom: MediaQuery.of(context).viewInsets.bottom + 20,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(a.title, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 4),
                Text(
                  'Out of ${_trim(a.maxPoints)} points',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: controllerText,
                  autofocus: true,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: const InputDecoration(
                    labelText: 'Points earned',
                    border: OutlineInputBorder(),
                  ),
                  onSubmitted: (v) =>
                      Navigator.pop(context, _ScoreEdit(double.tryParse(v))),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    TextButton(
                      onPressed: () => Navigator.pop(
                        context,
                        const _ScoreEdit(null, clear: true),
                      ),
                      child: const Text('Clear score'),
                    ),
                    const Spacer(),
                    FilledButton(
                      onPressed: () => Navigator.pop(
                        context,
                        _ScoreEdit(double.tryParse(controllerText.text)),
                      ),
                      child: const Text('Apply What-If'),
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      );
    } finally {
      controllerText.dispose();
    }
    if (result == null) return;
    controller.setScore(period.id, a.id, result.clear ? null : result.value);
  }

  Future<void> _addHypothetical(BuildContext context, Category category) async {
    final titleC = TextEditingController(text: 'Hypothetical');
    final earnedC = TextEditingController();
    final maxC = TextEditingController(text: '100');
    final bool? ok;
    try {
      ok = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text('Add to ${category.title}'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: titleC,
                decoration: const InputDecoration(labelText: 'Title'),
              ),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: earnedC,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: const InputDecoration(labelText: 'Earned'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: maxC,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: const InputDecoration(labelText: 'Out of'),
                    ),
                  ),
                ],
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Add'),
            ),
          ],
        ),
      );
      if (ok != true) return;
      final earned = double.tryParse(earnedC.text);
      final max = double.tryParse(maxC.text);
      if (earned == null || max == null) return;
      controller.addHypothetical(
        period.id,
        category.id,
        title: titleC.text.isEmpty ? 'Hypothetical' : titleC.text,
        earned: earned,
        maxPoints: max,
      );
    } finally {
      titleC.dispose();
      earnedC.dispose();
      maxC.dispose();
    }
  }
}

class _ScoreEdit {
  const _ScoreEdit(this.value, {this.clear = false});
  final double? value;
  final bool clear;
}

class _GradeHeader extends StatelessWidget {
  const _GradeHeader({
    required this.projected,
    required this.projectedLetter,
    required this.original,
    required this.dirty,
  });

  final double? projected;
  final String? projectedLetter;
  final double? original;
  final bool dirty;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    dirty ? 'Projected grade' : 'Current grade',
                    style: Theme.of(context).textTheme.labelMedium,
                  ),
                  if (dirty && original != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      'Was ${original.asPercent}',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.outline,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            GradePill(percent: projected, letter: projectedLetter, large: true),
          ],
        ),
      ),
    );
  }
}

class _ValidationBanner extends StatelessWidget {
  const _ValidationBanner({required this.result});

  final dynamic result; // CourseGrade

  @override
  Widget build(BuildContext context) {
    final matches = result.matchesSchoology() as bool;
    final color = matches ? const Color(0xFF16A34A) : const Color(0xFFDC2626);
    final text = matches
        ? 'Matches Schoology’s grade'
        : 'Differs from Schoology by ${(result.discrepancyPoints as double).abs().toStringAsFixed(1)} pts';
    return Row(
      children: [
        Icon(
          matches ? Icons.check_circle_outline : Icons.error_outline,
          size: 16,
          color: color,
        ),
        const SizedBox(width: 6),
        Text(
          text,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(color: color),
        ),
      ],
    );
  }
}

class _CategorySection extends StatelessWidget {
  const _CategorySection({
    required this.category,
    required this.weighted,
    required this.percent,
    required this.onEdit,
    required this.onAdd,
    required this.onAddPhoto,
  });

  final Category category;
  final bool weighted;
  final double? percent;
  final void Function(Assignment) onEdit;
  final VoidCallback onAdd;
  final VoidCallback onAddPhoto;

  @override
  Widget build(BuildContext context) {
    final weightLabel = weighted
        ? '${(category.weight * 100).toStringAsFixed(0)}%'
        : null;
    return Padding(
      padding: const EdgeInsets.only(top: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  category.title,
                  style: Theme.of(context).textTheme.titleSmall
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              if (weightLabel != null)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: Text(
                    'weight $weightLabel',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.outline,
                    ),
                  ),
                ),
              GradePill(percent: percent),
            ],
          ),
          if (weighted) ...[
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: category.weight.clamp(0, 1).toDouble(),
                minHeight: 5,
                backgroundColor: Theme.of(context)
                    .colorScheme
                    .surfaceContainerHighest,
              ),
            ),
          ],
          const SizedBox(height: 4),
          for (final a in category.assignments)
            _AssignmentTile(assignment: a, onTap: () => onEdit(a)),
          Row(
            children: [
              TextButton.icon(
                onPressed: onAddPhoto,
                icon: const Icon(Icons.photo_camera_outlined, size: 18),
                label: const Text('Add from photo'),
              ),
              TextButton.icon(
                onPressed: onAdd,
                icon: const Icon(Icons.add, size: 18),
                label: const Text('What-If'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _AssignmentTile extends StatelessWidget {
  const _AssignmentTile({required this.assignment, required this.onTap});

  final Assignment assignment;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final a = assignment;
    final scheme = Theme.of(context).colorScheme;
    final String trailing;
    if (a.excused) {
      trailing = 'Excused';
    } else if (a.earned == null) {
      trailing = '— / ${_trim(a.maxPoints)}';
    } else {
      trailing = '${_trim(a.earned!)} / ${_trim(a.maxPoints)}';
    }
    final pct = (a.isGraded && a.maxPoints > 0)
        ? a.earned! / a.maxPoints
        : null;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
        child: Row(
          children: [
            Expanded(
              child: Row(
                children: [
                  Flexible(
                    child: Text(
                      a.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (a.isHypothetical) ...[
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 1,
                      ),
                      decoration: BoxDecoration(
                        color: scheme.primary.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        'What-If',
                        style: TextStyle(
                          fontSize: 10,
                          color: scheme.primary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            Text(
              trailing,
              style: TextStyle(
                color: a.excused || a.earned == null
                    ? scheme.outline
                    : AppTheme.gradeColor(pct),
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(width: 4),
            Icon(Icons.edit_outlined, size: 15, color: scheme.outline),
          ],
        ),
      ),
    );
  }
}

/// The midterm (Q1 & Q2 + midterm exam) and final (Q3 & Q4 + final exam)
/// semester grades, each editable to enter its exam score and weight.
class _SemesterGrades extends ConsumerWidget {
  const _SemesterGrades({required this.course, required this.engine});

  final Course course;
  final GradeEngine engine;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final semesters = [
      for (final s in const [1, 2])
        if (engine.courseHasSemester(course, s)) s,
    ];
    if (semesters.isEmpty) return const SizedBox.shrink();

    return Card(
      color: scheme.surfaceContainerHighest,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 10, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Midterm & final',
              style: Theme.of(context)
                  .textTheme
                  .titleSmall
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 2),
            Text(
              'Midterm counts Q1 & Q2; the final counts Q3 & Q4 — each blended '
              'with its exam.',
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: scheme.outline),
            ),
            const SizedBox(height: 4),
            for (final s in semesters) _row(context, ref, s),
          ],
        ),
      ),
    );
  }

  Widget _row(BuildContext context, WidgetRef ref, int semester) {
    final scheme = Theme.of(context).colorScheme;
    final pct = engine.semesterGrade(course, semester);
    final letter = engine.semesterLetter(course, semester);
    final exam = course.examForSemester(semester);
    final label = semester == 1 ? 'Midterm' : 'Final';
    final quarters = semester == 1 ? 'Q1 & Q2' : 'Q3 & Q4';
    final weightPct =
        (course.examWeightForSemester(semester) * 100).toStringAsFixed(0);
    final examStr = (exam != null && exam.isGraded)
        ? 'exam ${_trim(exam.earned!)}/${_trim(exam.maxPoints)} · $weightPct%'
        : 'tap to add exam';

    return InkWell(
      onTap: () => _editExam(context, ref, semester),
      borderRadius: BorderRadius.circular(10),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 4),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: Theme.of(context)
                        .textTheme
                        .bodyLarge
                        ?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 1),
                  Text(
                    '$quarters · $examStr',
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(color: scheme.outline),
                  ),
                ],
              ),
            ),
            GradePill(percent: pct, letter: letter),
            const SizedBox(width: 4),
            Icon(Icons.edit_outlined, size: 15, color: scheme.outline),
          ],
        ),
      ),
    );
  }

  Future<void> _editExam(
      BuildContext context, WidgetRef ref, int semester) async {
    final gb = ref.read(gradebookProvider.notifier);
    final live = gb.courseById(course.sectionId) ?? course;
    final exam = live.examForSemester(semester);
    final earnedC = TextEditingController(
        text: exam?.earned == null ? '' : _trim(exam!.earned!));
    final maxC = TextEditingController(text: _trim(exam?.maxPoints ?? 100));
    final weightC = TextEditingController(
        text: (live.examWeightForSemester(semester) * 100).toStringAsFixed(0));
    final label = semester == 1 ? 'Midterm exam' : 'Final exam';
    final quarters = semester == 1 ? 'Q1 & Q2' : 'Q3 & Q4';

    try {
      final action = await showModalBottomSheet<String>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (context) => Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 4,
            bottom: MediaQuery.of(context).viewInsets.bottom + 20,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 4),
              Text(
                'The $quarters average (equal weight) makes up the rest of the '
                'semester grade.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: earnedC,
                      autofocus: true,
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(
                        labelText: 'Score',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 10),
                    child: Text('/'),
                  ),
                  Expanded(
                    child: TextField(
                      controller: maxC,
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(
                        labelText: 'Out of',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: weightC,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(
                  labelText: 'Exam weight',
                  helperText: 'Exam’s share of the semester grade',
                  suffixText: '%',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  TextButton(
                    onPressed: () => Navigator.pop(context, 'clear'),
                    child: const Text('Clear exam'),
                  ),
                  const Spacer(),
                  FilledButton(
                    onPressed: () => Navigator.pop(context, 'save'),
                    child: const Text('Save'),
                  ),
                ],
              ),
            ],
          ),
        ),
      );

      if (action == 'save') {
        final w = double.tryParse(weightC.text.trim());
        if (w != null) {
          ref
              .read(gradebookProvider.notifier)
              .setExamWeight(course.sectionId, semester, w / 100);
        }
        final max = double.tryParse(maxC.text.trim()) ?? 100;
        final earned = double.tryParse(earnedC.text.trim());
        ref.read(gradebookProvider.notifier).setExamScore(
              course.sectionId,
              semester,
              earned: earned,
              maxPoints: max,
            );
      } else if (action == 'clear') {
        ref.read(gradebookProvider.notifier).setExamScore(
              course.sectionId,
              semester,
              earned: null,
              clear: true,
            );
      }
    } finally {
      earnedC.dispose();
      maxC.dispose();
      weightC.dispose();
    }
  }
}

/// Trim trailing ".0" from whole numbers for display.
String _trim(double v) =>
    v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(1);
