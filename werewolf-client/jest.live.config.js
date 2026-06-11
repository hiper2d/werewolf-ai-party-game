// Runs ONLY the live API suites that the default config excludes.
// Usage: npm run test:live  (requires provider keys in .env and network access)
const base = require('./jest.config');

// The live-suite pattern is the second entry of the base ignore list.
const LIVE_TEST_PATTERN = base.testPathIgnorePatterns[1];

module.exports = {
  ...base,
  testPathIgnorePatterns: ['/node_modules/'],
  testRegex: LIVE_TEST_PATTERN,
};
