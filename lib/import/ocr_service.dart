// On-device screenshot OCR, with a platform-conditional implementation:
// mobile (Android/iOS) uses Google ML Kit; web/desktop use a stub that reports
// [OcrService.isSupported] == false so the UI offers a paste-the-text fallback.
export 'ocr_result.dart';
export 'ocr_service_io.dart' if (dart.library.html) 'ocr_service_web.dart';
