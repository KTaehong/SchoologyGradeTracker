import 'package:bessy/domain/grade_engine.dart';
import 'package:bessy/domain/models/assignment.dart';
import 'package:bessy/domain/models/category.dart';
import 'package:bessy/domain/models/course.dart';
import 'package:bessy/domain/models/exam.dart';
import 'package:bessy/domain/models/grading_period.dart';
import 'package:flutter_test/flutter_test.dart';

/// Test helper: a graded assignment.
Assignment a(double earned, double max, {String id = 'x', bool excused = false}) =>
    Assignment(id: id, title: id, earned: earned, maxPoints: max, excused: excused);

/// Test helper: an ungraded assignment (no score yet).
Assignment ungraded(double max, {String id = 'u'}) =>
    Assignment(id: id, title: id, earned: null, maxPoints: max);

/// Test helper: quarter `n` (id `qN`, so its semester is inferred) whose grade
/// is [percent] (0..1), or ungraded when null. [weight] only matters where the
/// test checks that semester math ignores it.
GradingPeriod quarter(int n, double? percent, {double weight = 0.25}) =>
    GradingPeriod(
      id: 'q$n',
      title: 'Quarter $n',
      weight: weight,
      isWeighted: true,
      categories: [
        Category(id: 'c', title: 'All', weight: 1.0, assignments: [
          if (percent == null)
            ungraded(100, id: 'q$n-u')
          else
            a(percent * 100, 100, id: 'q$n-a'),
        ]),
      ],
    );

/// Test helper: a course with the given quarters and optional exams.
Course courseWith(
  List<GradingPeriod> periods, {
  Exam? midterm,
  Exam? finalExam,
  double midtermWeight = 0.20,
  double finalWeight = 0.20,
}) =>
    Course(
      sectionId: 's',
      title: 'Course',
      periods: periods,
      midtermExam: midterm,
      finalExam: finalExam,
      midtermExamWeight: midtermWeight,
      finalExamWeight: finalWeight,
    );

