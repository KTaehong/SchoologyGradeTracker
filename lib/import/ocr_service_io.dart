import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:image_picker/image_picker.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';

import 'ocr_result.dart';

/// Mobile OCR: text recognition runs entirely on the phone via Google ML Kit —
/// the image never leaves the device. Supported on Android/iOS only.
class OcrService {
  static bool get isSupported {
    if (kIsWeb) return false;
    return Platform.isAndroid || Platform.isIOS;
  }

  /// Let the student pick or capture a screenshot, then return its text lines.
  /// Returns null if they cancel the picker.
  static Future<OcrResult?> pickAndRecognize({bool camera = false}) async {
    if (!isSupported) {
      throw UnsupportedError(
          'On-device OCR runs on Android/iOS only. Paste the text instead.');
    }
    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: camera ? ImageSource.camera : ImageSource.gallery,
    );
    if (file == null) return null;

    final recognizer = TextRecognizer(script: TextRecognitionScript.latin);
    try {
      final input = InputImage.fromFilePath(file.path);
      final result = await recognizer.processImage(input);
      final lines = <String>[];
      for (final block in result.blocks) {
        for (final line in block.lines) {
          final t = line.text.trim();
          if (t.isNotEmpty) lines.add(t);
        }
      }
      return OcrResult(lines: lines, imagePath: file.path);
    } finally {
      await recognizer.close();
    }
  }
}
