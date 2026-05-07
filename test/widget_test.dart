import 'package:flutter_test/flutter_test.dart';

import 'package:venture_gain_beta/main.dart';

void main() {
  testWidgets('renders the gamified health tracker shell', (tester) async {
    await tester.pumpWidget(const MyApp());

    expect(find.text('Workout & Energy'), findsOneWidget);
    expect(find.text('Workout Today'), findsOneWidget);
    expect(find.text('No workouts logged yet'), findsOneWidget);
    expect(find.text('Weekly Volume'), findsOneWidget);

    await tester.tap(find.text('+ ADD EXERCISE'));
    await tester.pumpAndSettle();

    expect(find.text('Select Exercise'), findsOneWidget);

    await tester.tap(find.text('Bench Press'));
    await tester.pumpAndSettle();

    expect(find.text('ENERGY ONLY'), findsOneWidget);
    expect(find.text('WEIGHTS'), findsOneWidget);
    expect(find.text('LOG WORKOUT'), findsOneWidget);
  });
}
