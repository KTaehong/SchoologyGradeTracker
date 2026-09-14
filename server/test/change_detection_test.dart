import 'package:bessy_server/bessy_server.dart';
import 'package:test/test.dart';

/// Build a one-assignment gradebook for diffing.
List<dynamic> book(String title,
    {double? earned, double max = 100, bool excused = false, String id = 'a1'}) {
  return [
    {
      'sectionId': 's1',
      'title': 'Calculus BC AP',
      'periods': [
        {
          'id': 'q1',
          'title': 'Quarter 1',
          'categories': [
            {
              'id': 'c1',
              'title': 'Tests',
              'weight': 1.0,
              'assignments': [
                {
                  'id': id,
                  'title': title,
                  'earned': earned,
                  'maxPoints': max,
                  'excused': excused,
                },
              ],
            },
          ],
        },
      ],
    },
  ];
}

void main() {
  test('flattenGradebook keys by section::assignment', () {
    final flat = flattenGradebook(book('HW 1', earned: 90));
    expect(flat.keys, contains('s1::a1'));
    expect(flat['s1::a1']!.courseTitle, 'Calculus BC AP');
    expect(flat['s1::a1']!.isGraded, isTrue);
  });

  test('no changes when nothing moved', () {
    final a = book('HW 1', earned: 90);
    final b = book('HW 1', earned: 90);
    expect(detectChanges(a, b), isEmpty);
  });

  test('a first score is a "posted" change', () {
    final before = book('HW 1'); // ungraded
    final after = book('HW 1', earned: 88);
    final changes = detectChanges(before, after);
    expect(changes, hasLength(1));
    expect(changes.single.type, GradeChangeType.posted);
    expect(changes.single.newEarned, 88);
  });

  test('a brand-new graded item is "posted"', () {
    final before = <dynamic>[];
    final after = book('Quiz 1', earned: 95);
    final changes = detectChanges(before, after);
    expect(changes.single.type, GradeChangeType.posted);
  });

  test('a raised score is detected', () {
    final changes = detectChanges(book('HW', earned: 80), book('HW', earned: 92));
    expect(changes.single.type, GradeChangeType.raised);
    expect(changes.single.oldEarned, 80);
    expect(changes.single.newEarned, 92);
  });

  test('a dropped score is detected', () {
    final changes = detectChanges(book('HW', earned: 92), book('HW', earned: 70));
    expect(changes.single.type, GradeChangeType.dropped);
  });

  test('compares on percentage, so a proportional max change is not a change', () {
    final changes =
        detectChanges(book('HW', earned: 9, max: 10), book('HW', earned: 90, max: 100));
    expect(changes, isEmpty);
  });

  test('removing a score is not a notify-worthy event', () {
    final changes = detectChanges(book('HW', earned: 90), book('HW'));
    expect(changes, isEmpty);
  });

  test('excused items never count as graded', () {
    final changes =
        detectChanges(book('HW'), book('HW', earned: 0, excused: true));
    expect(changes, isEmpty);
  });

  test('message renders a readable line', () {
    final changes = detectChanges(book('Test 1', earned: 45, max: 50), book('Test 1', earned: 40, max: 50));
    expect(changes.single.message, contains('Test 1'));
    expect(changes.single.message, contains('80%'));
  });
}
