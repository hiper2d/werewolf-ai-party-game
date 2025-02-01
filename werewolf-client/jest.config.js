module.exports = {
  preset: 'ts-jest',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }]
  },
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1"
  },
  testTimeout: 60000,
};