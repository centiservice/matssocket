## 1.0.0-rc.1+2025-10-14

* Improved Dart null-safety quite a bit.
* .. including getting tests to run again, with null-safety!
* Upgraded Dart to 3.9.4 (latest at the time of writing)
* Got rid of dart:html
* Runs on all platforms and compilers.
* Added examples.
* Cleaned all doc warnings.
* Picked all lint.
* Added full outOfBandClose functionality.
* Corrected tab=2 spaces.
* Improved "client lib and version" ('clv') string sent to server.
* Improved READMEs.
* Got pana-score to 150 of 160.

## 0.19.0+2022-11-11

* Fixes [Issue 11](https://github.com/centiservice/matssocket/issues/11): If a MatsSocket only performs subscribe, no
  other message sending, then sub was never sent to server

## 0.18.0+2021-09-20

* Corrected bad version string inside MatsSocket.dart

## 0.18.0+2021-09-19

* First version on pub.dev