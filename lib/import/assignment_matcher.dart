import '../domain/models/course.dart';
import 'ical_parser.dart';

/// Attaches a calendar assignment to the class it belongs to.
///
/// The Schoology iCal feed names the assignment and its due date but NOT the
/// class. So we infer the class by matching the feed item's title against the
/// assignments the student has already imported into their gradebook: if
/// "HW: 8.1 Basic Integration Rules" is in the feed and also sits in Calculus
/// BC AP, the due date is Calculus's. Best-effort — returns null when there's
/// no confident match, and the UI shows those as "unfiled".
class AssignmentMatcher {
  static String _norm(String s) =>
      s.toLowerCase().replaceAll(RegExp(r'\s+'), ' ').trim();

  /// Returns the section id of the course whose gradebook contains an assignment
  /// matching [event]'s title, or null.
  static String? matchCourseId(IcalEvent event, List<Course> courses) {
    final target = _norm(event.summary);
    if (target.isEmpty) return null;

    String? containsMatch;
    for (final course in courses) {
      for (final period in course.periods) {
        for (final category in period.categories) {
          for (final a in category.assignments) {
            final name = _norm(a.title);
            if (name.isEmpty) continue;
            if (name == target) return course.sectionId; // exact wins
            if (containsMatch == null &&
                target.length > 6 &&
                (name.contains(target) || target.contains(name))) {
              containsMatch = course.sectionId;
            }
          }
        }
      }
    }
    return containsMatch;
  }
}
