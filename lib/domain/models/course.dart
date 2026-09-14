import 'exam.dart';
import 'grading_period.dart';

/// A course section the student is enrolled in.
class Course {
  const Course({
    required this.sectionId,
    required this.title,
    this.teacher,
    this.colorValue = 0xFF4F46E5,
    this.periods = const [],
    this.midtermExam,
    this.finalExam,
    this.midtermExamWeight = 0.20,
    this.finalExamWeight = 0.20,
  });

  final String sectionId;
  final String title;
  final String? teacher;

  /// ARGB color as an int so the domain layer stays free of Flutter imports.
  /// The UI maps this to a `Color`.
  final int colorValue;

  final List<GradingPeriod> periods;

  /// The midterm exam (covers Q1 & Q2) and the final exam (Q3 & Q4). Null until
  /// the student enters a score.
  final Exam? midtermExam;
  final Exam? finalExam;

  /// Each exam's share of its semester grade as a 0..1 fraction (default 20%).
  /// The two quarters split the remaining weight equally.
  final double midtermExamWeight;
  final double finalExamWeight;

  Exam? examForSemester(int semester) => semester == 1 ? midtermExam : finalExam;
  double examWeightForSemester(int semester) =>
      semester == 1 ? midtermExamWeight : finalExamWeight;

  /// The period currently being displayed — for P0 this is simply the first.
  GradingPeriod? get currentPeriod =>
      periods.isEmpty ? null : periods.first;

  Course copyWith({
    String? sectionId,
    String? title,
    Object? teacher = _sentinel,
    int? colorValue,
    List<GradingPeriod>? periods,
    Object? midtermExam = _sentinel,
    Object? finalExam = _sentinel,
    double? midtermExamWeight,
    double? finalExamWeight,
  }) {
    return Course(
      sectionId: sectionId ?? this.sectionId,
      title: title ?? this.title,
      teacher: teacher == _sentinel ? this.teacher : teacher as String?,
      colorValue: colorValue ?? this.colorValue,
      periods: periods ?? this.periods,
      midtermExam:
          midtermExam == _sentinel ? this.midtermExam : midtermExam as Exam?,
      finalExam: finalExam == _sentinel ? this.finalExam : finalExam as Exam?,
      midtermExamWeight: midtermExamWeight ?? this.midtermExamWeight,
      finalExamWeight: finalExamWeight ?? this.finalExamWeight,
    );
  }

  Map<String, dynamic> toJson() => {
        'sectionId': sectionId,
        'title': title,
        'teacher': teacher,
        'colorValue': colorValue,
        'periods': [for (final p in periods) p.toJson()],
        'midtermExam': midtermExam?.toJson(),
        'finalExam': finalExam?.toJson(),
        'midtermExamWeight': midtermExamWeight,
        'finalExamWeight': finalExamWeight,
      };

  factory Course.fromJson(Map<String, dynamic> j) => Course(
        sectionId: j['sectionId'] as String,
        title: j['title'] as String,
        teacher: j['teacher'] as String?,
        colorValue: j['colorValue'] as int? ?? 0xFF4F46E5,
        periods: [
          for (final p in (j['periods'] as List? ?? const []))
            GradingPeriod.fromJson(p as Map<String, dynamic>),
        ],
        midtermExam: j['midtermExam'] == null
            ? null
            : Exam.fromJson(j['midtermExam'] as Map<String, dynamic>),
        finalExam: j['finalExam'] == null
            ? null
            : Exam.fromJson(j['finalExam'] as Map<String, dynamic>),
        midtermExamWeight:
            (j['midtermExamWeight'] as num?)?.toDouble() ?? 0.20,
        finalExamWeight: (j['finalExamWeight'] as num?)?.toDouble() ?? 0.20,
      );
}

const Object _sentinel = Object();
