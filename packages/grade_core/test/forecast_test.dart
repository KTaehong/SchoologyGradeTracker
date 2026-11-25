import 'package:grade_core/grade_core.dart';
import 'package:test/test.dart';

/// Q1 with Tests (60%) and Homework (40%). Tests: one 80/100 plus an ungraded
/// Test 2. Homework: 10/10. Current Q1 = 0.6 * 0.8 + 0.4 * 1.0 = 0.88.
Course course() => const Course(
      sectionId: 's1',
      title: 'Calculus',
      periods: [
        GradingPeriod(id: 'q1', title: 'Quarter 1', categories: [
          Category(id: 'tests', title: 'Tests', weight: 0.6, assignments: [
            Assignment(id: 't1', title: 'Test 1', earned: 80, maxPoints: 100),
            Assignment(id: 't2', title: 'Test 2', maxPoints: 100),
          ]),
          Category(id: 'hw', title: 'Homework', weight: 0.4, assignments: [
            Assignment(id: 'h1', title: 'HW 1', earned: 10, maxPoints: 10),
          ]),
        ]),
      ],
    );

GradeForecast predict(String assignmentId, double earned, {String id = 'f1'}) =>
    GradeForecast(
      id: id,
      periodId: 'q1',
      categoryId: 'tests',
      assignmentId: assignmentId,
      earned: earned,
    );

GradeForecast addNew(double earned, double maxPoints, {String id = 'f2'}) =>
    GradeForecast(
      id: id,
      periodId: 'q1',
      categoryId: 'tests',
      title: 'Test 3',
      earned: earned,
      maxPoints: maxPoints,
    );

void main() {
  const engine = GradeEngine();

  group('statusIn', () {
    test('a prediction for an ungraded assignment is active', () {
      expect(predict('t2', 90).statusIn(course()), ForecastStatus.active);
    });

    test('a prediction for an already-graded assignment is superseded', () {
      expect(predict('t1', 90).statusIn(course()), ForecastStatus.superseded);
    });

    test('pointing at a missing assignment, category or period is orphaned', () {
      expect(predict('nope', 90).statusIn(course()), ForecastStatus.orphaned);
      const badCategory = GradeForecast(
          id: 'x', periodId: 'q1', categoryId: 'nope', title: 'T', earned: 1, maxPoints: 1);
      const badPeriod = GradeForecast(
          id: 'x', periodId: 'q9', categoryId: 'tests', title: 'T', earned: 1, maxPoints: 1);
      expect(badCategory.statusIn(course()), ForecastStatus.orphaned);
      expect(badPeriod.statusIn(course()), ForecastStatus.orphaned);
    });

    test('a new hypothetical in an existing category is active', () {
      expect(addNew(90, 100).statusIn(course()), ForecastStatus.active);
    });
  });

  group('applyForecasts', () {
    test('fills in a predicted score and marks it hypothetical', () {
      final projected = applyForecasts(course(), [predict('t2', 100)]);
      final t2 = projected.periods.single.categories.first.assignments[1];
      expect(t2.earned, 100);
      expect(t2.isHypothetical, isTrue);
      // Tests: (80 + 100) / 200 = 0.9 â†’ 0.6 * 0.9 + 0.4 * 1.0 = 0.94
      expect(engine.coursePercent(projected.periods.single), closeTo(0.94, 1e-9));
    });

    test('adds a new hypothetical assignment to its category', () {
      final projected = applyForecasts(course(), [addNew(50, 100)]);
      final tests = projected.periods.single.categories.first.assignments;
      expect(tests, hasLength(3));
      expect(tests.last.id, 'forecast-f2');
      expect(tests.last.isHypothetical, isTrue);
      // Tests: (80 + 50) / 200 = 0.65 â†’ 0.6 * 0.65 + 0.4 = 0.79
      expect(engine.coursePercent(projected.periods.single), closeTo(0.79, 1e-9));
    });

    test('skips superseded and orphaned forecasts, never touching real scores', () {
      final original = course();
      final projected =
          applyForecasts(original, [predict('t1', 0), predict('nope', 0, id: 'f3')]);
      expect(identical(projected, original), isTrue);
    });

    test('the later of two predictions for one assignment wins', () {
      final projected = applyForecasts(
          course(), [predict('t2', 60), predict('t2', 90, id: 'f9')]);
      expect(projected.periods.single.categories.first.assignments[1].earned, 90);
    });
  });

  group('snapshots', () {
    test('current only, when there are no forecasts', () {
      final s = CourseGradeSnapshot.compute(course());
      expect(s.current.overall.percent, closeTo(0.88, 1e-9));
      expect(s.current.overall.letter, 'B+');
      expect(s.projected, isNull);
      expect(s.activeForecasts, 0);
      final q1 = s.current.periods.single;
      expect(q1.categories.map((c) => c.percent), [closeTo(0.8, 1e-9), 1.0]);
    });

    test('projected reflects only active forecasts', () {
      final s = CourseGradeSnapshot.compute(course(),
          forecasts: [predict('t2', 100), predict('t1', 0, id: 'stale')]);
      expect(s.activeForecasts, 1);
      expect(s.current.overall.percent, closeTo(0.88, 1e-9));
      expect(s.projected!.overall.percent, closeTo(0.94, 1e-9));
      expect(s.projected!.overall.letter, 'A');
    });

    test('semester grade blends the quarters with the exam', () {
      final withExam = course().copyWith(midtermExam: const Exam(earned: 90));
      final s = CourseGradeSnapshot.compute(withExam);
      expect(s.current.semesters.single.semester, 1);
      // 0.8 * 0.88 + 0.2 * 0.9
      expect(s.current.semesters.single.grade.percent, closeTo(0.884, 1e-9));
    });

    test('CourseForecasts round-trips through JSON', () {
      final original = CourseForecasts.compute(
          course(), [predict('t2', 100), addNew(50, 100), predict('t1', 0, id: 'f3')]);
      final back = CourseForecasts.fromJson(original.toJson());
      expect(back.forecasts.map((f) => f.status), [
        ForecastStatus.active,
        ForecastStatus.active,
        ForecastStatus.superseded,
      ]);
      expect(back.forecasts[1].forecast.title, 'Test 3');
      expect(back.grade.projected!.overall.percent,
          original.grade.projected!.overall.percent);
      expect(back.grade.current.periods.single.categories, hasLength(2));
    });
  });
}
