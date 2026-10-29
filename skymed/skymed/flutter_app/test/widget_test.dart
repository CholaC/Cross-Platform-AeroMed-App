import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:skymed/main.dart';
void main() {
  testWidgets('requires sign-in before operational screens', (tester) async {
    await tester.pumpWidget(const SkyMedApp());
    expect(find.text('Sign in to outreach coordination'), findsOneWidget);
    expect(find.text('Plan outreach visit'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
