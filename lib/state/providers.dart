import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/local_store.dart';
import '../data/sample_data.dart';
import '../domain/grade_engine.dart';
import '../domain/models/assignment.dart';
import '../domain/models/category.dart';
import '../domain/models/course.dart';
import '../domain/models/exam.dart';
import '../domain/models/grading_period.dart';
import '../import/assignment_matcher.dart';
import '../import/calendar_service.dart';
import '../import/ical_parser.dart';

/// SharedPreferences instance — overridden in `main()` after it loads.
final sharedPreferencesProvider = Provider<SharedPreferences>(
  (ref) => throw UnimplementedError('Override sharedPreferencesProvider in main()'),
);

/// On-device persistence.
final localStoreProvider = Provider<LocalStore>(
  (ref) => LocalStore(ref.watch(sharedPreferencesProvider)),
);

/// The one grade engine shared across the app.
final gradeEngineProvider = Provider<GradeEngine>((ref) => const GradeEngine());

/// The student's gradebook — the app's single source of truth, persisted to the
/// device. Every import path (screenshot, HTML report, manual) writes here.
final gradebookProvider =
    NotifierProvider<GradebookNotifier, List<Course>>(GradebookNotifier.new);

class GradebookNotifier extends Notifier<List<Course>> {
  @override
  List<Course> build() => ref.read(localStoreProvider).loadCourses();

  void _commit(List<Course> next) {
    state = next;
    // Fire-and-forget persistence; the in-memory state is authoritative.
    ref.read(localStoreProvider).saveCourses(next);
  }

  Course? courseById(String sectionId) {
    for (final c in state) {
      if (c.sectionId == sectionId) return c;
    }
    return null;
  }

  /// Replace the whole gradebook with the demo's sample classes.
  void loadSample() => _commit(sampleCourses());

  /// Wipe all imported grades.
  void clear() => _commit(const []);

  void removeCourse(String sectionId) =>
      _commit([for (final c in state) if (c.sectionId != sectionId) c]);

  /// Merge imported courses in, replacing any with the same section id or title.
  void importCourses(List<Course> courses, {bool replaceAll = false}) {
    if (replaceAll) {
      _commit(courses);
      return;
    }
    final next = [...state];
    for (final incoming in courses) {
      final i = next.indexWhere((c) =>
          c.sectionId == incoming.sectionId ||
          c.title.toLowerCase() == incoming.title.toLowerCase());
      if (i >= 0) {
        next[i] = incoming.copyWith(colorValue: next[i].colorValue);
      } else {
        next.add(incoming);
      }
    }
    _commit(next);
  }

  /// Create a new manual class seeded with the AH formative/summative sections.
  Course createClass(String title, {String? teacher}) {
    final course = Course(
      sectionId: 'm-${DateTime.now().microsecondsSinceEpoch}',
      title: title,
      teacher: teacher,
      colorValue: kCoursePalette[state.length % kCoursePalette.length],
      periods: [
        GradingPeriod(
          id: 'q1',
          title: 'Quarter 1',
          weight: 0.25,
          categories: ahStandardCategories(),
        ),
      ],
    );
    _commit([...state, course]);
    return course;
  }

  /// Add a section (category) to a course's current grading period.
  void addCategory(String sectionId, {required String title, double weight = 0}) {
    _commit([
      for (final c in state)
        if (c.sectionId == sectionId && c.periods.isNotEmpty)
          c.copyWith(periods: [
            c.periods.first.copyWith(categories: [
              ...c.periods.first.categories,
              Category(
                id: 'cat-${DateTime.now().microsecondsSinceEpoch}',
                title: title,
                weight: weight,
              ),
            ]),
            ...c.periods.skip(1),
          ])
        else
          c,
    ]);
  }

  /// Set (or clear) a semester exam's score. [semester] is 1 (midterm) or 2
  /// (final). Passing a null [earned] clears the score but keeps the exam's
  /// max/weight; pass [clear] to remove the exam entirely.
  void setExamScore(
    String sectionId,
    int semester, {
    required double? earned,
    double maxPoints = 100,
    bool clear = false,
  }) {
    final exam = clear ? null : Exam(earned: earned, maxPoints: maxPoints);
    _commit([
      for (final c in state)
        if (c.sectionId == sectionId)
          (semester == 1
              ? c.copyWith(midtermExam: exam)
              : c.copyWith(finalExam: exam))
        else
          c,
    ]);
  }

  /// Set a semester exam's weight (0..1 fraction of the semester grade).
  void setExamWeight(String sectionId, int semester, double weight) {
    final w = weight.clamp(0.0, 1.0).toDouble();
    _commit([
      for (final c in state)
        if (c.sectionId == sectionId)
          (semester == 1
              ? c.copyWith(midtermExamWeight: w)
              : c.copyWith(finalExamWeight: w))
        else
          c,
    ]);
  }

