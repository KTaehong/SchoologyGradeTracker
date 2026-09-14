import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';

/// "What do I need on the final to get an X?" — drives the GradeEngine's
/// final-grade solver.
class FinalGradeScreen extends ConsumerStatefulWidget {
  const FinalGradeScreen({
    super.key,
    required this.courseTitle,
    required this.currentPercent,
  });

  final String courseTitle;
  final double currentPercent;

  @override
  ConsumerState<FinalGradeScreen> createState() => _FinalGradeScreenState();
}

class _FinalGradeScreenState extends ConsumerState<FinalGradeScreen> {
  double _target = 0.90; // aim for an A- by default
  double _finalWeight = 0.20; // final worth 20% by default

  @override
  Widget build(BuildContext context) {
    final engine = ref.watch(gradeEngineProvider);
    final need = engine.requiredFinalScore(
      currentPercent: widget.currentPercent,
      targetPercent: _target,
      finalWeight: _finalWeight,
    );

    final scheme = Theme.of(context).colorScheme;
    final impossible = need > 1.0;
    final guaranteed = need <= 0.0;

    return Scaffold(
      appBar: AppBar(title: const Text('Final grade calculator')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(widget.courseTitle,
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text('Current grade: ${widget.currentPercent.asPercent}',
              style: Theme.of(context)
                  .textTheme
                  .bodyMedium
                  ?.copyWith(color: scheme.outline)),
          const SizedBox(height: 24),
          _SliderTile(
            label: 'Target grade',
            valueLabel: _target.asPercent,
            value: _target,
            min: 0.50,
            max: 1.00,
            divisions: 50,
            onChanged: (v) => setState(() => _target = v),
          ),
          _SliderTile(
            label: 'Final is worth',
            valueLabel: '${(_finalWeight * 100).toStringAsFixed(0)}%',
            value: _finalWeight,
            min: 0.05,
            max: 0.50,
            divisions: 45,
            onChanged: (v) => setState(() => _finalWeight = v),
          ),
          const SizedBox(height: 24),
          Card(
            color: guaranteed
                ? const Color(0xFF16A34A).withValues(alpha: 0.12)
                : impossible
                    ? const Color(0xFFDC2626).withValues(alpha: 0.12)
                    : scheme.surfaceContainerHighest,
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  Text('You need',
                      style: Theme.of(context).textTheme.labelLarge),
                  const SizedBox(height: 8),
                  Text(
                    '${(need * 100).toStringAsFixed(1)}%',
                    style: Theme.of(context).textTheme.displaySmall?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: guaranteed
                              ? const Color(0xFF16A34A)
                              : impossible
                                  ? const Color(0xFFDC2626)
                                  : scheme.onSurface,
                        ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    guaranteed
                        ? 'Already locked in — even a 0 keeps your target.'
                        : impossible
                            ? 'Out of reach with the final alone.'
                            : 'on the final to reach ${_target.asPercent}.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context)
                        .textTheme
                        .bodyMedium
                        ?.copyWith(color: scheme.outline),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SliderTile extends StatelessWidget {
  const _SliderTile({
    required this.label,
    required this.valueLabel,
    required this.value,
    required this.min,
    required this.max,
    required this.divisions,
    required this.onChanged,
  });

  final String label;
  final String valueLabel;
  final double value;
  final double min;
  final double max;
  final int divisions;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(label, style: Theme.of(context).textTheme.titleSmall),
            const Spacer(),
            Text(valueLabel,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    )),
          ],
        ),
        Slider(
          value: value,
          min: min,
          max: max,
          divisions: divisions,
          onChanged: onChanged,
        ),
      ],
    );
  }
}
