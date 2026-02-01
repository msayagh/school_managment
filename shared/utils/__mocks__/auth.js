// Mock auth module for testing
const auth = {
  authMiddleware: jest.fn((req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    if (token === 'valid-token') {
      req.user = { id: 1, username: 'testuser' };
      return next();
    }
    return res.status(401).json({ error: 'Invalid token' });
  }),
  optionalAuthMiddleware: jest.fn((req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token && token === 'valid-token') {
      req.user = { id: 1, username: 'testuser' };
    }
    next();
  })
};

module.exports = auth;
