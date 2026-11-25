import 'models/assignment.dart';
import 'models/category.dart';
import 'models/course.dart';
import 'models/grading_period.dart';
import 'grade_result.dart';

/// Maps a 0..1 grade fraction to a letter. Default is the standard US
/// plus/minus scale; swap in a course-specific scale later.
class LetterScale {
  const LetterScale(this.bands);

  /// Descending list of (minimum fraction, letter). First band whose minimum
  /// the percent meets wins.
  final List<(double, String)> bands;

  static const LetterScale usPlusMinus = LetterScale([
    (0.97, 'A+'),
    (0.93, 'A'),
    (0.90, 'A-'),
    (0.87, 'B+'),
    (0.83, 'B'),
    (0.80, 'B-'),
    (0.77, 'C+'),
    (0.73, 'C'),
    (0.70, 'C-'),
    (0.67, 'D+'),
    (0.63, 'D'),
    (0.60, 'D-'),
    (0.0, 'F'),
  ]);

  String letterFor(double percent) {
    for (final (min, letter) in bands) {
      if (percent >= min) return letter;
    }
    return bands.isEmpty ? '' : bands.last.$2;
  }
}

/// The core grade-calculation engine. Pure Dart, no I/O, exhaustively unit
/// tested. This is the app's provably-correct heart: every number a student
/// sees comes from here.
class GradeEngine {
  const GradeEngine({this.scale = LetterScale.usPlusMinus});

  final LetterScale scale;

  /// Average for a single category as a 0..1+ fraction, or null when the
  /// category has no graded (scored, non-excused) assignments.
  ///
  /// Points-based within the category: `sum(earned) / sum(maxPoints)` over the
  /// graded assignments that survive [Category.dropLowest]. Extra credit is
  /// honored naturally (earned may exceed maxPoints; a 0-max item adds to the
  /// numerator only). Returns null if the surviving denominator is 0.
  double? categoryPercent(Category category) {
    final graded = category.assignments.where((a) => a.isGraded).toList();
    if (graded.isEmpty) return null;

    final kept = _applyDropLowest(graded, category.dropLowest);

    var earned = 0.0;
    var max = 0.0;
    for (final a in kept) {
      earned += a.earned!;
      max += a.maxPoints;
    }
    if (max == 0) return null; // only pure extra-credit left; no defined percent
    return earned / max;
  }

  /// Overall grade for a period as a 0..1+ fraction, or null when nothing is
  /// graded. Weighted courses normalize by the weight of the categories that
  /// actually have grades (so an empty category doesn't drag the grade down);
  /// points-based courses pool every graded assignment.
  double? coursePercent(GradingPeriod period) {
    if (!period.isWeighted) {
      return _pooledPercent(period.categories.expand((c) => c.assignments));
    }

    var weightedSum = 0.0;
    var weightTotal = 0.0;
    for (final category in period.categories) {
      final pct = categoryPercent(category);
      if (pct == null) continue;
      weightedSum += category.weight * pct;
      weightTotal += category.weight;
    }

    if (weightTotal == 0) {
      // Marked weighted, but the contributing categories carry no weight —
      // fall back to pooling so the student still sees a sensible grade.
      return _pooledPercent(period.categories.expand((c) => c.assignments));
    }
    return weightedSum / weightTotal;
  }

  /// Full evaluation for the UI and for Schoology validation.
  CourseGrade evaluate(GradingPeriod period) {
    final categories = [
      for (final c in period.categories)
        CategoryGrade(category: c, percent: categoryPercent(c)),
    ];
    final pct = coursePercent(period);
    return CourseGrade(
      percent: pct,
      letter: pct == null ? null : scale.letterFor(pct),
      categories: categories,
      schoologyFinalGrade: period.schoologyFinalGrade,
    );
  }

  String letterFor(double percent) => scale.letterFor(percent);

  /// Overall grade for a whole course, rolling the grading periods up by their
  /// [GradingPeriod.weight]. Only periods that actually have a grade contribute,
  /// and the weights are normalized over those — so a future quarter with no
  /// scores never drags the number down. When no period carries a weight the
  /// present periods are averaged equally; returns null when nothing is graded.
  ///
  /// This mirrors Schoology's two-level weighting: categories roll up to a
  /// period grade (see [coursePercent]), and periods roll up to the course.
  double? courseOverallPercent(Course course) {
    var weightedSum = 0.0;
    var weightTotal = 0.0;
    final present = <double>[];
    for (final period in course.periods) {
      final pct = coursePercent(period);
      if (pct == null) continue;
      present.add(pct);
      weightedSum += period.weight * pct;
      weightTotal += period.weight;
    }
    if (present.isEmpty) return null;
    if (weightTotal == 0) {
      return present.reduce((a, b) => a + b) / present.length;
    }
    return weightedSum / weightTotal;
  }

  /// Letter for the whole-course grade, or null when nothing is graded.
  String? courseLetter(Course course) {
    final pct = courseOverallPercent(course);
    return pct == null ? null : scale.letterFor(pct);
  }

