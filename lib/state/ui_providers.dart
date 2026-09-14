import 'package:flutter/material.dart';
import 'package:flutter_riverpod/legacy.dart';

/// App-wide theme mode (system / light / dark), toggled from Settings.
final themeModeProvider = StateProvider<ThemeMode>((ref) => ThemeMode.system);
