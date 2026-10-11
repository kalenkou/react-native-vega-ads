/** Live checks against public Google IMA sample tags. Run by hand: npx jest -c jest.live.config.js */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test-live'],
  testTimeout: 30000,
};