  // --- semester (midterm / final) grades -----------------------------------

  /// The equal-weighted average of the graded quarter grades in [semester]
  /// (1 = Q1 & Q2, 2 = Q3 & Q4). Each quarter counts the same (50/50) regardless
  /// of its stored weight; quarters with no grade yet are skipped. Null when no
  /// quarter in the semester has a grade.
  double? quartersAverage(Course course, int semester) {
    var sum = 0.0;
    var count = 0;
    for (final period in course.periods) {
      if (period.semester != semester) continue;
      final pct = coursePercent(period);
      if (pct == null) continue;
      sum += pct;
      count++;
    }
    return count == 0 ? null : sum / count;
  }

  /// The semester grade — the midterm ([semester] 1) or final ([semester] 2).
  ///
  /// It blends the equal-weighted quarter average with the semester exam:
  /// `quarters * (1 - examWeight) + exam * examWeight`, present-weight
  /// normalized so an exam not yet taken (or a semester with no quarters yet)
  /// simply drops out instead of counting as a zero. Null when neither the
  /// quarters nor the exam have a grade.
  double? semesterGrade(Course course, int semester) {
    final quarters = quartersAverage(course, semester);
    final examWeight =
        course.examWeightForSemester(semester).clamp(0.0, 1.0).toDouble();
    final examPct = course.examForSemester(semester)?.percent;

    var weightedSum = 0.0;
    var weightTotal = 0.0;
    if (quarters != null) {
      final w = 1 - examWeight;
      weightedSum += w * quarters;
      weightTotal += w;
    }
    if (examPct != null) {
      weightedSum += examWeight * examPct;
      weightTotal += examWeight;
    }
    if (weightTotal == 0) return null;
    return weightedSum / weightTotal;
  }

  /// Letter for a semester grade, or null when nothing in it is graded.
  String? semesterLetter(Course course, int semester) {
    final pct = semesterGrade(course, semester);
    return pct == null ? null : scale.letterFor(pct);
  }

  /// Midterm grade (semester 1: Q1 & Q2 + the midterm exam).
  double? midtermGrade(Course course) => semesterGrade(course, 1);

  /// Final grade (semester 2: Q3 & Q4 + the final exam).
  double? finalGrade(Course course) => semesterGrade(course, 2);

  /// Whether the course has anything in [semester] worth showing — at least one
  /// quarter assigned to it, or an exam entered for it.
  bool courseHasSemester(Course course, int semester) =>
      course.periods.any((p) => p.semester == semester) ||
      course.examForSemester(semester) != null;

  /// Score needed on the remaining weight to finish at [targetPercent].
  ///
  /// [currentPercent] is the average already earned over [completedWeight];
  /// [remainingWeight] is the weight still outstanding. All as 0..1 fractions.
  /// The returned value may be > 1 (impossible without extra credit) or < 0
  /// (already guaranteed) — the caller decides how to present that.
  double requiredScoreOnRemaining({
    required double targetPercent,
    required double currentPercent,
    required double completedWeight,
    required double remainingWeight,
  }) {
    if (remainingWeight <= 0) {
      throw ArgumentError.value(
          remainingWeight, 'remainingWeight', 'must be > 0 to solve');
    }
    final total = completedWeight + remainingWeight;
    return (targetPercent * total - currentPercent * completedWeight) /
        remainingWeight;
  }

  /// Classic "what do I need on the final?" helper. The final is worth
  /// [finalWeight] of the course; the current grade covers the rest.
  double requiredFinalScore({
    required double currentPercent,
    required double targetPercent,
    required double finalWeight,
  }) {
    return requiredScoreOnRemaining(
      targetPercent: targetPercent,
      currentPercent: currentPercent,
      completedWeight: 1 - finalWeight,
      remainingWeight: finalWeight,
    );
  }

  // --- internals -----------------------------------------------------------

  double? _pooledPercent(Iterable<Assignment> assignments) {
    final graded = assignments.where((a) => a.isGraded);
    var earned = 0.0;
    var max = 0.0;
    var any = false;
    for (final a in graded) {
      any = true;
      earned += a.earned!;
      max += a.maxPoints;
    }
    if (!any || max == 0) return null;
    return earned / max;
  }

  /// Drops the [dropLowest] lowest assignments by percentage. Pure extra-credit
  /// items (maxPoints == 0) have no defined percentage and are never dropped.
  /// Never drops so many that nothing remains.
  List<Assignment> _applyDropLowest(List<Assignment> graded, int? dropLowest) {
    if (dropLowest == null || dropLowest <= 0) return graded;
    if (dropLowest >= graded.length) return graded; // can't drop everything
    final sorted = [...graded]..sort((a, b) {
        final ra = a.maxPoints == 0 ? double.infinity : a.earned! / a.maxPoints;
        final rb = b.maxPoints == 0 ? double.infinity : b.earned! / b.maxPoints;
        return ra.compareTo(rb);
      });
    return sorted.sublist(dropLowest);
  }
}
