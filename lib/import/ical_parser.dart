/// One event read from a Schoology iCal (.ics) feed.
class IcalEvent {
  IcalEvent({
    required this.summary,
    required this.start,
    required this.allDay,
    this.location,
    this.url,
    this.description,
  });

  final String summary;

  /// For assignments this is the due date/time (Schoology encodes the deadline
  /// as DTSTART, e.g. 11:59pm the night it's due).
  final DateTime start;
  final bool allDay;
  final String? location;

  /// The Schoology link for this item. Assignment items point at
  /// `.../assignment/<id>`; plain calendar items at `.../event/<id>`.
  final String? url;
  final String? description;

  /// True when this event is a graded assignment (vs. a school/club event).
  bool get isAssignment => url != null && url!.contains('/assignment/');
}

/// Minimal, dependency-free iCalendar parser — enough for a read-only agenda of
/// a Schoology feed. Handles RFC 5545 line folding, all-day (`VALUE=DATE`) and
/// timed (`DATE-TIME`) starts. Pure Dart, unit-tested.
class IcalParser {
  static final RegExp _fold = RegExp(r'\n[ \t]');
  static final RegExp _dt =
      RegExp(r'(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?');

  static String _unfold(String text) =>
      text.replaceAll('\r\n', '\n').replaceAll(_fold, '');

  static DateTime? _parseDate(String value) {
    final m = _dt.firstMatch(value);
    if (m == null) return null;
    return DateTime(
      int.parse(m.group(1)!),
      int.parse(m.group(2)!),
      int.parse(m.group(3)!),
      int.parse(m.group(4) ?? '0'),
      int.parse(m.group(5) ?? '0'),
    );
  }

  static List<IcalEvent> parse(String text) {
    final events = <IcalEvent>[];
    String? summary;
    DateTime? start;
    var allDay = false;
    String? location;
    String? url;
    String? description;
    var inEvent = false;

    for (final line in _unfold(text).split('\n')) {
      if (line.startsWith('BEGIN:VEVENT')) {
        inEvent = true;
        summary = null;
        start = null;
        allDay = false;
        location = null;
        url = null;
        description = null;
      } else if (line.startsWith('END:VEVENT')) {
        if (inEvent && start != null) {
          events.add(IcalEvent(
            summary: summary ?? '(untitled)',
            start: start,
            allDay: allDay,
            location: location,
            url: url,
            description: description,
          ));
        }
        inEvent = false;
      } else if (inEvent) {
        final i = line.indexOf(':');
        if (i < 0) continue;
        final key = line.substring(0, i).split(';').first.toUpperCase();
        final value = line.substring(i + 1).trim();
        if (key == 'SUMMARY') {
          summary = value.replaceAll(r'\,', ',').replaceAll(r'\n', ' ');
        } else if (key == 'DTSTART') {
          start = _parseDate(value);
          allDay = !value.contains('T');
        } else if (key == 'LOCATION') {
          location = value.replaceAll(r'\,', ',');
        } else if (key == 'URL') {
          url = value;
        } else if (key == 'DESCRIPTION') {
          description = value.replaceAll(r'\,', ',').replaceAll(r'\n', '\n');
        }
      }
    }
    events.sort((a, b) => a.start.compareTo(b.start));
    return events;
  }
}
