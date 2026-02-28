const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
require('dotenv').config();

// Import utilities from shared folder
const database = require('../../../shared/utils/database');
const { generateToken, hashPassword, comparePassword, authMiddleware } = require('../../../shared/utils/auth');
const { getLogger, requestLogger } = require('../../../shared/utils/logger');

const logger = getLogger('api-gateway');

const app = express();
const PORT = process.env.API_GATEWAY_PORT || 8000;

// Middleware
app.use(cors());
app.use(requestLogger);

const jsonBodyParser = express.json();

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Swagger spec as JSON
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Root endpoint - API info
app.get('/', (req, res) => {
  res.json({
    name: 'School Management System API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: 'GET /health',
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        me: 'GET /api/auth/me'
      },
      services: {
        students: '/api/students',
        teachers: '/api/teachers',
        activities: '/api/activities',
        rooms: '/api/rooms',
        bookings: '/api/bookings'
      }
    },
    ui: 'http://localhost:3000'
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'api-gateway' });
});

// Authentication endpoints
app.post('/api/auth/register', jsonBodyParser, async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    const hashedPassword = await hashPassword(password);
    
    const result = await database.query(
      'INSERT INTO users (username, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)',
      [username, email, hashedPassword, role || 'student', 'active']
    );
    
    const token = generateToken({ 
      id: result.insertId, 
      username, 
      email, 
      role: role || 'student' 
    });
    
    logger.info(`User registered: ${username}`);
    res.status(201).json({ 
      message: 'User registered successfully', 
      token,
      user: { id: result.insertId, username, email, role: role || 'student' }
    });
  } catch (error) {
    logger.error('Registration failed', { error: error.message });
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', jsonBodyParser, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const users = await database.query(
      'SELECT * FROM users WHERE username = ? AND status = ?',
      [username, 'active']
    );
    
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    const isPasswordValid = await comparePassword(password, user.password_hash);
    
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken({ 
      id: user.id, 
      username: user.username, 
      email: user.email, 
      role: user.role 
    });
    
    logger.info(`User logged in: ${username}`);
    res.json({ 
      message: 'Login successful', 
      token,
      user: { 
        id: user.id, 
        username: user.username, 
        email: user.email, 
        role: user.role 
      }
    });
  } catch (error) {
    logger.error('Login failed', { error: error.message });
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user info
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const users = await database.query('SELECT id, username, email, role FROM users WHERE id = ?', [req.user.id]);
    
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(users[0]);
  } catch (error) {
    logger.error('Failed to get user info', { error: error.message });
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Service URLs
const STUDENTS_SERVICE_URL = process.env.STUDENTS_SERVICE_URL || 'http://students-service:3001';
const TEACHERS_SERVICE_URL = process.env.TEACHERS_SERVICE_URL || 'http://teachers-service:3002';
const ACTIVITIES_SERVICE_URL = process.env.ACTIVITIES_SERVICE_URL || 'http://activities-service:3003';
const ROOMS_SERVICE_URL = process.env.ROOMS_SERVICE_URL || 'http://rooms-service:3004';
const BOOKINGS_SERVICE_URL = process.env.BOOKINGS_SERVICE_URL || 'http://bookings-service:3005';

// Proxy configuration
const proxyOptions = {
  changeOrigin: true,
  logLevel: 'silent',
  onError: (err, req, res) => {
    logger.error('Proxy error', { error: err.message, url: req.url });
    res.status(502).json({ error: 'Service unavailable' });
  }
};

// Route to microservices
app.use('/api/students', createProxyMiddleware({
  target: STUDENTS_SERVICE_URL,
  ...proxyOptions
}));

app.use('/api/teachers', createProxyMiddleware({
  target: TEACHERS_SERVICE_URL,
  ...proxyOptions
}));

app.use('/api/activities', createProxyMiddleware({
  target: ACTIVITIES_SERVICE_URL,
  ...proxyOptions
}));

app.use('/api/rooms', createProxyMiddleware({
  target: ROOMS_SERVICE_URL,
  ...proxyOptions
}));

app.use('/api/bookings', createProxyMiddleware({
  target: BOOKINGS_SERVICE_URL,
  ...proxyOptions
}));

// Body parsing error handler
app.use((err, req, res, next) => {
  if (!err) {
    return next();
  }

  if (err.type === 'request.aborted') {
    logger.warn('Request body read aborted by client', {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip
    });
    return res.status(400).json({ error: 'Request was aborted before body was fully received' });
  }

  if (err.type === 'entity.parse.failed' || err.type === 'encoding.unsupported') {
    logger.warn('Invalid request body', {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      type: err.type
    });
    return res.status(400).json({ error: 'Invalid request body' });
  }

  return next(err);
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize database and start server
async function startServer() {
  try {
    // Skip server startup in test environment
    if (process.env.NODE_ENV === 'test') {
      logger.info('Skipping server startup in test environment');
      return;
    }

    await database.initializePool();
    logger.info('Database connection pool initialized');
    
    app.listen(PORT, () => {
      logger.info(`API Gateway running on port ${PORT}`);
      logger.info('Service routes configured:', {
        students: STUDENTS_SERVICE_URL,
        teachers: TEACHERS_SERVICE_URL,
        activities: ACTIVITIES_SERVICE_URL,
        rooms: ROOMS_SERVICE_URL,
        bookings: BOOKINGS_SERVICE_URL
      });
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  await database.closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing HTTP server');
  await database.closePool();
  process.exit(0);
});

startServer();

module.exports = app;
