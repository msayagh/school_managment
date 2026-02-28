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
        login: 'POST /api/auth/login',
        verify: 'POST /api/auth/verify',
        changePassword: 'POST /api/auth/change-password',
        registerStudent: 'POST /api/auth/register/student',
        users: 'GET /api/auth/users (admin only)',
        createUser: 'POST /api/auth/users (admin only)'
      },
      services: {
        students: '/api/students',
        teachers: '/api/teachers',
        activities: '/api/activities',
        rooms: '/api/rooms',
        bookings: '/api/bookings',
        enrollments: '/api/enrollments'
      }
    },
    ui: 'http://localhost:3000'
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'api-gateway' });
});

// Service URLs
const STUDENTS_SERVICE_URL = process.env.STUDENTS_SERVICE_URL || 'http://students-service:3001';
const TEACHERS_SERVICE_URL = process.env.TEACHERS_SERVICE_URL || 'http://teachers-service:3002';
const ACTIVITIES_SERVICE_URL = process.env.ACTIVITIES_SERVICE_URL || 'http://activities-service:3003';
const ROOMS_SERVICE_URL = process.env.ROOMS_SERVICE_URL || 'http://rooms-service:3004';
const BOOKINGS_SERVICE_URL = process.env.BOOKINGS_SERVICE_URL || 'http://bookings-service:3005';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3007';

// Proxy configuration
const proxyOptions = {
  changeOrigin: true,
  logLevel: 'silent',
  onError: (err, req, res) => {
    logger.error('Proxy error', { error: err.message, url: req.url });
    res.status(502).json({ error: 'Service unavailable' });
  }
};

// Auth routes - proxy to auth service
app.use('/api/auth', createProxyMiddleware({
  target: AUTH_SERVICE_URL,
  pathRewrite: { '^/api/auth': '' },
  ...proxyOptions
}));

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

// Enrollments endpoint via activities service
app.use('/api/enrollments', createProxyMiddleware({
  target: ACTIVITIES_SERVICE_URL,
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
        auth: AUTH_SERVICE_URL,
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
