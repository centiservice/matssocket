# Changelog for Java server API and implementation.

_(Dart and JavaScript clients have their own changelogs.)_

## RC-1.0.0.RC0+2025-10-17 ++

* Added `README-development.md`
* Improved demo/example HTML pages, including options and better metrics.
* Added `-P/-Dloglevel=...` for test server, to be able to override default DEBUG (set to OFF for 'fast!')
* Included example HTML pages using CDNs of JS Client.
* Made the special 'MatsSocket.matsSocketPing' be as fast as possible by eliding 2 ms wait (for coalescing).
* Performance improved the incoming `envelope.msg` deserialization, not going via unneeded JSON string representation.
* Added `ClusterStoreAndForward_SQL.useSetNString(bool)` and `.getNString(bool)` to tailor DB interaction, relevant
  for MS SQL and Oracle servers if using NVARCHAR and NCLOB values _(new installations should not use this! Use
  VARCHAR(MAX) and CLOB respectively, with correct i18n support on server, e.g. `_UTF8` collation orders.)_
* Upgraded all dependencies, incl. Mats<sup>3</sup> to 1.0.1+2025-10-20.
* Started changelog.
