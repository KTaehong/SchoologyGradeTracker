import 'models/category.dart';

/// Computed grade for a single category (percent is a 0..1+ fraction, or null
/// when the category has no graded assignments yet).
class CategoryGrade {
  const CategoryGrade({required this.category, required this.percent});

  final Category category;
  final double? percent;

  bool get hasGrade => percent != null;
}

/// Computed grade for a whole grading period, plus the per-category breakdown
/// and (when Schoology provided one) the discrepancy against Schoology's own
/// computed grade.
class CourseGrade {
  const CourseGrade({
    required this.percent,
    required this.letter,
    required this.categories,
    this.schoologyFinalGrade,
  });

  /// Overall grade as a 0..1+ fraction, or null when nothing is graded yet.
  final double? percent;

  /// Letter form of [percent], or null when [percent] is null.
  final String? letter;

  final List<CategoryGrade> categories;

  /// Schoology's own computed grade for the period, as a 0..1 fraction.
  final double? schoologyFinalGrade;

  /// Our computed grade minus Schoology's, in percentage points. Null when
  /// either side is missing. A non-trivial value flags a math mismatch to fix
  /// before shipping.
  double? get discrepancyPoints {
    if (percent == null || schoologyFinalGrade == null) return null;
    return (percent! - schoologyFinalGrade!) * 100;
  }

  /// Whether our math agrees with Schoology within [tolerancePoints].
  bool matchesSchoology({double tolerancePoints = 0.5}) {
    final d = discrepancyPoints;
    if (d == null) return true; // nothing to compare against
    return d.abs() <= tolerancePoints;
  }
}
