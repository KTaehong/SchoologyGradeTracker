import 'models/assignment.dart';
import 'models/category.dart';
import 'models/course.dart';

/// Whether a forecast counts toward the projected grade.
enum ForecastStatus {
  /// Applied to the projected grade.
  active,

  /// The assignment it predicts now has a real score (or was excused), so
  /// reality wins and the forecast is ignored.
  superseded,

  /// The period, category or assignment it points at is no longer in the
  /// gradebook (e.g. removed by a re-import), so there is nothing to apply it to.
  orphaned,
}

/// A saved "what if I score X?" entry for one course — the persisted form of a
/// What-If edit. It either predicts the score of an existing, not-yet-graded
/// assignment ([assignmentId] set), or adds a new hypothetical assignment to
/// [categoryId] ([title] and [maxPoints] set).
class GradeForecast {
  const GradeForecast({
    required this.id,
    required this.periodId,
    required this.categoryId,
    required this.earned,
    this.assignmentId,
    this.title,
    this.maxPoints,
    this.createdAt,
  }) : assert(assignmentId != null || (title != null && maxPoints != null),
            'A new hypothetical assignment needs a title and maxPoints.');

  final String id;
  final String periodId;
  final String categoryId;

  /// The existing assignment whose score this predicts, or null when the
  /// forecast adds a new hypothetical assignment instead.
  final String? assignmentId;

  /// Title of the new hypothetical assignment (unused for predictions).
  final String? title;

  /// Predicted points earned.
  final double earned;

  /// Points the new hypothetical assignment is out of. Predictions use the
  /// existing assignment's own maxPoints.
  final double? maxPoints;

  final DateTime? createdAt;

  bool get predictsExisting => assignmentId != null;

  /// Where this forecast stands against the real [course].
  ForecastStatus statusIn(Course course) {
    final category = _findCategory(course);
    if (category == null) return ForecastStatus.orphaned;
    if (assignmentId == null) return ForecastStatus.active;
    for (final a in category.assignments) {
      if (a.id != assignmentId) continue;
      return (a.earned != null || a.excused)
          ? ForecastStatus.superseded
          : ForecastStatus.active;
    }
    return ForecastStatus.orphaned;
  }

  Category? _findCategory(Course course) {
    for (final p in course.periods) {
      if (p.id != periodId) continue;
      for (final c in p.categories) {
        if (c.id == categoryId) return c;
      }
    }
    return null;
  }

  GradeForecast copyWith({String? id, DateTime? createdAt}) => GradeForecast(
        id: id ?? this.id,
        periodId: periodId,
        categoryId: categoryId,
        earned: earned,
        assignmentId: assignmentId,
        title: title,
        maxPoints: maxPoints,
        createdAt: createdAt ?? this.createdAt,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'periodId': periodId,
        'categoryId': categoryId,
        'assignmentId': assignmentId,
        'title': title,
        'earned': earned,
        'maxPoints': maxPoints,
        'createdAt': createdAt?.toIso8601String(),
      };

  factory GradeForecast.fromJson(Map<String, dynamic> j) => GradeForecast(
        id: j['id'] as String,
        periodId: j['periodId'] as String,
        categoryId: j['categoryId'] as String,
        assignmentId: j['assignmentId'] as String?,
        title: j['title'] as String?,
        earned: (j['earned'] as num).toDouble(),
        maxPoints: (j['maxPoints'] as num?)?.toDouble(),
        createdAt: j['createdAt'] == null
            ? null
            : DateTime.parse(j['createdAt'] as String),
      );
}

/// Returns [course] with every active forecast applied. Applied rows are marked
/// `isHypothetical` so the UI can tell them apart; superseded and orphaned
/// forecasts are skipped. When two forecasts predict the same assignment the
/// later one wins.
Course applyForecasts(Course course, Iterable<GradeForecast> forecasts) {
  final active = [
    for (final f in forecasts)
      if (f.statusIn(course) == ForecastStatus.active) f,
  ];
  if (active.isEmpty) return course;

  return course.copyWith(periods: [
    for (final p in course.periods)
      p.copyWith(categories: [
        for (final c in p.categories)
          _applyToCategory(c, [
            for (final f in active)
              if (f.periodId == p.id && f.categoryId == c.id) f,
          ]),
      ]),
  ]);
}

Category _applyToCategory(Category category, List<GradeForecast> forecasts) {
  if (forecasts.isEmpty) return category;
  final predicted = {
    for (final f in forecasts)
      if (f.assignmentId != null) f.assignmentId!: f.earned,
  };
  return category.copyWith(assignments: [
    for (final a in category.assignments)
      predicted.containsKey(a.id)
          ? a.copyWith(earned: predicted[a.id], isHypothetical: true)
          : a,
    for (final f in forecasts)
      if (f.assignmentId == null)
        Assignment(
          id: 'forecast-${f.id}',
          title: f.title!,
          earned: f.earned,
          maxPoints: f.maxPoints!,
          categoryId: category.id,
          isHypothetical: true,
        ),
  ]);
}
