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
      expect(MatsSocketPlatform.create().version, isNotNull);
    });

    test('Version contains User-Agent (for web) or Host (for vm)', () {
      expect(MatsSocketPlatform.create().version, contains('MatsSocket.dart'));
      expect(MatsSocketPlatform.create().version, anyOf(contains('User-Agent:'), contains('Host:')));
    });
  });
}