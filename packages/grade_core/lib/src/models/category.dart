import 'assignment.dart';

/// A weighted grading category, e.g. "Tests — 40%".
class Category {
  const Category({
    required this.id,
    required this.title,
    required this.weight,
    this.dropLowest,
    this.assignments = const [],
  });

  final String id;
  final String title;

  /// Fraction of the course grade, e.g. `0.40` = 40%. In a points-based
  /// (unweighted) course every category weight is `0` and pooling is used
  /// instead — see [GradingPeriod.isWeighted].
  final double weight;

  /// Drop the N lowest-scoring assignments (by percentage) before averaging.
  final int? dropLowest;

  final List<Assignment> assignments;

  Category copyWith({
    String? id,
    String? title,
    double? weight,
    Object? dropLowest = _sentinel,
    List<Assignment>? assignments,
  }) {
    return Category(
      id: id ?? this.id,
      title: title ?? this.title,
      weight: weight ?? this.weight,
      dropLowest: dropLowest == _sentinel ? this.dropLowest : dropLowest as int?,
      assignments: assignments ?? this.assignments,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'weight': weight,
        'dropLowest': dropLowest,
        'assignments': [for (final a in assignments) a.toJson()],
      };

  factory Category.fromJson(Map<String, dynamic> j) => Category(
        id: j['id'] as String,
        title: j['title'] as String,
        weight: (j['weight'] as num).toDouble(),
        dropLowest: j['dropLowest'] as int?,
        assignments: [
          for (final a in (j['assignments'] as List? ?? const []))
            Assignment.fromJson(a as Map<String, dynamic>),
        ],
      );
}

const Object _sentinel = Object();
