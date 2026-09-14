import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';

/// A colored capsule showing a grade percent and (optionally) its letter.
class GradePill extends StatelessWidget {
  const GradePill({
    super.key,
    required this.percent,
    this.letter,
    this.large = false,
  });

  final double? percent;
  final String? letter;
  final bool large;

  @override
  Widget build(BuildContext context) {
    final color = AppTheme.gradeColor(percent);
    final label = percent.asPercent;
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: large ? 16 : 10,
        vertical: large ? 10 : 6,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(large ? 16 : 12),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: TextStyle(
              color: color,
              fontWeight: FontWeight.w700,
              fontSize: large ? 22 : 14,
            ),
          ),
          if (letter != null) ...[
            SizedBox(width: large ? 8 : 6),
            Text(
              letter!,
              style: TextStyle(
                color: color,
                fontWeight: FontWeight.w600,
                fontSize: large ? 16 : 12,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
