/// A single graded (or hypothetical) assignment.
///
/// Pure Dart — no Flutter imports — so the whole domain layer is unit-testable
/// with zero platform dependency.
class Assignment {
  const Assignment({
    required this.id,
    required this.title,
    required this.maxPoints,
    this.earned,
    this.excused = false,
    this.isHypothetical = false,
    this.due,
    this.categoryId,
  });

  final String id;
  final String title;

  /// Points the student earned. `null` means "not yet graded" and is excluded
  /// from grade math until a score exists.
  final double? earned;

  /// Points the assignment is out of. May be `0` for pure extra-credit items.
  final double maxPoints;

  /// Excused / exception (excused, incomplete, etc.) — excluded from grade math.
  final bool excused;

  /// True for What-If rows the student added or edited hypothetically.
  final bool isHypothetical;

  final DateTime? due;
  final String? categoryId;

  /// Counts toward the grade only when it has a score and is not excused.
  bool get isGraded => earned != null && !excused;

  Assignment copyWith({
    String? id,
    String? title,
    double? maxPoints,
    Object? earned = _sentinel,
    bool? excused,
    bool? isHypothetical,
    Object? due = _sentinel,
    Object? categoryId = _sentinel,
  }) {
    return Assignment(
      id: id ?? this.id,
      title: title ?? this.title,
      maxPoints: maxPoints ?? this.maxPoints,
      earned: earned == _sentinel ? this.earned : (earned as num?)?.toDouble(),
      excused: excused ?? this.excused,
      isHypothetical: isHypothetical ?? this.isHypothetical,
      due: due == _sentinel ? this.due : due as DateTime?,
      categoryId: categoryId == _sentinel ? this.categoryId : categoryId as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'maxPoints': maxPoints,
        'earned': earned,
        'excused': excused,
        'isHypothetical': isHypothetical,
        'due': due?.toIso8601String(),
        'categoryId': categoryId,
      };

  factory Assignment.fromJson(Map<String, dynamic> j) => Assignment(
        id: j['id'] as String,
        title: j['title'] as String,
        maxPoints: (j['maxPoints'] as num).toDouble(),
        earned: (j['earned'] as num?)?.toDouble(),
        excused: j['excused'] as bool? ?? false,
        isHypothetical: j['isHypothetical'] as bool? ?? false,
        due: j['due'] == null ? null : DateTime.parse(j['due'] as String),
        categoryId: j['categoryId'] as String?,
      );
}

/// Sentinel so `copyWith` can distinguish "not passed" from an explicit `null`
/// (needed to clear a score back to ungraded).
const Object _sentinel = Object();
