// Mock database module for testing
const database = {
  initializePool: jest.fn().mockResolvedValue({}),
  getPool: jest.fn().mockReturnValue({}),
  query: jest.fn(),
  closePool: jest.fn().mockResolvedValue()
};

module.exports = database;
