/// Read-only views of computed grades — the JSON contract of the grades API.
/// The server builds them with [CourseGradeSnapshot.compute]; the app parses
/// them back with the `fromJson` factories. All percents are 0..1+ fractions.
library;

import 'forecast.dart';
import 'grade_engine.dart';
import 'models/course.dart';
import 'models/grading_period.dart';

/// A grade and its letter; both null when nothing is graded yet.
class GradeValue {
  const GradeValue(this.percent, this.letter);

  factory GradeValue.of(double? percent, GradeEngine engine) =>
      GradeValue(percent, percent == null ? null : engine.letterFor(percent));

  final double? percent;
  final String? letter;

  bool get hasGrade => percent != null;

  Map<String, dynamic> toJson() => {'percent': percent, 'letter': letter};

  factory GradeValue.fromJson(Map<String, dynamic> j) => GradeValue(
        (j['percent'] as num?)?.toDouble(),
        j['letter'] as String?,
      );
}

class CategorySnapshot {
  const CategorySnapshot({
    required this.id,
    required this.title,
    required this.weight,
    required this.percent,
  });

  final String id;
  final String title;
  final double weight;
  final double? percent;

  Map<String, dynamic> toJson() =>
      {'id': id, 'title': title, 'weight': weight, 'percent': percent};

  factory CategorySnapshot.fromJson(Map<String, dynamic> j) => CategorySnapshot(
        id: j['id'] as String,
        title: j['title'] as String,
        weight: (j['weight'] as num).toDouble(),
        percent: (j['percent'] as num?)?.toDouble(),
      );
}

class PeriodSnapshot {
  const PeriodSnapshot({
    required this.id,
    required this.title,
    required this.grade,
    required this.categories,
    this.schoologyPercent,
  });

  factory PeriodSnapshot.of(GradingPeriod period, GradeEngine engine) {
    final result = engine.evaluate(period);
    return PeriodSnapshot(
      id: period.id,
      title: period.title,
      grade: GradeValue(result.percent, result.letter),
      schoologyPercent: period.schoologyFinalGrade,
      categories: [
        for (final c in result.categories)
          CategorySnapshot(
            id: c.category.id,
            title: c.category.title,
            weight: c.category.weight,
            percent: c.percent,
          ),
      ],
    );
  }

  final String id;
  final String title;
  final GradeValue grade;
  final List<CategorySnapshot> categories;

  /// Schoology's own grade for the period, when it was imported.
  final double? schoologyPercent;

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'grade': grade.toJson(),
        'schoologyPercent': schoologyPercent,
        'categories': [for (final c in categories) c.toJson()],
      };

  factory PeriodSnapshot.fromJson(Map<String, dynamic> j) => PeriodSnapshot(
        id: j['id'] as String,
        title: j['title'] as String,
        grade: GradeValue.fromJson(j['grade'] as Map<String, dynamic>),
        schoologyPercent: (j['schoologyPercent'] as num?)?.toDouble(),
        categories: [
          for (final c in (j['categories'] as List? ?? const []))
            CategorySnapshot.fromJson(c as Map<String, dynamic>),
        ],
      );
}

/// A semester grade: 1 = midterm (Q1 & Q2 + exam), 2 = final (Q3 & Q4 + exam).
class SemesterSnapshot {
  const SemesterSnapshot({required this.semester, required this.grade});

  final int semester;
  final GradeValue grade;

  Map<String, dynamic> toJson() =>
      {'semester': semester, 'grade': grade.toJson()};

  factory SemesterSnapshot.fromJson(Map<String, dynamic> j) => SemesterSnapshot(
        semester: (j['semester'] as num).toInt(),
        grade: GradeValue.fromJson(j['grade'] as Map<String, dynamic>),
      );
}

/// Every computed grade for one version of a course (real or projected).
class GradeSnapshot {
  const GradeSnapshot({
    required this.overall,
    required this.periods,
    required this.semesters,
  });

  factory GradeSnapshot.of(Course course, GradeEngine engine) {
    return GradeSnapshot(
      overall: GradeValue.of(engine.courseOverallPercent(course), engine),
      periods: [
        for (final p in course.periods) PeriodSnapshot.of(p, engine),
      ],
      semesters: [
        for (final s in const [1, 2])
          if (engine.courseHasSemester(course, s))
            SemesterSnapshot(
              semester: s,
              grade: GradeValue.of(engine.semesterGrade(course, s), engine),
            ),
      ],
    );
  }

  final GradeValue overall;
  final List<PeriodSnapshot> periods;
  final List<SemesterSnapshot> semesters;

  Map<String, dynamic> toJson() => {
        'overall': overall.toJson(),
        'periods': [for (final p in periods) p.toJson()],
        'semesters': [for (final s in semesters) s.toJson()],
      };

