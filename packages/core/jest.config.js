/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/index.ts', '!src/ports.ts'],
};
