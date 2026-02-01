const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const log4js = require('log4js');

const logger = log4js.getLogger('auth');
logger.level = process.env.LOG_LEVEL || 'info';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';

// Validate JWT secret is provided
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable is required in production');
  }
  logger.warn('JWT_SECRET not provided, using insecure default for development');
}

const EFFECTIVE_JWT_SECRET = JWT_SECRET || 'dev-secret-insecure-do-not-use-in-production';

/**
 * Generate JWT token
 * @param {Object} payload Token payload
 * @returns {string} JWT token
 */
function generateToken(payload) {
  return jwt.sign(payload, EFFECTIVE_JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

/**
 * Verify JWT token
 * @param {string} token JWT token
 * @returns {Object} Decoded token payload
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, EFFECTIVE_JWT_SECRET);
  } catch (error) {
    logger.error('Token verification failed', { error: error.message });
    throw new Error('Invalid or expired token');
  }
}

/**
 * Hash password
 * @param {string} password Plain text password
 * @returns {Promise<string>} Hashed password
 */
async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Compare password with hash
 * @param {string} password Plain text password
 * @param {string} hash Hashed password
 * @returns {Promise<boolean>} True if password matches
 */
async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Authentication middleware
 * Verifies JWT token from Authorization header
 */
function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : authHeader;

    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    logger.error('Authentication failed', { error: error.message });
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

/**
 * Optional authentication middleware
 * Verifies JWT token if present, but doesn't require it
 */
function optionalAuthMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader) {
      const token = authHeader.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : authHeader;
      const decoded = verifyToken(token);
      req.user = decoded;
    }
    next();
  } catch (error) {
    // If token is invalid, just continue without user
    logger.warn('Optional auth failed', { error: error.message });
    next();
  }
}

module.exports = {
  generateToken,
  verifyToken,
  hashPassword,
  comparePassword,
  authMiddleware,
  optionalAuthMiddleware
};
