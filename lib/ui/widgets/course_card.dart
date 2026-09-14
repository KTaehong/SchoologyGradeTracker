import 'package:flutter/material.dart';

import '../../domain/grade_engine.dart';
import '../../domain/models/course.dart';
import 'grade_pill.dart';

/// A tappable summary card for one course on the home list.
class CourseCard extends StatelessWidget {
  const CourseCard({
    super.key,
    required this.course,
    required this.engine,
    required this.onTap,
  });

  final Course course;
  final GradeEngine engine;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    // Whole-course grade, rolling categories → quarter → course.
    final percent = engine.courseOverallPercent(course);
    final letter = engine.courseLetter(course);
    final color = Color(course.colorValue);

    return Card(
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 6,
                height: 44,
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      course.title,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                    ),
                    if (course.teacher != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        course.teacher!,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: Theme.of(context).colorScheme.outline,
                            ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 12),
              GradePill(percent: percent, letter: letter),
            ],
          ),
        ),
      ),
    );
  }
}
