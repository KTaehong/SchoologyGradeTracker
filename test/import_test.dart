import 'package:bessy/domain/grade_engine.dart';
import 'package:bessy/domain/models/course.dart';
import 'package:bessy/data/sample_data.dart';
import 'package:bessy/import/screenshot_classifier.dart';
import 'package:bessy/import/ical_parser.dart';
import 'package:bessy/import/html_report_parser.dart';
import 'package:bessy/import/assignment_matcher.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const engine = GradeEngine();

  group('GradeEngine.courseOverallPercent (period rollup)', () {
    test('rolls up its graded quarters (Q1 & Q2) by weight', () {
      final calc = sampleCourses().firstWhere((c) => c.sectionId == 'calc-bc');
      // Q1 = 100% (one 100/100 HW); Q2 ≈ 88.64% (HW 92.5%, Test 88%); each 25%.
      final pct = engine.courseOverallPercent(calc);
      expect(pct, isNotNull);
      expect(pct! * 100, closeTo(94.32, 0.1));
      expect(engine.courseLetter(calc), 'A');
    });

    test('sample midterm blends Q1 & Q2 (equal) with the midterm exam', () {
      final calc = sampleCourses().firstWhere((c) => c.sectionId == 'calc-bc');
      // quarters avg (100 + 88.64)/2 = 94.32; midterm exam 92% at 20% weight:
      // 0.9432*0.80 + 0.92*0.20 ≈ 0.9386.
      expect(engine.midtermGrade(calc)! * 100, closeTo(93.86, 0.1));
      expect(engine.semesterLetter(calc, 1), 'A');
      // No Q3/Q4 or final exam in the sample -> no final grade yet.
      expect(engine.finalGrade(calc), isNull);
    });

    test('a course with nothing graded returns null (N/A)', () {
      final app = sampleCourses().firstWhere((c) => c.sectionId == 'app-innov');
      expect(engine.courseOverallPercent(app), isNull);
      expect(engine.courseLetter(app), isNull);
    });

    test('present periods normalize by weight, ignoring ungraded periods', () {
      final course = Course(
        sectionId: 'x',
        title: 'X',
        periods: [
          // graded period, weight 25%
          sampleCourses().first.periods.first,
        ],
      );
      // one period only -> equals that period's percent
      expect(engine.courseOverallPercent(course)! * 100, closeTo(100, 0.01));
    });
  });

  group('ScreenshotClassifier', () {
    final courses = sampleCourses();

    test('extractRows pulls scored rows and strips dates', () {
      final rows = ScreenshotClassifier.extractRows([
        'Form: HW/CW/Part. (10%)',
        'HW: 8.1 Basic Integration Rules  9/01/26 11:59pm  10 / 10',
        'HW: 8.2 Integration by Parts  9/02/26 11:59pm  —', // ungraded, skipped
        'Quiz Sections 8.1-8.3  9/09/26  18 / 20',
      ]);
      expect(rows.length, 2);
      expect(rows.first.title, 'HW: 8.1 Basic Integration Rules');
      expect(rows.first.earned, 10);
      expect(rows.first.max, 10);
      expect(rows[1].earned, 18);
      expect(rows[1].max, 20);
    });

    test('auto-detects the class when its name is in the shot', () {
      final id = ScreenshotClassifier.matchCourseId(
        ['Calculus BC AP: P5', 'HW: 8.1  10 / 10'],
        courses,
      );
      expect(id, 'calc-bc');
    });

    test('returns null when no class name is captured (cascade → manual)', () {
      final id = ScreenshotClassifier.matchCourseId(
        ['Quiz Sections 8.1-8.3  9/09/26  18 / 20'],
        courses,
      );
      expect(id, isNull);
    });

    test('auto-detects the category when its header is present', () {
      final calc = courses.firstWhere((c) => c.sectionId == 'calc-bc');
      final idx = ScreenshotClassifier.matchCategoryIndex(
        calc.periods.first,
        ['Form: HW/CW/Part. (10%)', 'HW: 8.1  10 / 10'],
      );
      expect(idx, 0);
      final none = ScreenshotClassifier.matchCategoryIndex(
        calc.periods.first,
        ['HW: 8.1  10 / 10'],
      );
      expect(none, -1);
    });
  });

  group('IcalParser', () {
    test('parses timed and all-day events, sorted by start', () {
      final events = IcalParser.parse('''
BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Later event
DTSTART:20260918T194500Z
LOCATION:Library
END:VEVENT
BEGIN:VEVENT
SUMMARY:Earlier all-day
DTSTART;VALUE=DATE:20260913
END:VEVENT
END:VCALENDAR''');
      expect(events.length, 2);
      expect(events.first.summary, 'Earlier all-day');
      expect(events.first.allDay, isTrue);
      expect(events[1].summary, 'Later event');
      expect(events[1].allDay, isFalse);
      expect(events[1].location, 'Library');
    });
  });

  group('iCal assignments + class matching', () {
    // Mirrors the real Schoology feed shape: assignments carry an /assignment/
    // URL and encode the due date as DTSTART; plain events carry /event/.
    const feed = '''
BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART;VALUE=DATE-TIME:20260902T035900Z
UID:calendar-event-1@schoology.com
URL;VALUE=URI:http://ahschool.schoology.com/assignment/8508901242
SUMMARY:HW: 8.1 Basic Integration Rules
DESCRIPTION:HW 8.1 p. 520 15-45 odds
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260913
UID:calendar-event-2@schoology.com
URL;VALUE=URI:http://ahschool.schoology.com/event/6262093620
SUMMARY:Club Fair
END:VEVENT
END:VCALENDAR''';

    test('captures the URL and flags assignments vs events', () {
      final events = IcalParser.parse(feed);
      expect(events.length, 2);
      final assignment = events.firstWhere((e) => e.isAssignment);
      expect(assignment.summary, 'HW: 8.1 Basic Integration Rules');
      expect(assignment.url, contains('/assignment/'));
      final event = events.firstWhere((e) => !e.isAssignment);
      expect(event.summary, 'Club Fair');
      expect(event.isAssignment, isFalse);
    });

    test('matches a feed assignment to the class holding that assignment', () {
      final events = IcalParser.parse(feed);
      final assignment = events.firstWhere((e) => e.isAssignment);
      // Calculus BC AP's HW category contains "HW: 8.1 Basic Integration Rules".
      final id = AssignmentMatcher.matchCourseId(assignment, sampleCourses());
      expect(id, 'calc-bc');
    });

    test('returns null when no imported class holds the assignment', () {
      final events = IcalParser.parse(feed);
      final assignment = events.firstWhere((e) => e.isAssignment);
      expect(AssignmentMatcher.matchCourseId(assignment, const []), isNull);
    });
  });

  group('HtmlReportParser (text grammar) — real Spanish page shape', () {
    test('recovers course → period → category → assignments with weights', () {
      final courses = HtmlReportParser.parse('''
<html><body>
Spanish Language&Culture AP: P6
Quarter 1: 2026-08-26 - 2026-10-16 (25%) 87.8%
Form: HW/CW/Part. (20%) 95%
Honor Code &amp; Spanish 2H Syllabus Acknowledgment 8/26/26 11:59pm 100 / 100
W1CWQ1 # 1 - Actividad de Discusión 8/28/26 11:59pm —
W1Q1 Participación 8/28/26 11:59pm 100 / 100
W2CWQ1 # 5 - Formative # 1 - Comprensión de Lectura 9/02/26 11:59pm 80 / 100
W2Q1 Participación 9/04/26 11:59pm 100 / 100
</body></html>''');
      expect(courses.length, 1);
      final c = courses.first;
      expect(c.title, 'Spanish Language&Culture AP: P6');
      expect(c.periods.first.title, 'Quarter 1');
      expect(c.periods.first.weight, closeTo(0.25, 1e-9));
      final cat = c.periods.first.categories.first;
      expect(cat.title, 'Form: HW/CW/Part.');
      expect(cat.weight, closeTo(0.20, 1e-9));
      // Category % over graded items: (100 + 100 + 80) / 300 = 95%.
      expect(engine.categoryPercent(cat)! * 100, closeTo(95, 0.01));
    });
  });
}
