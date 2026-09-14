import 'package:flutter/material.dart';

/// App theming: a single seed color, Material 3, light + dark, plus the
/// grade-to-color scale used on cards and pills throughout the app.
class AppTheme {
  static const seed = Color(0xFF4F46E5);

  static ThemeData light() => _base(Brightness.light);
  static ThemeData dark() => _base(Brightness.dark);

  static ThemeData _base(Brightness brightness) {
    final scheme = ColorScheme.fromSeed(seedColor: seed, brightness: brightness);
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: scheme.surface,
      cardTheme: CardThemeData(
        elevation: 0,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      ),
      appBarTheme: const AppBarTheme(centerTitle: false),
    );
  }

  /// Color for a grade fraction (0..1). Green high → red low; grey when null.
  static Color gradeColor(double? percent) {
    if (percent == null) return const Color(0xFF9AA0A6);
    if (percent >= 0.90) return const Color(0xFF16A34A); // A — green
    if (percent >= 0.80) return const Color(0xFF65A30D); // B — lime
    if (percent >= 0.70) return const Color(0xFFCA8A04); // C — amber
    if (percent >= 0.60) return const Color(0xFFEA580C); // D — orange
    return const Color(0xFFDC2626); // F — red
  }
}

/// Formatting helpers for grade fractions.
extension GradeFormat on double? {
  /// e.g. 0.9123 -> "91.2%". "—" when null.
  String get asPercent {
    final v = this;
    if (v == null) return '—';
    return '${(v * 100).toStringAsFixed(1)}%';
  }
}
