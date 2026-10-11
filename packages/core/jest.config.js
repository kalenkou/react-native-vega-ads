/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  moduleNameMapper: { '^react-native-vega-xml$': '<rootDir>/../xml/src' },
  collectCoverage: true,
  coverageReporters: ['text-summary'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/index.ts', '!src/vast/ports.ts', '!src/vast/types/**'],
  coverageThreshold: { global: { lines: 90, branches: 85 } },
};
