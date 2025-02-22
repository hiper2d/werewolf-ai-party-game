module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/werewolf-client'],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/werewolf-client/$1"
  },
};