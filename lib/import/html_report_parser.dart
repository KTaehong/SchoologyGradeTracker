import 'package:html/parser.dart' as html;

import '../domain/models/assignment.dart';
import '../domain/models/category.dart';
import '../domain/models/course.dart';
import '../domain/models/grading_period.dart';

/// Palette reused for imported course color bars.
const _palette = [
  0xFF4F46E5, 0xFF0EA5E9, 0xFF059669, 0xFFDB2777,
  0xFFD97706, 0xFF7C3AED, 0xFF0891B2, 0xFFC026D3,
];

/// Parses the visible text of a saved Schoology **Grades** page into the app's
/// Course model. Works off the page's text lines rather than fragile DOM
/// selectors, so it survives Schoology markup changes and shares its grammar
/// with the screenshot importer. The full 4-level hierarchy is recovered:
/// Course → Grading Period (weighted) → Category (weighted) → Assignment.
class HtmlReportParser {
  static List<Course> parse(String htmlSource) {
    final doc = html.parse(htmlSource);
    final text = doc.body?.text ?? doc.documentElement?.text ?? '';
    final lines = text
        .split('\n')
        .map((l) => l.replaceAll(' ', ' ').trim())
        .where((l) => l.isNotEmpty)
        .toList();
    return GradeTextParser.parse(lines);
  }
}

/// The shared line grammar. Public so it can be unit-tested directly against the
/// exact text a student sees on the Grades page.
class GradeTextParser {
  // An earned/max score anchored at the end of a line (after the due date is
  // stripped) — this is the real grade, not a fragment of the date.
  static final RegExp _scoreEnd =
      RegExp(r'(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)\s*$');
  static final RegExp _date = RegExp(
      r'\d{1,2}/\d{1,2}/\d{2,4}(\s+\d{1,2}:\d{2}\s*[ap]m)?',
      caseSensitive: false);
  // "Quarter 1 ... (25%)" / "Semester 1 ... (50%)"
  static final RegExp _period = RegExp(
      r'^(Quarter|Semester|Q\d|Sem)\b.*?\((\d+(?:\.\d+)?)%\)',
      caseSensitive: false);
  // "Form: HW/CW/Part. (20%)" / "Sum: Test/Proj/Essay (60%)" / "Essays (30%)"
  static final RegExp _category =
      RegExp(r'^(.{1,40}?)\((\d+(?:\.\d+)?)%\)');
  // A course header: a name carrying a section/period suffix.
  static final RegExp _courseSuffix = RegExp(
      r':\s*(P\d|Period\b|Per\b|\d{4,})',
      caseSensitive: false);
  static final RegExp _trailingDash = RegExp(r'[\-–—]\s*$');

  static List<Course> parse(List<String> lines) {
    final courses = <Course>[];
    _MutCourse? course;
    _MutPeriod? period;
    _MutCategory? category;
    String? lastPlain;
    var colorIx = 0;

    void closeCourse() {
      if (course != null) courses.add(course.build(colorIx++ % _palette.length));
    }

    for (final raw in lines) {
      final line = raw.trim();
      // The line with the due date removed, so an end-anchored score match sees
      // the real grade rather than a slice of the date.
      final cleaned = line.replaceAll(_date, '').trim();

      // 1) Grading period header.
      final pm = _period.firstMatch(line);
      if (pm != null) {
        course ??= _MutCourse(lastPlain ?? 'Course');
        final title = line.split(':').first.trim();
        period = _MutPeriod(
          title.isEmpty ? 'Grading period' : title,
          double.parse(pm.group(2)!) / 100,
        );
        course.periods.add(period);
        category = null;
        continue;
      }

      // 2) Category header (weighted). Must not be a bare score line.
      final cm = _category.firstMatch(line);
      if (cm != null && !_scoreEnd.hasMatch(cleaned) && _looksLikeCategory(cm.group(1)!)) {
        period ??= _fallbackPeriod(course ??= _MutCourse(lastPlain ?? 'Course'));
        category = _MutCategory(cm.group(1)!.trim(), double.parse(cm.group(2)!) / 100);
        period.categories.add(category);
        continue;
      }

      // 3) Assignment row: has an end-of-line score, or a due date (ungraded).
      final sm = _scoreEnd.firstMatch(cleaned);
      final hasDate = _date.hasMatch(line);
      if (sm != null || hasDate) {
        course ??= _MutCourse(lastPlain ?? 'Course');
        period ??= _fallbackPeriod(course);
        category ??= _pushCategory(period, 'Assignments');
        final name = _stripName(line);
        if (name.isEmpty) continue;
        final excused = RegExp('excused', caseSensitive: false).hasMatch(line);
        category.assignments.add(Assignment(
          id: 'a-${category.assignments.length}-${name.hashCode}',
          title: name,
          earned: (sm != null && !excused) ? double.parse(sm.group(1)!) : null,
          maxPoints: sm != null ? double.parse(sm.group(2)!) : 0,
          excused: excused,
        ));
        continue;
      }

      // 4) Course header (name with a section/period suffix).
      if (_courseSuffix.hasMatch(line)) {
        closeCourse();
        course = _MutCourse(line);
        period = null;
        category = null;
        lastPlain = null;
        continue;
      }

      lastPlain = line;
    }
    closeCourse();
    // Discard "courses" that captured no grading data at all (page chrome).
    final result = courses.where((c) => c.periods.isNotEmpty).toList();
    return result;
  }

  static bool _looksLikeCategory(String name) {
    final n = name.trim();
    if (n.isEmpty || n.length > 40) return false;
    // Reject if it's actually a date range that slipped through.
    return !_date.hasMatch(n);
  }

  static String _stripName(String line) => line
      .replaceAll(_date, '')
      .replaceAll(_scoreEnd, '')
      .replaceAll(_trailingDash, '')
      .replaceAll(RegExp(r'\s{2,}'), ' ')
      .trim();

  static _MutPeriod _fallbackPeriod(_MutCourse c) {
    final p = _MutPeriod('Grading period', 1.0);
    c.periods.add(p);
    return p;
  }

  static _MutCategory _pushCategory(_MutPeriod p, String title) {
    final c = _MutCategory(title, 0);
    p.categories.add(c);
    return c;
  }
}

// --- mutable builders (parse-time only) -------------------------------------

class _MutCourse {
  _MutCourse(this.title);
  final String title;
  final List<_MutPeriod> periods = [];

  Course build(int colorIx) {
    final id = 'c-${title.hashCode}';
    final weighted = periods.any((p) => p.categories.any((c) => c.weight > 0));
    return Course(
      sectionId: id,
      title: title,
      colorValue: _palette[colorIx],
      periods: [for (final p in periods) p.build(weighted)],
    );
  }
}

class _MutPeriod {
  _MutPeriod(this.title, this.weight);
  final String title;
  final double weight;
  final List<_MutCategory> categories = [];

  GradingPeriod build(bool weighted) => GradingPeriod(
        id: 'p-${title.hashCode}-${weight.hashCode}',
        title: title,
        weight: weight,
        isWeighted: weighted,
        categories: [for (final c in categories) c.build()],
      );
}

class _MutCategory {
  _MutCategory(this.title, this.weight);
  final String title;
  final double weight;
  final List<Assignment> assignments = [];

  Category build() => Category(
        id: 'cat-${title.hashCode}',
        title: title,
        weight: weight,
        assignments: assignments,
      );
}
