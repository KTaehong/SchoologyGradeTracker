/// A domain error carrying the HTTP status the API should return. Services throw
/// these; the router turns them into JSON `{ "error": ... }` responses.
class ApiException implements Exception {
  const ApiException(this.status, this.code, [this.message]);
  final int status;
  final String code;
  final String? message;

  const ApiException.badRequest(String code, [String? m]) : this(400, code, m);
  const ApiException.unauthorized([String code = 'unauthorized', String? m])
      : this(401, code, m);
  const ApiException.forbidden([String code = 'forbidden', String? m])
      : this(403, code, m);
  const ApiException.notFound([String code = 'not_found', String? m])
      : this(404, code, m);
  const ApiException.conflict(String code, [String? m]) : this(409, code, m);

  Map<String, dynamic> toJson() => {
        'error': code,
        if (message != null) 'message': message,
      };

  @override
  String toString() => 'ApiException($status $code${message == null ? '' : ': $message'})';
}