  factory GradeSnapshot.fromJson(Map<String, dynamic> j) => GradeSnapshot(
        overall: GradeValue.fromJson(j['overall'] as Map<String, dynamic>),
        periods: [
          for (final p in (j['periods'] as List? ?? const []))
            PeriodSnapshot.fromJson(p as Map<String, dynamic>),
        ],
        semesters: [
          for (final s in (j['semesters'] as List? ?? const []))
            SemesterSnapshot.fromJson(s as Map<String, dynamic>),
        ],
      );
}

/// One course's grades right now ([current]) and, when the student has active
/// forecasts, what they would become ([projected]).
class CourseGradeSnapshot {
  const CourseGradeSnapshot({
    required this.sectionId,
    required this.title,
    required this.current,
    this.teacher,
    this.projected,
    this.activeForecasts = 0,
  });

  factory CourseGradeSnapshot.compute(
    Course course, {
    Iterable<GradeForecast> forecasts = const [],
    GradeEngine engine = const GradeEngine(),
  }) {
    final active = forecasts
        .where((f) => f.statusIn(course) == ForecastStatus.active)
        .length;
    return CourseGradeSnapshot(
      sectionId: course.sectionId,
      title: course.title,
      teacher: course.teacher,
      current: GradeSnapshot.of(course, engine),
      projected: active == 0
          ? null
          : GradeSnapshot.of(applyForecasts(course, forecasts), engine),
      activeForecasts: active,
    );
  }

  final String sectionId;
  final String title;
  final String? teacher;
  final GradeSnapshot current;

  /// Grades with the active forecasts applied; null when there are none.
  final GradeSnapshot? projected;
  final int activeForecasts;

  Map<String, dynamic> toJson() => {
        'sectionId': sectionId,
        'title': title,
        'teacher': teacher,
        'current': current.toJson(),
        'projected': projected?.toJson(),
        'activeForecasts': activeForecasts,
      };

  factory CourseGradeSnapshot.fromJson(Map<String, dynamic> j) =>
      CourseGradeSnapshot(
        sectionId: j['sectionId'] as String,
        title: j['title'] as String,
        teacher: j['teacher'] as String?,
        current: GradeSnapshot.fromJson(j['current'] as Map<String, dynamic>),
        projected: j['projected'] == null
            ? null
            : GradeSnapshot.fromJson(j['projected'] as Map<String, dynamic>),
        activeForecasts: (j['activeForecasts'] as num?)?.toInt() ?? 0,
      );
}

/// Grades for every course in the gradebook, as of [updatedAt] (the last sync).
class GradesOverview {
  const GradesOverview({required this.updatedAt, required this.courses});

  final DateTime updatedAt;
  final List<CourseGradeSnapshot> courses;

  Map<String, dynamic> toJson() => {
        'updatedAt': updatedAt.toIso8601String(),
        'courses': [for (final c in courses) c.toJson()],
      };

  factory GradesOverview.fromJson(Map<String, dynamic> j) => GradesOverview(
        updatedAt: DateTime.parse(j['updatedAt'] as String),
        courses: [
          for (final c in (j['courses'] as List? ?? const []))
            CourseGradeSnapshot.fromJson(c as Map<String, dynamic>),
        ],
      );
}

/// A forecast plus whether it currently counts.
class ForecastEntry {
  const ForecastEntry(this.forecast, this.status);

  final GradeForecast forecast;
  final ForecastStatus status;

  Map<String, dynamic> toJson() => {...forecast.toJson(), 'status': status.name};

  factory ForecastEntry.fromJson(Map<String, dynamic> j) => ForecastEntry(
        GradeForecast.fromJson(j),
        ForecastStatus.values.asNameMap()[j['status']] ?? ForecastStatus.active,
      );
}

/// A course's saved forecasts and the grades they produce. Every forecast
/// endpoint returns this, so the app can redraw from a single response.
class CourseForecasts {
  const CourseForecasts({required this.grade, required this.forecasts});

  factory CourseForecasts.compute(
    Course course,
    List<GradeForecast> forecasts, {
    GradeEngine engine = const GradeEngine(),
  }) =>
      CourseForecasts(
        grade: CourseGradeSnapshot.compute(course,
            forecasts: forecasts, engine: engine),
        forecasts: [
          for (final f in forecasts) ForecastEntry(f, f.statusIn(course)),
        ],
      );

  final CourseGradeSnapshot grade;
  final List<ForecastEntry> forecasts;

  Map<String, dynamic> toJson() => {
        'grade': grade.toJson(),
        'forecasts': [for (final f in forecasts) f.toJson()],
      };

  factory CourseForecasts.fromJson(Map<String, dynamic> j) => CourseForecasts(
        grade: CourseGradeSnapshot.fromJson(j['grade'] as Map<String, dynamic>),
        forecasts: [
          for (final f in (j['forecasts'] as List? ?? const []))
            ForecastEntry.fromJson(f as Map<String, dynamic>),
        ],
      );
}
