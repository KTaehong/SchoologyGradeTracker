import 'dart:convert';

import 'package:shelf/shelf.dart';

import 'errors.dart';

/// JSON response with the right content-type.
Response jsonResponse(int status, Object? body) => Response(
      status,
      body: jsonEncode(body),
      headers: const {'content-type': 'application/json; charset=utf-8'},
    );

Response ok(Object? body) => jsonResponse(200, body);
Response created(Object? body) => jsonResponse(201, body);

/// Parse a request body as a JSON object, or throw a 400.
Future<Map<String, dynamic>> readJsonMap(Request request) async {
  final raw = await request.readAsString();
  if (raw.isEmpty) return const {};
  try {
    final decoded = jsonDecode(raw);
    if (decoded is! Map<String, dynamic>) {
      throw const ApiException.badRequest('expected_json_object');
    }
    return decoded;
  } on FormatException {
    throw const ApiException.badRequest('invalid_json');
  }
}

/// Pull a required string field or throw a 400.
String requireString(Map<String, dynamic> body, String key) {
  final v = body[key];
  if (v is! String || v.isEmpty) {
    throw ApiException.badRequest('missing_field', 'Field "$key" is required.');
  }
  return v;
}
