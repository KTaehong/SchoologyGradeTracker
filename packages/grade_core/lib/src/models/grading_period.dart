import 'category.dart';

/// A grading period (quarter / semester) within a course section.
class GradingPeriod {
  const GradingPeriod({
    required this.id,
    required this.title,
    this.weight = 1.0,
    this.isWeighted = true,
    this.categories = const [],
    this.schoologyFinalGrade,
    this.term,
  });

  final String id;
  final String title;

  /// Weight of this period toward a multi-period course total (used later for
  /// semester rollups). Not used by the single-period current-grade math.
  final double weight;

  /// Which semester this quarter belongs to: `1` (fall — Q1 & Q2, rolls into the
  /// midterm) or `2` (spring — Q3 & Q4, rolls into the final). When null it is
  /// inferred from the quarter number in [id]/[title] via [semester].
  final int? term;

  /// The quarter number parsed from [id] or [title] (e.g. `q3` / "Quarter 3" →
  /// 3), or null when there is no digit to read.
  int? get quarterNumber {
    final m = RegExp(r'\d').firstMatch(id) ?? RegExp(r'\d').firstMatch(title);
    return m == null ? null : int.tryParse(m.group(0)!);
  }

  /// The semester this period counts toward (1 or 2), or null when unknown.
  /// Uses the explicit [term] when set, else infers from [quarterNumber]
  /// (Q1/Q2 → 1, Q3/Q4 → 2).
  int? get semester {
    if (term != null) return term;
    final q = quarterNumber;
    if (q == null) return null;
    if (q >= 1 && q <= 2) return 1;
    if (q >= 3 && q <= 4) return 2;
    return null;
  }

  /// When true the course uses weighted categories; when false the course is
  /// points-based and all assignments are pooled regardless of category.
  final bool isWeighted;

  final List<Category> categories;

  /// Schoology's OWN computed grade for this period, when available. Used to
  /// validate [GradeEngine] output against what the student sees in Schoology.
  final double? schoologyFinalGrade;

  GradingPeriod copyWith({
    String? id,
    String? title,
    double? weight,
    bool? isWeighted,
    List<Category>? categories,
    Object? schoologyFinalGrade = _sentinel,
    Object? term = _sentinel,
  }) {
    return GradingPeriod(
      id: id ?? this.id,
      title: title ?? this.title,
      weight: weight ?? this.weight,
      isWeighted: isWeighted ?? this.isWeighted,
      categories: categories ?? this.categories,
      schoologyFinalGrade: schoologyFinalGrade == _sentinel
          ? this.schoologyFinalGrade
          : schoologyFinalGrade as double?,
      term: term == _sentinel ? this.term : term as int?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'weight': weight,
        'isWeighted': isWeighted,
        'schoologyFinalGrade': schoologyFinalGrade,
        'term': term,
        'categories': [for (final c in categories) c.toJson()],
      };

  factory GradingPeriod.fromJson(Map<String, dynamic> j) => GradingPeriod(
        id: j['id'] as String,
        title: j['title'] as String,
        weight: (j['weight'] as num?)?.toDouble() ?? 1.0,
        isWeighted: j['isWeighted'] as bool? ?? true,
        schoologyFinalGrade: (j['schoologyFinalGrade'] as num?)?.toDouble(),
        term: (j['term'] as num?)?.toInt(),
        categories: [
          for (final c in (j['categories'] as List? ?? const []))
            Category.fromJson(c as Map<String, dynamic>),
        ],
      );
}

const Object _sentinel = Object();
