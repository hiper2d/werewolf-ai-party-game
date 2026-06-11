// Live API suites: hit real provider endpoints, cost money, and need API keys
// from .env plus network access. Excluded from the default `npm test` run;
// run them deliberately with `npm run test:live` (after agent changes, before
// SDK upgrades, before releases).
const LIVE_TEST_PATTERN =
  'app/ai/((anthropic|deepseek-v2|glm|google|gpt-5|grok|kimi|mistral)-agent|all-models|claude-thinking|google-thinking|tts/tts-tiers\\.integration)\\.test\\.ts';

module.exports = {
  preset: 'ts-jest',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }]
  },
  testEnvironment: 'node',
  // Load .env before test modules are imported (firebase/server.ts reads credentials at import time)
  setupFiles: ['dotenv/config'],
  roots: ['<rootDir>'],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1"
  },
  testTimeout: 60000,
  // The live pattern is read by jest.live.config.js (always index 1 here).
  testPathIgnorePatterns: ['/node_modules/', LIVE_TEST_PATTERN],
};
