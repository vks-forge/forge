/**
 * JVM (Java, Kotlin, Scala; Maven and Gradle) gate rules.
 *
 * Why: JVM tests live under `src/test/` and are silenced with `@Disabled` or `@Ignore`;
 *   style gates come from Checkstyle, Spotless, Detekt and similar tool files. A Worker
 *   that disables a test or relaxes those tools makes `mvn verify` or `gradle check`
 *   pass without proving the change. Build scripts themselves (`pom.xml`, `build.gradle`)
 *   are not guarded: they also carry dependencies, which are ordinary work.
 *
 * Exports: JVM_RULES.
 * Depends on: types/ecosystem. No IO.
 */

import type { EcosystemRules } from '#/types/ecosystem.types.js';

export const JVM_RULES: EcosystemRules = {
  id: 'jvm',
  detect: [
    'pom.xml',
    'build.gradle',
    'build.gradle.kts',
    'settings.gradle',
    'settings.gradle.kts',
    '*.java',
    '*.kt',
    '*.kts',
    '*.scala',
  ],
  tools: ['./gradlew', 'gradlew', 'gradle', 'mvn', './mvnw', 'mvnw', 'sbt'],
  configGlobs: [
    'checkstyle*.xml',
    'spotless*.gradle',
    'spotless*.xml',
    'detekt*.yml',
    'detekt*.yaml',
    'pmd*.xml',
    'spotbugs*.xml',
    '.scalafmt.conf',
  ],
  testGlobs: [
    '**/src/test/**',
    '*Test.java',
    '*Tests.java',
    '*Test.kt',
    '*Tests.kt',
    '*Test.scala',
    '*Spec.scala',
  ],
  testContent: [],
  declarations: [
    /@DisplayName\(\s*"([^"]*)"/,
    /^\s*(?:(?:public|private|protected|internal|static|suspend)\s+)*(?:void|fun)\s+`?([\w ]+?)`?\s*\(/,
  ],
  skipMarkers: [/@(?:Disabled|Ignore)\b/, /\benabled\s*=\s*false\b/],
  assertions: [/\b(?:assert\w*|verify|expect\w*)\s*\(|\bshould(?:Be|Equal)\b/],
};
