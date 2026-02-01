// Mock logger module for testing
const mockLogger = {
  trace: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn()
};

const logger = {
  getLogger: jest.fn().mockReturnValue(mockLogger),
  requestLogger: jest.fn((req, res, next) => next())
};

module.exports = logger;
