import '../domain/models/course.dart';
import '../domain/models/grading_period.dart';

/// One graded row read off a screenshot: an assignment name and its score.
class ParsedRow {
  ParsedRow({required this.title, this.earned, this.max});

  final String title;
  final double? earned;
  final double? max;
}

/// Turns OCR text lines from a Schoology grade screenshot into structured rows,
/// and best-effort matches them to a class and a category (the "auto-sort" step).
/// When a match can't be made the caller falls back to asking the student —
/// this class only reports what it can and can't determine, it never guesses
/// blindly.
///
/// Pure Dart, no Flutter or plugin imports, so the whole cascade is unit-tested
/// without a device or a real OCR run.
class ScreenshotClassifier {
  // "88 / 100" or "88/100" anchored at the end of a line.
  static final RegExp _score =
      RegExp(r'(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)\s*$');
  // "9/01/26" or "9/01/26 11:59pm" — a due date to strip off the name.
  static final RegExp _date = RegExp(
      r'\d{1,2}/\d{1,2}/\d{2,4}(\s+\d{1,2}:\d{2}\s*[ap]m)?',
      caseSensitive: false);
  // American Heritage category headers: "Form: ...", "Sum: ...".
  static final RegExp _catLine = RegExp(r'^(form:?|sum:?)', caseSensitive: false);
  static final RegExp _trailingDash = RegExp(r'[\-–—]\s*$');

  /// The section id of the first [courses] entry whose title appears in the
  /// screenshot text, or null when no class name was captured.
  static String? matchCourseId(List<String> lines, List<Course> courses) {
    for (final line in lines) {
      final t = line.toLowerCase();
      for (final c in courses) {
        final name = c.title.toLowerCase();
        final head = name.split(':').first.trim();
        if (t.contains(name) || (head.length > 4 && t.contains(head))) {
          return c.sectionId;
        }
      }
    }
    return null;
  }

  /// Index of the category in [period] whose title appears in the screenshot
  /// text, or -1 when the heading wasn't captured (cut off / zoomed in).
  static int matchCategoryIndex(GradingPeriod period, List<String> lines) {
    for (final line in lines) {
      final t = line.toLowerCase();
      for (var i = 0; i < period.categories.length; i++) {
        if (t.contains(period.categories[i].title.toLowerCase())) return i;
      }
    }
    return -1;
  }

  /// Every scored row in the text (name + earned/max). Ungraded rows (no visible
  /// score) are skipped — the point is to log grades you actually received — and
  /// header/date noise is stripped from the name.
  static List<ParsedRow> extractRows(List<String> lines) {
    final rows = <ParsedRow>[];
    for (final line in lines) {
      final s = line.trim();
      if (s.isEmpty || _catLine.hasMatch(s)) continue;
      final m = _score.firstMatch(s);
      if (m == null) continue;
      var name = s
          .replaceAll(_score, '')
          .replaceAll(_date, '')
          .replaceAll(_trailingDash, '')
          .trim();
      if (name.isEmpty) continue;
      rows.add(ParsedRow(
        title: name,
        earned: double.parse(m.group(1)!),
        max: double.parse(m.group(2)!),
      ));
    }
    return rows;
  }
}
