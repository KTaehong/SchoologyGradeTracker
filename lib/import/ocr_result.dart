/// Result of reading a grade screenshot: the recognized text as lines, ready to
/// hand to [ScreenshotClassifier].
class OcrResult {
  OcrResult({required this.lines, required this.imagePath});
  final List<String> lines;
  final String imagePath;
}
