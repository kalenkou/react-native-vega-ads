/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  // Tests compile with a config that also sees the test folder and the DOM types used by @vega-ads/vast.
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }] },
  collectCoverage: true,
  coverageReporters: ['text-summary'],
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/awsPorts.ts'],
  coverageThreshold: { global: { lines: 90, branches: 85 } },
};
