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
};