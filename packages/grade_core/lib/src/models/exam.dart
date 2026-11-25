/// A semester exam — the midterm (covering Q1 & Q2) or the final (Q3 & Q4).
///
/// The score is stored points-based (earned / maxPoints) like an assignment, so
/// it imports the same way. [percent] is null until a score is entered, which
/// lets the engine leave the exam out of the semester grade until it's taken.
class Exam {
  const Exam({this.earned, this.maxPoints = 100});

  /// Points scored, or null when the exam hasn't been taken/entered yet.
  final double? earned;

  /// Points the exam is out of.
  final double maxPoints;

  bool get isGraded => earned != null;

  /// 0..1+ fraction, or null when ungraded or [maxPoints] is 0.
  double? get percent =>
      (earned != null && maxPoints > 0) ? earned! / maxPoints : null;

  Exam copyWith({Object? earned = _sentinel, double? maxPoints}) => Exam(
        earned: earned == _sentinel ? this.earned : earned as double?,
        maxPoints: maxPoints ?? this.maxPoints,
      );

  Map<String, dynamic> toJson() => {'earned': earned, 'maxPoints': maxPoints};

  factory Exam.fromJson(Map<String, dynamic> j) => Exam(
        earned: (j['earned'] as num?)?.toDouble(),
        maxPoints: (j['maxPoints'] as num?)?.toDouble() ?? 100,
      );
}

const Object _sentinel = Object();
