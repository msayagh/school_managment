const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import utilities from shared folder
const database = require('../../../shared/utils/database');
const { authMiddleware, optionalAuthMiddleware } = require('../../../shared/utils/auth');
const { getLogger, requestLogger } = require('../../../shared/utils/logger');

const logger = getLogger('students-service');

const app = express();
const PORT = process.env.SERVICE_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'students' });
});

// Get all students
app.get('/api/students', optionalAuthMiddleware, async (req, res) => {
  try {
    const students = await database.query('SELECT * FROM students ORDER BY id DESC');
    logger.info(`Retrieved ${students.length} students`);
    res.json(students);
  } catch (error) {
    logger.error('Failed to get students', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve students' });
  }
});

// Get student by ID
app.get('/api/students/:id', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const students = await database.query('SELECT * FROM students WHERE id = ?', [id]);
    
    if (students.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    logger.info(`Retrieved student ${id}`);
    res.json(students[0]);
  } catch (error) {
    logger.error('Failed to get student', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve student' });
  }
});

// Create new student
app.post('/api/students', authMiddleware, async (req, res) => {
  try {
    const { first_name, last_name, email, phone, address, enrollment_date, status } = req.body;
    
    // Validate required fields
    if (!first_name || !last_name || !email) {
      return res.status(400).json({ error: 'First name, last name, and email are required' });
    }

    const normalizedPhone = phone ?? null;
    const normalizedAddress = address ?? null;

    const result = await database.query(
      'INSERT INTO students (first_name, last_name, email, phone, address, enrollment_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        first_name,
        last_name,
        email,
        normalizedPhone,
        normalizedAddress,
        enrollment_date || new Date(),
        status || 'active'
      ]
    );
    
    const newStudent = await database.query('SELECT * FROM students WHERE id = ?', [result.insertId]);
    
    logger.info(`Created student ${result.insertId}`, { email });
    res.status(201).json(newStudent[0]);
  } catch (error) {
    logger.error('Failed to create student', { error: error.message });
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to create student' });
  }
});

// Update student
app.put('/api/students/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, email, phone, address, status } = req.body;
    
    // Check if student exists
    const existing = await database.query('SELECT * FROM students WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const updates = [];
    const values = [];

    if (first_name) { updates.push('first_name = ?'); values.push(first_name); }
    if (last_name) { updates.push('last_name = ?'); values.push(last_name); }
    if (email) { updates.push('email = ?'); values.push(email); }
    if (phone !== undefined) { updates.push('phone = ?'); values.push(phone); }
    if (address !== undefined) { updates.push('address = ?'); values.push(address); }
    if (status) { updates.push('status = ?'); values.push(status); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    await database.query(`UPDATE students SET ${updates.join(', ')} WHERE id = ?`, values);
    
    const updatedStudent = await database.query('SELECT * FROM students WHERE id = ?', [id]);
    
    logger.info(`Updated student ${id}`);
    res.json(updatedStudent[0]);
  } catch (error) {
    logger.error('Failed to update student', { error: error.message });
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to update student' });
  }
});

// Delete student
app.delete('/api/students/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if student exists
    const existing = await database.query('SELECT * FROM students WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    await database.query('DELETE FROM students WHERE id = ?', [id]);
    
    logger.info(`Deleted student ${id}`);
    res.json({ message: 'Student deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete student', { error: error.message });
    res.status(500).json({ error: 'Failed to delete student' });
  }
});

// Get student's enrolled activities
app.get('/api/students/:id/activities', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if student exists
    const students = await database.query('SELECT * FROM students WHERE id = ?', [id]);
    if (students.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const activities = await database.query(
      `SELECT a.*, ae.enrollment_date, ae.status as enrollment_status
       FROM activities a
       JOIN activity_enrollments ae ON a.id = ae.activity_id
       WHERE ae.student_id = ?
       ORDER BY ae.enrollment_date DESC`,
      [id]
    );
    
    logger.info(`Retrieved ${activities.length} activities for student ${id}`);
    res.json(activities);
  } catch (error) {
    logger.error('Failed to get student activities', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve activities' });
  }
});

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

// Initialize database and start server
async function startServer() {
  try {
    await database.initializePool();
    logger.info('Database connection pool initialized');
    
    app.listen(PORT, () => {
      logger.info(`Students service running on port ${PORT}`);
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

// Only start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

module.exports = app;
