/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  moduleNameMapper: {
    '^@vega-ads/core$': '<rootDir>/../core/src',
    '^@vega-ads/vast$': '<rootDir>/../vast/src',
    '^react-native$': '<rootDir>/test/mocks/react-native.ts',
    '^@amazon-devices/react-native-w3cmedia$': '<rootDir>/test/mocks/w3cmedia.ts',
    '^@amazon-devices/react-native-kepler$': '<rootDir>/test/mocks/kepler.ts',
  },
  collectCoverage: true,
  coverageReporters: ['text-summary'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/index.ts', '!src/types/**'],
  coverageThreshold: { global: { lines: 90, branches: 85 } },
};
