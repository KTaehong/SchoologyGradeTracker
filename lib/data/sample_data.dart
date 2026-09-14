import '../domain/models/assignment.dart';
import '../domain/models/category.dart';
import '../domain/models/course.dart';
import '../domain/models/exam.dart';
import '../domain/models/grading_period.dart';

/// Course color palette (ARGB ints; UI maps to Color).
const kCoursePalette = [
  0xFF4F46E5, 0xFF0EA5E9, 0xFF059669, 0xFFDB2777,
  0xFFD97706, 0xFF7C3AED, 0xFF0891B2, 0xFFC026D3,
];

/// American Heritage's formative/summative grading scheme — the default
/// sections a new (manually created) class starts with.
List<Category> ahStandardCategories() => [
      const Category(id: 'cat-form-hw', title: 'Form: HW/CW/Part.', weight: 0.10),
      const Category(id: 'cat-form-qz', title: 'Form: QZ/Short Es/Lab', weight: 0.30),
      const Category(id: 'cat-sum', title: 'Sum: Test/Proj/Essay', weight: 0.60),
    ];

Assignment _g(String id, String title, double earned, double max) =>
    Assignment(id: id, title: title, earned: earned, maxPoints: max);
Assignment _u(String id, String title, [double max = 10]) =>
    Assignment(id: id, title: title, earned: null, maxPoints: max);

GradingPeriod _q1(double weight, List<Category> cats) => GradingPeriod(
    id: 'q1', title: 'Quarter 1', weight: weight, isWeighted: true, term: 1, categories: cats);
GradingPeriod _q2(double weight, List<Category> cats) => GradingPeriod(
    id: 'q2', title: 'Quarter 2', weight: weight, isWeighted: true, term: 1, categories: cats);

/// The student's real American Heritage classes, for a populated first run /
/// "load sample" — clearly labeled as example data in the UI.
List<Course> sampleCourses() => [
      Course(
        sectionId: 'calc-bc',
        title: 'Calculus BC AP',
        teacher: 'Period 5',
        colorValue: kCoursePalette[0],
        // Midterm exam (covers Q1 & Q2), worth 20% of the semester-1 grade.
        midtermExam: const Exam(earned: 92, maxPoints: 100),
        midtermExamWeight: 0.20,
        periods: [
          _q1(0.25, [
            Category(id: 'cat-form-hw', title: 'Form: HW/CW/Part.', weight: 0.10, assignments: [
              _g('c-hw0', 'HW: Signature Page', 100, 100),
              _u('c-hw1', 'HW: 8.1 Basic Integration Rules'),
              _u('c-hw2', 'HW: 8.2 Integration by Parts'),
              _u('c-hw3', 'HW: 8.3 Trigonometric Integrals'),
              _u('c-hw4', 'HW: 8.4 Trigonometric Substitution'),
              _u('c-hw5', 'HW: 8.5 Partial Fractions'),
              _u('c-hw6', 'HW: 8.6 Numerical integration'),
              _u('c-hw7', 'HW 8.8 Improper Integrals'),
            ]),
            Category(id: 'cat-form-qz', title: 'Form: QZ/Short Es/Lab', weight: 0.30, assignments: [
              _u('c-qz1', 'Quiz Sections 8.1-8.3', 20),
            ]),
            const Category(id: 'cat-sum', title: 'Sum: Test/Proj/Essay', weight: 0.60),
          ]),
          _q2(0.25, [
            Category(id: 'cat-form-hw', title: 'Form: HW/CW/Part.', weight: 0.10, assignments: [
              _g('c2-hw1', 'HW: 9.1 Sequences', 95, 100),
              _g('c2-hw2', 'HW: 9.2 Series', 90, 100),
            ]),
            const Category(id: 'cat-form-qz', title: 'Form: QZ/Short Es/Lab', weight: 0.30),
            Category(id: 'cat-sum', title: 'Sum: Test/Proj/Essay', weight: 0.60, assignments: [
              _g('c2-t1', 'Test: Chapter 9', 88, 100),
            ]),
          ]),
        ],
      ),
      Course(
        sectionId: 'spanish-ap',
        title: 'Spanish Language&Culture AP',
        teacher: 'Period 6',
        colorValue: kCoursePalette[1],
        periods: [
          _q1(0.25, [
            Category(id: 'cat-form-hw', title: 'Form: HW/CW/Part.', weight: 0.20, assignments: [
              _g('s-1', 'Honor Code & Spanish 2H Syllabus Acknowledgment', 100, 100),
              _u('s-2', 'W1CWQ1 # 1 - Actividad de Discusión # 1'),
              _g('s-3', 'W1Q1 Participación', 100, 100),
              _u('s-4', 'W1CWQ1 # 2 - Actividad para conocernos'),
              _u('s-5', 'W2CWQ1 # 3 - Video-Presentación # 1'),
              _u('s-6', 'W2CWQ1 # 4 - Notas: Familias modernas'),
              _g('s-7', 'W2CWQ1 # 5 - Formative # 1 - Comprensión de Lectura', 80, 100),
              _g('s-8', 'W2Q1 Participación', 100, 100),
            ]),
            const Category(id: 'cat-form-qz', title: 'Form: QZ/Short Es/Lab', weight: 0.30),
            const Category(id: 'cat-sum', title: 'Sum: Test/Proj/Essay', weight: 0.50),
          ]),
        ],
      ),
      Course(
        sectionId: 'app-innov',
        title: 'Application Innovation HON',
        teacher: 'Sec 11840007/01',
        colorValue: kCoursePalette[2],
        periods: [
          _q1(0.50, [
            Category(id: 'cat-form-hw', title: 'Form: HW/CW/Part.', weight: 0.20, assignments: [
              _u('ai-1', 'App Ideation - 10 Ideas'),
              _u('ai-2', 'Competitive Market Analysis for PRIMARY APP IDEA'),
              _u('ai-3', 'Course Syllabus'),
              _u('ai-4', 'Target Market Analysis'),
            ]),
            const Category(id: 'cat-form-qz', title: 'Form: QZ/Short Es/Lab', weight: 0.30),
            const Category(id: 'cat-sum', title: 'Sum: Test/Proj/Essay', weight: 0.50),
          ]),
        ],
      ),
      Course(
        sectionId: 'multivar',
        title: 'Multivariable Calculus HH',
        teacher: 'Sec 11450054/01',
        colorValue: kCoursePalette[3],
        periods: [_q1(0.25, ahStandardCategories())],
      ),
      Course(
        sectionId: 'physics-c',
        title: 'Physics C: Elect & Mag AP',
        teacher: 'Period 4',
        colorValue: kCoursePalette[4],
        periods: [_q1(0.25, ahStandardCategories())],
      ),
      Course(
        sectionId: 'english-ap',
        title: 'English Lit & Comp AP',
        teacher: 'Period 1',
        colorValue: kCoursePalette[5],
        periods: [_q1(0.25, ahStandardCategories())],
      ),
    ];
