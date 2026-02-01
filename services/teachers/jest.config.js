module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js'
  ],
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  moduleNameMapper: {
    '^../../../shared/utils/database$': '<rootDir>/../../shared/utils/__mocks__/database.js',
    '^../../../shared/utils/logger$': '<rootDir>/../../shared/utils/__mocks__/logger.js',
    '^../../../shared/utils/auth$': '<rootDir>/../../shared/utils/__mocks__/auth.js'
  }
};

