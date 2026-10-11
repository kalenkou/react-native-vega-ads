/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }] },
  collectCoverage: true,
  coverageReporters: ['text-summary'],
  collectCoverageFrom: ['src/**/*.ts', '!src/dynamo.ts', '!src/index.ts'],
  coverageThreshold: { global: { lines: 90, branches: 85 } },
};
