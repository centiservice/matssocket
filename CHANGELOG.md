# Changelog for Java server API and implementation.

_(Dart and JavaScript clients have their own changelogs.)_

## 2.0.0+2025-11-01
* New major version, due to Java 21 and Jakarta namespaces.
* **Moved over to jakarta-namespace for all javax libraries, most notably JMS.**
* **V2-series will require Java 21.**
* **The MatsSocket API is unchanged!**  
  _As long as you get the dependencies upgraded, your MatsSocket MatsSocketEndpoints and AuthentictionPlugin will
  work without change._
* **The wire protocol is unchanged**  
  _Any existing clients using the MatsSocket JavaScript or Dart libraries are unaffected by the server upgrade._
* **The MatsSocket JavaScript and Dart clients are unchanged!**  
  _The clients have their own versioning._
* All dependencies upgraded. Both wrt. the jakarta-change, and past Java 17-requiring libs.
* Core (MatsSocket API and implementation):
    * Jakarta JMS 3.1.0
    * Jakarta WebSocket 2.2.0
    * Jackson 3.0.1
    * SLF4J 2.0.17
* Optional DB setup/migration
    * Flyway 11.15.0
* "Dev dependencies":
    * Logback 1.5.20
    * H2 database 2.4.240
    * Jetty 12.1.3, w/ _ee11_, Jakarta Servlet 6.1.0
* Upgraded to Gradle 9.2.0. Finally, no "Deprecated Gradle features were used in this build..."!

## 1.0.0+2025-10-27

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
