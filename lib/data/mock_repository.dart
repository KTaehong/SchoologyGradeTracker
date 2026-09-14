import '../domain/models/assignment.dart';
import '../domain/models/category.dart';
import '../domain/models/course.dart';
import '../domain/models/grading_period.dart';
import 'grade_repository.dart';

/// Realistic sample data so the entire app can be built, demoed, and screenshot
/// with zero Schoology dependency. Covers the cases the GradeEngine must nail:
/// weighted categories, a points-based course, ungraded work, an excused item,
/// extra credit, and a drop-lowest homework category. Each course also carries
/// Schoology's own final grade so the validation banner has something to check.
class MockRepository implements GradeRepository {
  const MockRepository({this.latency = const Duration(milliseconds: 450)});

  /// Simulated network delay so loading states are real in the mock build.
  final Duration latency;

  @override
  Future<List<Course>> fetchCourses() async {
    await Future.delayed(latency);
    return _courses();
  }

  @override
  Future<Course> fetchCourse(String sectionId) async {
    await Future.delayed(latency);
    return _courses().firstWhere((c) => c.sectionId == sectionId);
  }

  List<Course> _courses() => [
        _apBio(),
        _algebra2(),
        _english(),
        _worldHistory(),
        _pe(),
      ];

  // AP Biology — weighted, has ungraded work and an excused lab.
  Course _apBio() => Course(
        sectionId: 'sec-bio',
        title: 'AP Biology',
        teacher: 'Dr. Nguyen',
        colorValue: 0xFF16A34A,
        periods: [
          GradingPeriod(
            id: 'q1',
            title: 'Quarter 1',
            isWeighted: true,
            // Matches the engine's computation for this data (see grade math in
            // the tests) so the validation banner reads green in the demo.
            schoologyFinalGrade: 0.941,
            categories: [
              Category(id: 'tests', title: 'Tests', weight: 0.50, assignments: [
                Assignment(id: 'b-t1', title: 'Cell Structure Exam', earned: 88, maxPoints: 100),
                Assignment(id: 'b-t2', title: 'Genetics Exam', earned: 92, maxPoints: 100),
                Assignment(id: 'b-t3', title: 'Evolution Exam', earned: null, maxPoints: 100),
              ]),
              Category(id: 'labs', title: 'Labs', weight: 0.30, assignments: [
                Assignment(id: 'b-l1', title: 'Osmosis Lab', earned: 47, maxPoints: 50),
                Assignment(id: 'b-l2', title: 'Enzyme Lab', earned: 50, maxPoints: 50),
                Assignment(id: 'b-l3', title: 'Microscope Lab', earned: 0, maxPoints: 50, excused: true),
              ]),
              Category(id: 'hw', title: 'Homework', weight: 0.20, dropLowest: 1, assignments: [
                Assignment(id: 'b-h1', title: 'Reading Q Ch.3', earned: 10, maxPoints: 10),
                Assignment(id: 'b-h2', title: 'Reading Q Ch.4', earned: 6, maxPoints: 10),
                Assignment(id: 'b-h3', title: 'Punnett Practice', earned: 10, maxPoints: 10),
              ]),
            ],
          ),
        ],
      );

  // Algebra 2 — weighted with an extra-credit bonus item.
  Course _algebra2() => Course(
        sectionId: 'sec-alg',
        title: 'Algebra 2 Honors',
        teacher: 'Mr. Patel',
        colorValue: 0xFF2563EB,
        periods: [
          GradingPeriod(
            id: 'q1',
            title: 'Quarter 1',
            isWeighted: true,
            schoologyFinalGrade: 0.9085,
            categories: [
              Category(id: 'tests', title: 'Tests', weight: 0.60, assignments: [
                Assignment(id: 'a-t1', title: 'Quadratics Test', earned: 82, maxPoints: 100),
                Assignment(id: 'a-t2', title: 'Polynomials Test', earned: 90, maxPoints: 100),
              ]),
              Category(id: 'quiz', title: 'Quizzes', weight: 0.25, assignments: [
                Assignment(id: 'a-q1', title: 'Factoring Quiz', earned: 18, maxPoints: 20),
                Assignment(id: 'a-q2', title: 'Complex Numbers Quiz', earned: 19, maxPoints: 20),
                Assignment(id: 'a-ec', title: 'Bonus Challenge', earned: 3, maxPoints: 0),
              ]),
              Category(id: 'hw', title: 'Homework', weight: 0.15, assignments: [
                Assignment(id: 'a-h1', title: 'Set 4.1', earned: 10, maxPoints: 10),
                Assignment(id: 'a-h2', title: 'Set 4.2', earned: 9, maxPoints: 10),
              ]),
            ],
          ),
        ],
      );

  // English — points-based (unweighted) course.
  Course _english() => Course(
        sectionId: 'sec-eng',
        title: 'English 11',
        teacher: 'Ms. Alvarez',
        colorValue: 0xFFDB2777,
        periods: [
          GradingPeriod(
            id: 'q1',
            title: 'Quarter 1',
            isWeighted: false,
            schoologyFinalGrade: 0.86,
            categories: [
              Category(id: 'essays', title: 'Essays', weight: 0, assignments: [
                Assignment(id: 'e-1', title: 'Narrative Essay', earned: 44, maxPoints: 50),
                Assignment(id: 'e-2', title: 'Rhetorical Analysis', earned: 42, maxPoints: 50),
              ]),
              Category(id: 'part', title: 'Participation', weight: 0, assignments: [
                Assignment(id: 'e-3', title: 'Socratic Seminar', earned: 23, maxPoints: 25),
                Assignment(id: 'e-4', title: 'Reading Journal', earned: 20, maxPoints: 25),
              ]),
            ],
          ),
        ],
      );

  // World History — weighted, a borderline grade near a letter boundary.
  Course _worldHistory() => Course(
        sectionId: 'sec-hist',
        title: 'World History',
        teacher: 'Mr. Okafor',
        colorValue: 0xFFEA580C,
        periods: [
          GradingPeriod(
            id: 'q1',
            title: 'Quarter 1',
            isWeighted: true,
            schoologyFinalGrade: 0.8265,
            categories: [
              Category(id: 'exams', title: 'Exams', weight: 0.70, assignments: [
                Assignment(id: 'h-e1', title: 'Unit 1 Exam', earned: 79, maxPoints: 100),
                Assignment(id: 'h-e2', title: 'Unit 2 Exam', earned: 80, maxPoints: 100),
              ]),
              Category(id: 'proj', title: 'Projects', weight: 0.30, assignments: [
                Assignment(id: 'h-p1', title: 'Timeline Project', earned: 27, maxPoints: 30),
                Assignment(id: 'h-p2', title: 'Research Paper', earned: null, maxPoints: 50),
              ]),
            ],
          ),
        ],
      );

  // PE — simple, near-perfect, points-based.
  Course _pe() => Course(
        sectionId: 'sec-pe',
        title: 'Physical Education',
        teacher: 'Coach Reyes',
        colorValue: 0xFF0D9488,
        periods: [
          GradingPeriod(
            id: 'q1',
            title: 'Quarter 1',
            isWeighted: false,
            schoologyFinalGrade: 0.9833,
            categories: [
              Category(id: 'part', title: 'Participation', weight: 0, assignments: [
                Assignment(id: 'pe-1', title: 'Week 1', earned: 20, maxPoints: 20),
                Assignment(id: 'pe-2', title: 'Week 2', earned: 19, maxPoints: 20),
                Assignment(id: 'pe-3', title: 'Week 3', earned: 20, maxPoints: 20),
              ]),
            ],
          ),
        ],
      );
}
