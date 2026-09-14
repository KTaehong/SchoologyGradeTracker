import 'ocr_result.dart';

/// Web/desktop stub: no on-device OCR here, so the import UI shows the
/// paste-the-text path instead. (On mobile, `ocr_service_io.dart` runs ML Kit.)
class OcrService {
  static bool get isSupported => false;

  static Future<OcrResult?> pickAndRecognize({bool camera = false}) async {
    throw UnsupportedError(
        'On-device OCR runs on the phone app. Paste the text instead.');
  }
}
