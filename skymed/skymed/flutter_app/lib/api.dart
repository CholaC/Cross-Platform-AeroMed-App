import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

class Api {
  String token = '';
  Map<String, dynamic>? user;
  static const configured = String.fromEnvironment('API_URL');
  final String base = configured.isNotEmpty
      ? configured
      : (kIsWeb ? '${Uri.base.origin}/api/v1' : 'http://10.0.2.2:3000/api/v1');
  Future<dynamic> call(String path, {Map<String, dynamic>? body, String method = 'POST'}) async {
    final headers = {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'};
    final uri = Uri.parse('$base$path');
    final http.Response response;
    if (body == null) {
      response = await http.get(uri, headers: headers).timeout(const Duration(seconds: 65));
    } else if (method == 'PUT') {
      response = await http.put(uri, headers: headers, body: jsonEncode(body)).timeout(const Duration(seconds: 65));
    } else {
      response = await http.post(uri, headers: headers, body: jsonEncode(body)).timeout(const Duration(seconds: 65));
    }
    final result = jsonDecode(response.body);
    if (response.statusCode >= 400) throw Exception(result['error'] ?? 'Request failed');
    return result;
  }
  Future<void> login(String username, String password) async {
    final data = await call('/login', body: {'username': username, 'password': password});
    token = data['token']; user = Map<String, dynamic>.from(data['user']);
  }
}
