import 'dart:convert';

import 'package:bessy_server/bessy_server.dart';
import 'package:shelf/shelf.dart';

/// Thin harness: fire a JSON request at the real handler, get back the status
/// and decoded body — exercises routing, middleware and auth exactly as HTTP.
class Api {
  Api(this.app) : handler = app.handler;
  final BessyApp app;
  final Handler handler;

  Future<({int status, Map<String, dynamic> body})> call(
    String method,
    String path, {
    Object? json,
    String? token,
  }) async {
    final req = Request(
      method,
      Uri.parse('http://localhost$path'),
      headers: {
        'content-type': 'application/json',
        if (token != null) 'authorization': 'Bearer $token',
      },
      body: json == null ? null : jsonEncode(json),
    );
    final resp = await handler(req);
    final raw = await resp.readAsString();
    final decoded = raw.isEmpty ? <String, dynamic>{} : jsonDecode(raw);
    return (
      status: resp.statusCode,
      body: decoded is Map<String, dynamic> ? decoded : {'_': decoded},
    );
  }
}
