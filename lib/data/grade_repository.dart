import '../domain/models/course.dart';

/// The single swappable data source. Everything above this interface is built
/// and tested against [MockRepository]; [SchoologyRepository] (P1) drops in
/// behind the same contract the moment the developer consumer key exists.
abstract class GradeRepository {
  /// All course sections for the signed-in student, with grades populated.
  Future<List<Course>> fetchCourses();

  /// Re-fetch a single course (pull-to-refresh on the detail screen).
  Future<Course> fetchCourse(String sectionId);
}
