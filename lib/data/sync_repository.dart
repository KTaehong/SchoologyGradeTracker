import '../domain/models/course.dart';
import 'api_client.dart';
import 'grade_repository.dart';

/// Network-backed [GradeRepository] — the seam the backend plugs into (docs/
/// SYSTEM_COMPONENTS.md §1.1). The UI and grade engine sit above `GradeRepository`
/// unchanged; only this implementation knows there's a server.
///
/// Auth lives entirely in [ApiClient] (it attaches and refreshes the session),
/// and it mirrors the offline-first model: callers use the local cache as the
/// source of truth and use [pushGradebook] to sync up.
class SyncRepository implements GradeRepository {
  SyncRepository(this._api);

  final ApiClient _api;

  @override
  Future<List<Course>> fetchCourses() => _api.pullGradebook();

  @override
  Future<Course> fetchCourse(String sectionId) async {
    final courses = await fetchCourses();
    return courses.firstWhere(
      (c) => c.sectionId == sectionId,
      orElse: () => throw StateError('Course $sectionId not found on server.'),
    );
  }

  /// Sync the local gradebook up to the server, returning the change report the
  /// notification worker acted on.
  Future<SyncOutcome> pushGradebook(List<Course> courses) =>
      _api.pushGradebook(courses);
}
