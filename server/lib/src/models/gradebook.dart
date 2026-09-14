/// Server-side view of a synced gradebook.
///
/// The server stores the client's course JSON verbatim (so new client fields —
/// exams, weights — round-trip losslessly) and reasons about *changes* through
/// a flattened index rather than re-modelling the whole hierarchy. That keeps
/// sync fidelity high and change-detection O(n) over assignments.
library;

/// One graded item, flattened out of course → period → category → assignment.
class FlatAssignment {
  const FlatAssignment({
    required this.courseTitle,
    required this.title,
    required this.earned,
    required this.maxPoints,
    required this.excused,
  });

  final String courseTitle;
  final String title;
  final double? earned;
  final double maxPoints;
  final bool excused;

  bool get isGraded => earned != null && !excused;
}

enum GradeChangeType { posted, changed, dropped, raised }

class GradeChange {
  const GradeChange({
    required this.type,
    required this.courseTitle,
    required this.assignmentTitle,
    required this.oldEarned,
    required this.newEarned,
    required this.maxPoints,
  });

  final GradeChangeType type;
  final String courseTitle;
  final String assignmentTitle;
  final double? oldEarned;
  final double? newEarned;
  final double maxPoints;

  Map<String, dynamic> toJson() => {
        'type': type.name,
        'course': courseTitle,
        'assignment': assignmentTitle,
        'oldEarned': oldEarned,
        'newEarned': newEarned,
        'maxPoints': maxPoints,
      };

  /// A short human line for a push notification body.
  String get message {
    String pct(double? e) =>
        (e == null || maxPoints <= 0) ? '—' : '${(e / maxPoints * 100).round()}%';
    switch (type) {
      case GradeChangeType.posted:
        return '$courseTitle: "$assignmentTitle" graded ${pct(newEarned)}';
      case GradeChangeType.raised:
        return '$courseTitle: "$assignmentTitle" went up to ${pct(newEarned)}';
      case GradeChangeType.dropped:
        return '$courseTitle: "$assignmentTitle" dropped to ${pct(newEarned)}';
      case GradeChangeType.changed:
        return '$courseTitle: "$assignmentTitle" changed to ${pct(newEarned)}';
    }
  }
}

/// Flatten a list of raw course JSON maps into `assignmentKey -> FlatAssignment`.
/// The key is `sectionId::assignmentId` so items are compared within their own
/// course even if two courses reuse an assignment id.
Map<String, FlatAssignment> flattenGradebook(List<dynamic> courses) {
  final out = <String, FlatAssignment>{};
  for (final rawCourse in courses) {
    if (rawCourse is! Map) continue;
    final sectionId = '${rawCourse['sectionId']}';
    final courseTitle = '${rawCourse['title'] ?? ''}';
    final periods = rawCourse['periods'];
    if (periods is! List) continue;
    for (final p in periods) {
      if (p is! Map) continue;
      final cats = p['categories'];
      if (cats is! List) continue;
      for (final c in cats) {
        if (c is! Map) continue;
        final items = c['assignments'];
        if (items is! List) continue;
        for (final a in items) {
          if (a is! Map) continue;
          final id = '${a['id']}';
          out['$sectionId::$id'] = FlatAssignment(
            courseTitle: courseTitle,
            title: '${a['title'] ?? ''}',
            earned: (a['earned'] as num?)?.toDouble(),
            maxPoints: (a['maxPoints'] as num?)?.toDouble() ?? 0,
            excused: a['excused'] == true,
          );
        }
      }
    }
  }
  return out;
}

/// Diff a previously-stored gradebook against a freshly-synced one and return
/// the meaningful grade changes (new scores, moved scores). Hypothetical
/// What-If rows never reach the server, so everything here is a real change.
List<GradeChange> detectChanges(
  List<dynamic> oldCourses,
  List<dynamic> newCourses,
) {
  final before = flattenGradebook(oldCourses);
  final after = flattenGradebook(newCourses);
  final changes = <GradeChange>[];

  after.forEach((key, now) {
    final was = before[key];
    // A brand-new graded item, or one that only just received its first score.
    if (was == null || !was.isGraded) {
      if (now.isGraded) {
        changes.add(GradeChange(
          type: GradeChangeType.posted,
          courseTitle: now.courseTitle,
          assignmentTitle: now.title,
          oldEarned: was?.earned,
          newEarned: now.earned,
          maxPoints: now.maxPoints,
        ));
      }
      return;
    }
    // Both graded — did the score move? Compare on percentage to be robust to a
    // maxPoints change, with a tiny epsilon for float noise.
    if (!now.isGraded) return; // score removed → not a notify-worthy event
    final oldPct = was.maxPoints > 0 ? was.earned! / was.maxPoints : 0;
    final newPct = now.maxPoints > 0 ? now.earned! / now.maxPoints : 0;
    if ((oldPct - newPct).abs() > 1e-9) {
      changes.add(GradeChange(
        type: newPct < oldPct ? GradeChangeType.dropped : GradeChangeType.raised,
        courseTitle: now.courseTitle,
        assignmentTitle: now.title,
        oldEarned: was.earned,
        newEarned: now.earned,
        maxPoints: now.maxPoints,
      ));
    }
  });
  return changes;
}
