import 'package:grade_core/grade_core.dart';

import '../api/errors.dart';
import '../store/store.dart';

/// The grade-engine API. Computes grade snapshots from a user's synced
/// gradebook with the same [GradeEngine] the app runs on-device, and stores
/// their forecasts (saved What-If entries) per course.
///
/// Every method takes the already-authenticated `userId` — the auth middleware
/// resolves it from the bearer token, so nothing here touches tokens.
class GradesService {
  GradesService(this._store, {GradeEngine engine = const GradeEngine()})
      : _engine = engine;

  final Store _store;
  final GradeEngine _engine;

  /// Cap on saved forecasts per course, so one client can't grow a row forever.
  static const maxForecastsPerCourse = 100;

  /// Current (and, where forecasts exist, projected) grades for every course.
  Future<GradesOverview> overview(String userId) async {
    final gradebook = await _store.loadGradebook(userId);
    return GradesOverview(
      updatedAt: gradebook?.updatedAt ??
          DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
      courses: [
        for (final course in _parse(gradebook?.courses ?? const []))
          CourseGradeSnapshot.compute(
            course,
            forecasts: await _store.forecastsFor(userId, course.sectionId),
            engine: _engine,
          ),
      ],
    );
  }

  /// Grades for one course.
  Future<CourseGradeSnapshot> course(String userId, String sectionId) async {
    final course = await _requireCourse(userId, sectionId);
    return CourseGradeSnapshot.compute(
      course,
      forecasts: await _store.forecastsFor(userId, sectionId),
      engine: _engine,
    );
  }

  /// A course's saved forecasts and the grades they produce.
  Future<CourseForecasts> forecasts(String userId, String sectionId) async {
    final course = await _requireCourse(userId, sectionId);
    return _view(userId, course);
  }

  /// Save a forecast. With [assignmentId] it predicts that ungraded
  /// assignment's score (replacing any earlier prediction for it); without, it
  /// adds a new hypothetical assignment, which needs [title] and [maxPoints].
  Future<CourseForecasts> addForecast(
    String userId,
    String sectionId, {
    required String periodId,
    required String categoryId,
    required double earned,
    String? assignmentId,
    String? title,
    double? maxPoints,
  }) async {
    final course = await _requireCourse(userId, sectionId);
    if (assignmentId == null) {
      if (title == null || maxPoints == null) {
        throw const ApiException.badRequest('missing_field',
            'A new assignment needs "title" and "maxPoints".');
      }
      if (title.length > 200) {
        throw const ApiException.badRequest('title_too_long');
      }
    }

    final forecast = GradeForecast(
      id: '',
      periodId: periodId,
      categoryId: categoryId,
      earned: earned,
      assignmentId: assignmentId,
      title: assignmentId == null ? title : null,
      maxPoints: assignmentId == null ? maxPoints : null,
    );
    switch (forecast.statusIn(course)) {
      case ForecastStatus.orphaned:
        throw const ApiException.notFound('target_not_found',
            'No such period, category or assignment in this course.');
      case ForecastStatus.superseded:
        throw const ApiException.conflict('assignment_already_graded',
            'That assignment already has a real score.');
      case ForecastStatus.active:
        break;
    }

    final existing = await _store.forecastsFor(userId, sectionId);
    final replaced = [
      if (assignmentId != null)
        for (final f in existing)
          if (f.periodId == periodId &&
              f.categoryId == categoryId &&
              f.assignmentId == assignmentId)
            f,
    ];
    if (replaced.isEmpty && existing.length >= maxForecastsPerCourse) {
      throw const ApiException.conflict('forecast_limit_reached');
    }
    for (final f in replaced) {
      await _store.deleteForecast(userId, sectionId, f.id);
    }
    await _store.insertForecast(userId, sectionId, forecast);
    return _view(userId, course);
  }

  Future<CourseForecasts> deleteForecast(
      String userId, String sectionId, String forecastId) async {
    final course = await _requireCourse(userId, sectionId);
    if (!await _store.deleteForecast(userId, sectionId, forecastId)) {
      throw const ApiException.notFound('forecast_not_found');
    }
    return _view(userId, course);
  }

  Future<CourseForecasts> clearForecasts(String userId, String sectionId) async {
    final course = await _requireCourse(userId, sectionId);
    await _store.clearForecasts(userId, sectionId);
    return _view(userId, course);
  }

  Future<CourseForecasts> _view(String userId, Course course) async =>
      CourseForecasts.compute(
        course,
        await _store.forecastsFor(userId, course.sectionId),
        engine: _engine,
      );

  Future<Course> _requireCourse(String userId, String sectionId) async {
    final gradebook = await _store.loadGradebook(userId);
    for (final course in _parse(gradebook?.courses ?? const [])) {
      if (course.sectionId == sectionId) return course;
    }
    throw const ApiException.notFound('course_not_found');
  }

  /// Stored course JSON is validated on sync (see [validateCourses]), so it
  /// always parses here.
  static List<Course> _parse(List<dynamic> raw) =>
      [for (final c in raw) Course.fromJson(c as Map<String, dynamic>)];
}

/// Reject a gradebook the grade engine couldn't read, before it's stored.
void validateCourses(List<dynamic> courses) {
  for (var i = 0; i < courses.length; i++) {
    try {
      Course.fromJson(courses[i] as Map<String, dynamic>);
    } catch (_) {
      throw ApiException.badRequest(
          'invalid_course', 'Course #$i is not a valid course.');
    }
  }
}