  /// Append imported assignments to a specific course → period → category.
  /// This is the commit step of the screenshot / photo import.
  void addAssignments(
    String sectionId,
    String periodId,
    String categoryId,
    List<Assignment> items,
  ) {
    _commit([
      for (final c in state)
        if (c.sectionId == sectionId)
          c.copyWith(periods: [
            for (final p in c.periods)
              if (p.id == periodId)
                p.copyWith(categories: [
                  for (final cat in p.categories)
                    if (cat.id == categoryId)
                      cat.copyWith(assignments: [...cat.assignments, ...items])
                    else
                      cat,
                ])
              else
                p,
          ])
        else
          c,
    ]);
  }
}

/// The saved Schoology iCal feed URL (or null). Persisted on-device.
final calendarFeedUrlProvider =
    NotifierProvider<CalendarFeedUrlNotifier, String?>(CalendarFeedUrlNotifier.new);

class CalendarFeedUrlNotifier extends Notifier<String?> {
  @override
  String? build() => ref.read(localStoreProvider).loadFeedUrl();

  void set(String? url) {
    final v = (url == null || url.trim().isEmpty) ? null : url.trim();
    state = v;
    ref.read(localStoreProvider).saveFeedUrl(v);
  }
}

/// One upcoming assignment from the calendar feed, tagged with the class it was
/// matched to (null when it couldn't be matched to an imported class).
class UpcomingItem {
  UpcomingItem({required this.event, this.course});
  final IcalEvent event;
  final Course? course;
}

/// The upcoming-work agenda: assignments from the iCal feed that are still due,
/// sorted by due date and matched to their class. Empty when no feed is set.
final upcomingProvider = FutureProvider.autoDispose<List<UpcomingItem>>((ref) async {
  final url = ref.watch(calendarFeedUrlProvider);
  if (url == null) return const [];
  final courses = ref.watch(gradebookProvider);
  final events = await CalendarService.fetchEvents(url);
  final cutoff = DateTime.now().subtract(const Duration(days: 1));
  final courseById = {for (final c in courses) c.sectionId: c};

  final items = <UpcomingItem>[];
  for (final e in events) {
    if (!e.isAssignment || e.start.isBefore(cutoff)) continue;
    final id = AssignmentMatcher.matchCourseId(e, courses);
    items.add(UpcomingItem(event: e, course: id == null ? null : courseById[id]));
  }
  items.sort((a, b) => a.event.start.compareTo(b.event.start));
  return items;
});

/// Per-course What-If session. The base course comes from the gradebook; the
/// student can then edit or add hypothetical scores without touching the saved
/// data, and [reset] restores the real grades.
final whatIfProvider = StateNotifierProvider.autoDispose
    .family<WhatIfController, Course?, String>((ref, sectionId) {
  final matches =
      ref.watch(gradebookProvider).where((c) => c.sectionId == sectionId).toList();
  return WhatIfController(matches.isEmpty ? null : matches.first);
});

class WhatIfController extends StateNotifier<Course?> {
  WhatIfController(this._base) : super(_base);

  final Course? _base;

  /// The real, un-edited course.
  Course? get base => _base;

  /// True once the student has changed anything from the real grades.
  bool get isDirty {
    final course = state;
    if (course == null || _base == null) return false;
    return _hasEdits(course);
  }

  void reset() => state = _base;

  void setScore(String periodId, String assignmentId, double? earned) {
    _mutateAssignment(periodId, assignmentId,
        (a) => a.copyWith(earned: earned, isHypothetical: true));
  }

  void addHypothetical(String periodId, String categoryId,
      {required String title, required double earned, required double maxPoints}) {
    _mapCourse((course) {
      return _mapPeriod(course, periodId, (period) {
        return period.copyWith(categories: [
          for (final c in period.categories)
            if (c.id == categoryId)
              c.copyWith(assignments: [
                ...c.assignments,
                Assignment(
                  id: 'hyp-${DateTime.now().microsecondsSinceEpoch}',
                  title: title,
                  earned: earned,
                  maxPoints: maxPoints,
                  categoryId: categoryId,
                  isHypothetical: true,
                ),
              ])
            else
              c,
        ]);
      });
    });
  }

  bool _hasEdits(Course course) {
    for (final p in course.periods) {
      for (final c in p.categories) {
        for (final a in c.assignments) {
          if (a.isHypothetical) return true;
        }
      }
    }
    return false;
  }

  void _mutateAssignment(
      String periodId, String assignmentId, Assignment Function(Assignment) f) {
    _mapCourse((course) {
      return _mapPeriod(course, periodId, (period) {
        return period.copyWith(categories: [
          for (final c in period.categories)
            c.copyWith(assignments: [
              for (final a in c.assignments)
                if (a.id == assignmentId) f(a) else a,
            ]),
        ]);
      });
    });
  }

  void _mapCourse(Course Function(Course) f) {
    final current = state;
    if (current == null) return;
    state = f(current);
  }

  Course _mapPeriod(
      Course course, String periodId, GradingPeriod Function(GradingPeriod) f) {
    return course.copyWith(periods: [
      for (final p in course.periods)
        if (p.id == periodId) f(p) else p,
    ]);
  }
}
