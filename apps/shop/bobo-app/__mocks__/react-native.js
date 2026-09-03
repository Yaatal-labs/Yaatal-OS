/**
 * Minimal `react-native` stand-in for the node-environment service tests.
 *
 * These suites test services and stores, not components — but importing one
 * pulls `@yaatal/core` -> `utils/platform` -> `{ Platform } from 'react-native'`,
 * and react-native ships flow-typed ESM that a `ts-jest`/node harness cannot
 * parse. That is what stopped `auth.service` and `authStore` from loading at
 * all.
 *
 * Mocking is the right size here rather than transforming react-native: the
 * only thing the imported chain actually uses is `Platform`.
 *
 * ponytail: known ceiling is that this covers `Platform` alone, so a service
 * that reaches for `Dimensions`, `Alert`, or a native module will fail with a
 * clear undefined rather than a parse error. Upgrade path is `jest-expo`,
 * which brings the real RN transform and lets the component/screen suites —
 * currently excluded via `testPathIgnorePatterns` — run too.
 */

const OS = 'ios'

module.exports = {
  Platform: {
    OS,
    // Mirrors RN's real precedence: exact platform key, then `native` for
    // anything that is not web, then `default`.
    select: (spec) => {
      if (!spec) return undefined
      if (OS in spec) return spec[OS]
      if ('native' in spec) return spec.native
      return spec.default
    },
  },
}
