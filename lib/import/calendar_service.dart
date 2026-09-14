import 'package:http/http.dart' as http;

import 'ical_parser.dart';

/// Fetches and parses the student's Schoology iCal feed. The feed URL holds a
/// private token, so it's stored in the device keychain and only ever sent to
/// Schoology itself (never to any Bessy server).
class CalendarService {
  /// Fetch the feed at [webcalOrHttpsUrl] and return its events. Accepts a
  /// `webcal://` link (as Schoology hands it out) or `https://`.
  static Future<List<IcalEvent>> fetchEvents(String webcalOrHttpsUrl) async {
    final url = webcalOrHttpsUrl.replaceFirst(
        RegExp(r'^webcal://', caseSensitive: false), 'https://');
    final resp = await http
        .get(Uri.parse(url))
        .timeout(const Duration(seconds: 20));
    if (resp.statusCode != 200) {
      throw Exception('The calendar feed returned HTTP ${resp.statusCode}.');
    }
    return IcalParser.parse(resp.body);
  }
}
