/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  moduleNameMapper: { '^@vega-ads/vast$': '<rootDir>/../vast/src' },
  collectCoverage: true,
  coverageReporters: ['text-summary'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/index.ts', '!src/ports.ts', '!src/types/**'],
  coverageThreshold: { global: { lines: 90, branches: 85 } },
};