void main() {
  const engine = GradeEngine();

  group('categoryPercent', () {
    test('simple average is points-based within the category', () {
      final c = Category(id: 'c', title: 'Tests', weight: 1, assignments: [
        a(90, 100, id: 't1'),
        a(80, 100, id: 't2'),
      ]);
      expect(engine.categoryPercent(c), closeTo(0.85, 1e-9));
    });

    test('weights by points, not by assignment count', () {
      final c = Category(id: 'c', title: 'Mixed', weight: 1, assignments: [
        a(9, 10, id: 'small'), // 90%
        a(45, 90, id: 'big'), // 50%
      ]);
      // (9+45)/(10+90) = 54/100 = 0.54, NOT the 0.70 mean of the two percents.
      expect(engine.categoryPercent(c), closeTo(0.54, 1e-9));
    });

    test('ungraded assignments are excluded', () {
      final c = Category(id: 'c', title: 'Tests', weight: 1, assignments: [
        a(100, 100, id: 'done'),
        ungraded(100, id: 'future'),
      ]);
      expect(engine.categoryPercent(c), closeTo(1.0, 1e-9));
    });

    test('excused assignments are excluded', () {
      final c = Category(id: 'c', title: 'Tests', weight: 1, assignments: [
        a(100, 100, id: 'done'),
        a(0, 100, id: 'sick', excused: true),
      ]);
      expect(engine.categoryPercent(c), closeTo(1.0, 1e-9));
    });

    test('null when no graded assignments', () {
      final c = Category(id: 'c', title: 'Empty', weight: 1, assignments: [
        ungraded(100),
      ]);
      expect(engine.categoryPercent(c), isNull);
    });

    test('extra credit can exceed 100%', () {
      final c = Category(id: 'c', title: 'Test', weight: 1, assignments: [
        a(110, 100, id: 'bonus'),
      ]);
      expect(engine.categoryPercent(c), closeTo(1.10, 1e-9));
    });

    test('pure extra-credit item (0 max) adds to numerator only', () {
      final c = Category(id: 'c', title: 'Test', weight: 1, assignments: [
        a(90, 100, id: 'normal'),
        a(5, 0, id: 'ec'), // +5 bonus points, 0 possible
      ]);
      // (90+5)/(100+0) = 0.95
      expect(engine.categoryPercent(c), closeTo(0.95, 1e-9));
    });

    test('only pure extra credit -> null (no defined denominator)', () {
      final c = Category(id: 'c', title: 'Test', weight: 1, assignments: [
        a(5, 0, id: 'ec'),
      ]);
      expect(engine.categoryPercent(c), isNull);
    });

    group('drop-lowest', () {
      test('drops the single lowest by percentage', () {
        final c = Category(id: 'c', title: 'HW', weight: 1, dropLowest: 1, assignments: [
          a(10, 10, id: 'h1'), // 100%
          a(9, 10, id: 'h2'), //  90%
          a(2, 10, id: 'h3'), //  20%  <- dropped
        ]);
        // kept (10+9)/(10+10) = 0.95
        expect(engine.categoryPercent(c), closeTo(0.95, 1e-9));
      });

      test('drops multiple', () {
        final c = Category(id: 'c', title: 'HW', weight: 1, dropLowest: 2, assignments: [
          a(10, 10, id: 'h1'),
          a(9, 10, id: 'h2'),
          a(2, 10, id: 'h3'),
          a(1, 10, id: 'h4'),
        ]);
        // drop h3(20%) and h4(10%): (10+9)/20 = 0.95
        expect(engine.categoryPercent(c), closeTo(0.95, 1e-9));
      });

      test('never drops so many that nothing remains', () {
        final c = Category(id: 'c', title: 'HW', weight: 1, dropLowest: 5, assignments: [
          a(8, 10, id: 'h1'),
          a(6, 10, id: 'h2'),
        ]);
        // dropLowest >= count -> keep all: (8+6)/20 = 0.70
        expect(engine.categoryPercent(c), closeTo(0.70, 1e-9));
      });

      test('never drops a pure extra-credit item', () {
        final c = Category(id: 'c', title: 'HW', weight: 1, dropLowest: 1, assignments: [
          a(2, 10, id: 'low'), // 20% <- should be the one dropped
          a(10, 10, id: 'high'),
          a(3, 0, id: 'ec'), // extra credit, never dropped
        ]);
        // drop 'low'; keep high + ec: (10+3)/(10+0) = 1.30
        expect(engine.categoryPercent(c), closeTo(1.30, 1e-9));
      });
    });
  });

  group('coursePercent — weighted', () {
    GradingPeriod weighted(List<Category> cats) =>
        GradingPeriod(id: 'p', title: 'Q1', isWeighted: true, categories: cats);

    test('normalizes by contributing category weights', () {
      final p = weighted([
        Category(id: 'test', title: 'Tests', weight: 0.6, assignments: [a(90, 100)]),
        Category(id: 'hw', title: 'HW', weight: 0.4, assignments: [a(100, 100)]),
      ]);
      // 0.6*0.90 + 0.4*1.00 = 0.94
      expect(engine.coursePercent(p), closeTo(0.94, 1e-9));
    });

    test('empty category does not drag the grade down', () {
      final p = weighted([
        Category(id: 'test', title: 'Tests', weight: 0.6, assignments: [a(90, 100)]),
        Category(id: 'final', title: 'Final', weight: 0.4, assignments: [ungraded(100)]),
      ]);
      // Only Tests contributes -> normalized to itself -> 0.90
      expect(engine.coursePercent(p), closeTo(0.90, 1e-9));
    });

    test('weights need not sum to 1 (normalization handles it)', () {
      final p = weighted([
        Category(id: 'a', title: 'A', weight: 30, assignments: [a(80, 100)]),
        Category(id: 'b', title: 'B', weight: 10, assignments: [a(100, 100)]),
      ]);
      // (30*0.8 + 10*1.0) / 40 = (24+10)/40 = 0.85
      expect(engine.coursePercent(p), closeTo(0.85, 1e-9));
    });

    test('null when nothing graded', () {
      final p = weighted([
        Category(id: 'a', title: 'A', weight: 1, assignments: [ungraded(100)]),
      ]);
      expect(engine.coursePercent(p), isNull);
    });
  });

  group('coursePercent — points-based (unweighted)', () {
    test('pools every assignment regardless of category', () {
      final p = GradingPeriod(id: 'p', title: 'Q1', isWeighted: false, categories: [
        Category(id: 'a', title: 'A', weight: 0, assignments: [a(45, 50, id: 'x')]),
        Category(id: 'b', title: 'B', weight: 0, assignments: [a(40, 50, id: 'y')]),
      ]);
      // (45+40)/(50+50) = 85/100 = 0.85
      expect(engine.coursePercent(p), closeTo(0.85, 1e-9));
    });
  });

  group('letter grades', () {
    test('boundaries land on the right letter', () {
      expect(engine.letterFor(0.97), 'A+');
      expect(engine.letterFor(0.93), 'A');
      expect(engine.letterFor(0.90), 'A-');
      expect(engine.letterFor(0.895), 'B+');
      expect(engine.letterFor(0.80), 'B-');
      expect(engine.letterFor(0.60), 'D-');
      expect(engine.letterFor(0.599), 'F');
      expect(engine.letterFor(0.0), 'F');
    });

    test('over 100% is still A+', () {
      expect(engine.letterFor(1.10), 'A+');
    });
  });

  group('final-grade solver', () {
    test('required final score to hit a target', () {
      // Current 88% covers 80% of the grade; final is worth 20%. Want 90%.
      // need = (0.90 - 0.88*0.8)/0.2 = (0.90 - 0.704)/0.2 = 0.98
      final need = engine.requiredFinalScore(
        currentPercent: 0.88,
        targetPercent: 0.90,
        finalWeight: 0.20,
      );
      expect(need, closeTo(0.98, 1e-9));
    });

    test('target already guaranteed -> negative requirement', () {
      final need = engine.requiredFinalScore(
        currentPercent: 0.95,
        targetPercent: 0.60,
        finalWeight: 0.20,
      );
      expect(need, lessThan(0));
    });

    test('impossible target -> requirement above 1', () {
      final need = engine.requiredFinalScore(
        currentPercent: 0.50,
        targetPercent: 0.95,
        finalWeight: 0.20,
      );
      expect(need, greaterThan(1));
    });

    test('generic remaining-weight solver matches the final helper', () {
      final generic = engine.requiredScoreOnRemaining(
        targetPercent: 0.90,
        currentPercent: 0.88,
        completedWeight: 0.80,
        remainingWeight: 0.20,
      );
      expect(generic, closeTo(0.98, 1e-9));
    });

    test('throws when no weight remains', () {
      expect(
        () => engine.requiredScoreOnRemaining(
          targetPercent: 0.9,
          currentPercent: 0.9,
          completedWeight: 1.0,
          remainingWeight: 0.0,
        ),
        throwsArgumentError,
      );
    });
  });

  group('What-If recompute', () {
    test('adding a hypothetical score updates the grade', () {
      final base = Category(id: 'test', title: 'Tests', weight: 1, assignments: [
        a(90, 100, id: 't1'),
      ]);
      final before = engine.categoryPercent(base);
      expect(before, closeTo(0.90, 1e-9));

      final whatIf = base.copyWith(assignments: [
        ...base.assignments,
        Assignment(
          id: 'hyp',
          title: 'Hypothetical Test',
          earned: 100,
          maxPoints: 100,
          isHypothetical: true,
        ),
      ]);
      // (90+100)/(100+100) = 0.95
      expect(engine.categoryPercent(whatIf), closeTo(0.95, 1e-9));
    });

    test('scoring an ungraded assignment moves the grade', () {
      final future = ungraded(100, id: 'mid');
      final c = Category(id: 'test', title: 'Tests', weight: 1, assignments: [
        a(80, 100, id: 't1'),
        future,
      ]);
      expect(engine.categoryPercent(c), closeTo(0.80, 1e-9)); // future excluded

      final scored = c.copyWith(assignments: [
        c.assignments.first,
        future.copyWith(earned: 100, isHypothetical: true),
      ]);
      // (80+100)/200 = 0.90
      expect(engine.categoryPercent(scored), closeTo(0.90, 1e-9));
    });
  });

  group('evaluate + Schoology validation', () {
    test('produces a breakdown and matches Schoology within tolerance', () {
      final p = GradingPeriod(
        id: 'p',
        title: 'Q1',
        isWeighted: true,
        schoologyFinalGrade: 0.94,
        categories: [
          Category(id: 'test', title: 'Tests', weight: 0.6, assignments: [a(90, 100)]),
          Category(id: 'hw', title: 'HW', weight: 0.4, assignments: [a(100, 100)]),
        ],
      );
      final result = engine.evaluate(p);
      expect(result.percent, closeTo(0.94, 1e-9));
      expect(result.letter, 'A');
      expect(result.categories, hasLength(2));
      expect(result.matchesSchoology(), isTrue);
      expect(result.discrepancyPoints, closeTo(0.0, 1e-9));
    });

    test('flags a mismatch against Schoology', () {
      final p = GradingPeriod(
        id: 'p',
        title: 'Q1',
        isWeighted: true,
        schoologyFinalGrade: 0.80, // Schoology says 80, we compute 94
        categories: [
          Category(id: 'test', title: 'Tests', weight: 0.6, assignments: [a(90, 100)]),
          Category(id: 'hw', title: 'HW', weight: 0.4, assignments: [a(100, 100)]),
        ],
      );
      final result = engine.evaluate(p);
      expect(result.matchesSchoology(), isFalse);
      expect(result.discrepancyPoints, closeTo(14.0, 1e-9));
    });
  });

  group('semester grades (midterm / final)', () {
    test('midterm averages Q1 & Q2 equally; final averages Q3 & Q4', () {
      final c = courseWith([
        quarter(1, 1.00),
        quarter(2, 0.80),
        quarter(3, 0.70),
        quarter(4, 0.60),
      ]);
      // No exams entered -> the exam weight normalizes out, leaving the equal
      // quarter average for each semester.
      expect(engine.midtermGrade(c), closeTo(0.90, 1e-9)); // (100+80)/2
      expect(engine.finalGrade(c), closeTo(0.65, 1e-9)); // (70+60)/2
    });

    test('midterm only counts Q1 & Q2 — Q3/Q4 never leak in, and vice versa',
        () {
      final c = courseWith([
        quarter(1, 1.00),
        quarter(2, 1.00),
        quarter(3, 0.50),
        quarter(4, 0.50),
      ]);
      expect(engine.midtermGrade(c), closeTo(1.00, 1e-9));
      expect(engine.finalGrade(c), closeTo(0.50, 1e-9));
    });

    test('the two quarters count equally regardless of their stored weight', () {
      final c = courseWith([
        quarter(1, 1.00, weight: 0.90),
        quarter(2, 0.80, weight: 0.10),
      ]);
      // Equal 50/50, not the 0.9/0.1 weighted 0.98.
      expect(engine.midtermGrade(c), closeTo(0.90, 1e-9));
    });

    test('the exam blends in by its weight', () {
      final c = courseWith(
        [quarter(1, 1.00), quarter(2, 0.80)], // avg 0.90
        midterm: const Exam(earned: 70, maxPoints: 100), // 0.70
        midtermWeight: 0.20,
      );
      // 0.90 * 0.80 + 0.70 * 0.20 = 0.86
      expect(engine.midtermGrade(c), closeTo(0.86, 1e-9));
    });

    test('an exam not yet taken drops out (quarters keep full weight)', () {
      final c = courseWith(
        [quarter(1, 1.00), quarter(2, 0.80)],
        midterm: const Exam(earned: null, maxPoints: 100),
        midtermWeight: 0.20,
      );
      expect(engine.midtermGrade(c), closeTo(0.90, 1e-9));
    });

    test('a semester with no graded quarters falls back to just the exam', () {
      final c = courseWith(
        [quarter(1, null), quarter(2, null)],
        midterm: const Exam(earned: 88, maxPoints: 100),
        midtermWeight: 0.20,
      );
      expect(engine.midtermGrade(c), closeTo(0.88, 1e-9));
    });

    test('null when nothing in the semester is graded', () {
      final c = courseWith([quarter(1, null), quarter(2, null)]);
      expect(engine.midtermGrade(c), isNull);
      expect(engine.semesterLetter(c, 1), isNull);
    });

    test('courseHasSemester reflects quarters and exams present', () {
      final onlyFall = courseWith([quarter(1, 1.0)]);
      expect(engine.courseHasSemester(onlyFall, 1), isTrue);
      expect(engine.courseHasSemester(onlyFall, 2), isFalse);

      final withFinalExam = courseWith(
        [quarter(1, 1.0)],
        finalExam: const Exam(earned: 90, maxPoints: 100),
      );
      expect(engine.courseHasSemester(withFinalExam, 2), isTrue);
    });

    test('explicit term overrides the inferred quarter number', () {
      // A period whose id has no quarter digit but is tagged term 2.
      final spring = GradingPeriod(
        id: 'spring',
        title: 'Spring block',
        term: 2,
        isWeighted: true,
        categories: [
          Category(id: 'c', title: 'All', weight: 1, assignments: [a(75, 100)]),
        ],
      );
      final c = courseWith([spring]);
      expect(engine.finalGrade(c), closeTo(0.75, 1e-9));
      expect(engine.midtermGrade(c), isNull);
    });
  });
}
