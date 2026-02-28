const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import utilities from shared folder
const database = require('../../../shared/utils/database');
const { authMiddleware, optionalAuthMiddleware } = require('../../../shared/utils/auth');
const { getLogger, requestLogger } = require('../../../shared/utils/logger');

const logger = getLogger('teachers-service');

const app = express();
const PORT = process.env.SERVICE_PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'teachers' });
});

// Get all teachers
app.get('/api/teachers', optionalAuthMiddleware, async (req, res) => {
  try {
    const teachers = await database.query('SELECT * FROM teachers ORDER BY id DESC');
    logger.info(`Retrieved ${teachers.length} teachers`);
    res.json(teachers);
  } catch (error) {
    logger.error('Failed to get teachers', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve teachers' });
  }
});

// Get all available teachers for a time range (MUST be before /:id route)
app.get('/api/teachers/available', optionalAuthMiddleware, async (req, res) => {
  try {
    const { start_time, end_time } = req.query;

    // Get all active teachers
    const teachers = await database.query(
      'SELECT * FROM teachers WHERE status = "active" ORDER BY first_name, last_name'
    );

    if (!start_time || !end_time) {
      logger.info(`Retrieved ${teachers.length} active teachers`);
      return res.json(teachers);
    }

    // Check availability for each teacher
    const availableTeachers = [];
    for (const teacher of teachers) {
      // Find all activities assigned to this teacher
      const activities = await database.query(
        'SELECT id FROM activities WHERE teacher_id = ? AND status = "active"',
        [teacher.id]
      );

      if (activities.length === 0) {
        availableTeachers.push({...teacher, available: true, bookings: []});
        continue;
      }

      const activityIds = activities.map(a => a.id);
      const placeholders = activityIds.map(() => '?').join(',');

      // Check for conflicts
      const conflicts = await database.query(
        `SELECT * FROM bookings
         WHERE activity_id IN (${placeholders})
         AND status != 'cancelled'
         AND (
           (start_time <= ? AND end_time > ?) OR
           (start_time < ? AND end_time >= ?) OR
           (start_time >= ? AND end_time <= ?)
         )`,
        [...activityIds, start_time, start_time, end_time, end_time, start_time, end_time]
      );

      if (conflicts.length === 0) {
        availableTeachers.push({...teacher, available: true, bookings: []});
      } else {
        availableTeachers.push({...teacher, available: false, bookings: conflicts});
      }
    }

    logger.info(`Found ${availableTeachers.filter(t => t.available).length} available teachers out of ${teachers.length}`);
    res.json(availableTeachers);
  } catch (error) {
    logger.error('Failed to get available teachers', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve available teachers' });
  }
});

// Get teacher by ID
app.get('/api/teachers/:id', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const teachers = await database.query('SELECT * FROM teachers WHERE id = ?', [id]);
    
    if (teachers.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    logger.info(`Retrieved teacher ${id}`);
    res.json(teachers[0]);
  } catch (error) {
    logger.error('Failed to get teacher', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve teacher' });
  }
});

// Create new teacher
app.post('/api/teachers', authMiddleware, async (req, res) => {
  try {
    const { first_name, last_name, email, phone, specialization, hire_date, status } = req.body;
    
    // Validate required fields
    if (!first_name || !last_name || !email) {
      return res.status(400).json({ error: 'First name, last name, and email are required' });
    }

    const normalizedPhone = phone ?? null;
    const normalizedSpecialization = specialization ?? null;

    const result = await database.query(
      'INSERT INTO teachers (first_name, last_name, email, phone, specialization, hire_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        first_name,
        last_name,
        email,
        normalizedPhone,
        normalizedSpecialization,
        hire_date || new Date(),
        status || 'active'
      ]
    );
    
    const newTeacher = await database.query('SELECT * FROM teachers WHERE id = ?', [result.insertId]);
    
    logger.info(`Created teacher ${result.insertId}`, { email });
    res.status(201).json(newTeacher[0]);
  } catch (error) {
    logger.error('Failed to create teacher', { error: error.message });
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to create teacher' });
  }
});

// Update teacher
app.put('/api/teachers/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, email, phone, specialization, status } = req.body;
    
    // Check if teacher exists
    const existing = await database.query('SELECT * FROM teachers WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    const updates = [];
    const values = [];

    if (first_name) { updates.push('first_name = ?'); values.push(first_name); }
    if (last_name) { updates.push('last_name = ?'); values.push(last_name); }
    if (email) { updates.push('email = ?'); values.push(email); }
    if (phone !== undefined) { updates.push('phone = ?'); values.push(phone); }
    if (specialization !== undefined) { updates.push('specialization = ?'); values.push(specialization); }
    if (status) { updates.push('status = ?'); values.push(status); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    await database.query(`UPDATE teachers SET ${updates.join(', ')} WHERE id = ?`, values);
    
    const updatedTeacher = await database.query('SELECT * FROM teachers WHERE id = ?', [id]);
    
    logger.info(`Updated teacher ${id}`);
    res.json(updatedTeacher[0]);
  } catch (error) {
    logger.error('Failed to update teacher', { error: error.message });
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to update teacher' });
  }
});

// Delete teacher
app.delete('/api/teachers/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if teacher exists
    const existing = await database.query('SELECT * FROM teachers WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    await database.query('DELETE FROM teachers WHERE id = ?', [id]);
    
    logger.info(`Deleted teacher ${id}`);
    res.json({ message: 'Teacher deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete teacher', { error: error.message });
    res.status(500).json({ error: 'Failed to delete teacher' });
  }
});

// Get teacher's schedule
app.get('/api/teachers/:id/schedule', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if teacher exists
    const teachers = await database.query('SELECT * FROM teachers WHERE id = ?', [id]);
    if (teachers.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    const activities = await database.query(
      'SELECT id, name, schedule, start_date, end_date, status FROM activities WHERE teacher_id = ? ORDER BY start_date ASC',
      [id]
    );

    logger.info(`Retrieved schedule for teacher ${id}`);
    res.json({ teacher_id: parseInt(id), schedule: activities });
  } catch (error) {
    logger.error('Failed to get teacher schedule', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve teacher schedule' });
  }
});

// Get teacher's activities
app.get('/api/teachers/:id/activities', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if teacher exists
    const teachers = await database.query('SELECT * FROM teachers WHERE id = ?', [id]);
    if (teachers.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    const activities = await database.query(
      'SELECT * FROM activities WHERE teacher_id = ? ORDER BY created_at DESC',
      [id]
    );
    
    logger.info(`Retrieved ${activities.length} activities for teacher ${id}`);
    res.json(activities);
  } catch (error) {
    logger.error('Failed to get teacher activities', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve activities' });
  }
});

// Get teacher availability for a time range
app.get('/api/teachers/:id/availability', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { start_time, end_time } = req.query;

    // Check if teacher exists
    const teachers = await database.query('SELECT * FROM teachers WHERE id = ?', [id]);
    if (teachers.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    const teacher = teachers[0];

    // If teacher is not active, they're not available
    if (teacher.status !== 'active') {
      return res.json({
        teacher_id: parseInt(id),
        available: false,
        reason: 'Teacher is not active',
        conflicts: []
      });
    }

    // If no time range, just return teacher status
    if (!start_time || !end_time) {
      return res.json({
        teacher_id: parseInt(id),
        available: teacher.status === 'active',
        status: teacher.status
      });
    }

    // Find all activities assigned to this teacher
    const activities = await database.query(
      'SELECT id FROM activities WHERE teacher_id = ? AND status = "active"',
      [id]
    );

    if (activities.length === 0) {
      return res.json({
        teacher_id: parseInt(id),
        available: true,
        conflicts: []
      });
    }

    const activityIds = activities.map(a => a.id);

    // Check for booking conflicts
    const placeholders = activityIds.map(() => '?').join(',');
    const conflicts = await database.query(
      `SELECT b.*, a.name as activity_name FROM bookings b
       JOIN activities a ON b.activity_id = a.id
       WHERE b.activity_id IN (${placeholders})
       AND b.status != 'cancelled'
       AND (
         (b.start_time <= ? AND b.end_time > ?) OR
         (b.start_time < ? AND b.end_time >= ?) OR
         (b.start_time >= ? AND b.end_time <= ?)
       )`,
      [...activityIds, start_time, start_time, end_time, end_time, start_time, end_time]
    );

    const available = conflicts.length === 0;

    logger.info(`Checked availability for teacher ${id}: ${available ? 'available' : 'busy'}`);
    res.json({
      teacher_id: parseInt(id),
      available,
      conflicts: conflicts.map(c => ({
        booking_id: c.id,
        activity_name: c.activity_name,
        start_time: c.start_time,
        end_time: c.end_time,
        room_id: c.room_id
      }))
    });
  } catch (error) {
    logger.error('Failed to check teacher availability', { error: error.message });
    res.status(500).json({ error: 'Failed to check teacher availability' });
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
      logger.info(`Teachers service running on port ${PORT}`);
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
