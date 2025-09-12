import 'package:matssocket/src/MatsSocketPlatform.dart';
import 'package:test/test.dart';

import 'lib/env.dart';

void main() {
  configureLogging();

  group('MatsSocketTransport', () {
    test('Able to create a new instance', () {
      MatsSocketPlatform.create();
    });

    test('Able to access version', () {
      expect(MatsSocketPlatform.create().runningOnVersions, isNotNull);
    });

    test('Version contains "Runtime:"; and "Dart VM/Exe", "Browser" or "Node.js"', () {
      expect(MatsSocketPlatform.create().runningOnVersions, contains('Runtime:'));
      expect(MatsSocketPlatform.create().runningOnVersions,
          anyOf(contains('Dart VM/Exe'), contains('Browser'), contains('Node.js')));
    });
  });
}