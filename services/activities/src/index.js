const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import utilities from shared folder
const database = require('../../../shared/utils/database');
const { authMiddleware, optionalAuthMiddleware } = require('../../../shared/utils/auth');
const { getLogger, requestLogger } = require('../../../shared/utils/logger');

const logger = getLogger('activities-service');

const app = express();
const PORT = process.env.SERVICE_PORT || 3003;

// Middleware
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'activities' });
});

// Get all activities
app.get('/api/activities', optionalAuthMiddleware, async (req, res) => {
  try {
    const activities = await database.query('SELECT * FROM activities ORDER BY id DESC');
    logger.info(`Retrieved ${activities.length} activities`);
    res.json(activities);
  } catch (error) {
    logger.error('Failed to get activities', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve activities' });
  }
});

// Get activity by ID
app.get('/api/activities/:id', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const activities = await database.query('SELECT * FROM activities WHERE id = ?', [id]);
    
    if (activities.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    
    logger.info(`Retrieved activity ${id}`);
    res.json(activities[0]);
  } catch (error) {
    logger.error('Failed to get activity', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve activity' });
  }
});

// Create new activity
app.post('/api/activities', authMiddleware, async (req, res) => {
  try {
    const { name, description, teacher_id, room_id, capacity, start_date, end_date, schedule, status } = req.body;
    
    // Validate required fields
    if (!name || !capacity) {
      return res.status(400).json({ error: 'Name and capacity are required' });
    }

    const normalizedDescription = description ?? null;
    const normalizedTeacherId = teacher_id ?? null;
    const normalizedRoomId = room_id ?? null;
    const normalizedStartDate = start_date ?? null;
    const normalizedEndDate = end_date ?? null;
    const normalizedSchedule = schedule ?? null;

    const result = await database.query(
      'INSERT INTO activities (name, description, teacher_id, room_id, capacity, start_date, end_date, schedule, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        name,
        normalizedDescription,
        normalizedTeacherId,
        normalizedRoomId,
        capacity,
        normalizedStartDate,
        normalizedEndDate,
        normalizedSchedule,
        status || 'active'
      ]
    );
    
    const newActivity = await database.query('SELECT * FROM activities WHERE id = ?', [result.insertId]);
    
    logger.info(`Created activity ${result.insertId}`, { name });
    res.status(201).json(newActivity[0]);
  } catch (error) {
    logger.error('Failed to create activity', { error: error.message });
    res.status(500).json({ error: 'Failed to create activity' });
  }
});

// Update activity
app.put('/api/activities/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, teacher_id, room_id, capacity, start_date, end_date, schedule, status } = req.body;
    
    // Check if activity exists
    const existing = await database.query('SELECT * FROM activities WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    const updates = [];
    const values = [];

    if (name) { updates.push('name = ?'); values.push(name); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (teacher_id !== undefined) { updates.push('teacher_id = ?'); values.push(teacher_id); }
    if (room_id !== undefined) { updates.push('room_id = ?'); values.push(room_id); }
    if (capacity) { updates.push('capacity = ?'); values.push(capacity); }
    if (start_date !== undefined) { updates.push('start_date = ?'); values.push(start_date); }
    if (end_date !== undefined) { updates.push('end_date = ?'); values.push(end_date); }
    if (schedule !== undefined) { updates.push('schedule = ?'); values.push(schedule); }
    if (status) { updates.push('status = ?'); values.push(status); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    await database.query(`UPDATE activities SET ${updates.join(', ')} WHERE id = ?`, values);
    
    const updatedActivity = await database.query('SELECT * FROM activities WHERE id = ?', [id]);
    
    logger.info(`Updated activity ${id}`);
    res.json(updatedActivity[0]);
  } catch (error) {
    logger.error('Failed to update activity', { error: error.message });
    res.status(500).json({ error: 'Failed to update activity' });
  }
});

// Delete activity
app.delete('/api/activities/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if activity exists
    const existing = await database.query('SELECT * FROM activities WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    await database.query('DELETE FROM activities WHERE id = ?', [id]);
    
    logger.info(`Deleted activity ${id}`);
    res.json({ message: 'Activity deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete activity', { error: error.message });
    res.status(500).json({ error: 'Failed to delete activity' });
  }
});

// Enroll student in activity
app.post('/api/activities/:id/enroll', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { student_id } = req.body;
    
    if (!student_id) {
      return res.status(400).json({ error: 'Student ID is required' });
    }

    // Check if activity exists
    const activities = await database.query('SELECT * FROM activities WHERE id = ?', [id]);
    if (activities.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    // Check if student exists
    const students = await database.query('SELECT * FROM students WHERE id = ?', [student_id]);
    if (students.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Check current enrollment count
    const enrolled = await database.query(
      'SELECT COUNT(*) as count FROM activity_enrollments WHERE activity_id = ? AND status = "enrolled"',
      [id]
    );
    
    if (enrolled[0].count >= activities[0].capacity) {
      return res.status(400).json({ error: 'Activity is at full capacity' });
    }

    // Enroll student
    const result = await database.query(
      'INSERT INTO activity_enrollments (student_id, activity_id, enrollment_date, status) VALUES (?, ?, ?, ?)',
      [student_id, id, new Date(), 'enrolled']
    );
    
    logger.info(`Enrolled student ${student_id} in activity ${id}`);
    res.status(201).json({ message: 'Student enrolled successfully', enrollment_id: result.insertId });
  } catch (error) {
    logger.error('Failed to enroll student', { error: error.message });
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Student is already enrolled in this activity' });
    }
    res.status(500).json({ error: 'Failed to enroll student' });
  }
});

// Unenroll student from activity
app.delete('/api/activities/:id/enroll/:studentId', authMiddleware, async (req, res) => {
  try {
    const { id, studentId } = req.params;
    
    // Check if enrollment exists
    const enrollment = await database.query(
      'SELECT * FROM activity_enrollments WHERE activity_id = ? AND student_id = ?',
      [id, studentId]
    );
    
    if (enrollment.length === 0) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    await database.query(
      'DELETE FROM activity_enrollments WHERE activity_id = ? AND student_id = ?',
      [id, studentId]
    );
    
    logger.info(`Unenrolled student ${studentId} from activity ${id}`);
    res.json({ message: 'Student unenrolled successfully' });
  } catch (error) {
    logger.error('Failed to unenroll student', { error: error.message });
    res.status(500).json({ error: 'Failed to unenroll student' });
  }
});

// Get activity participants
app.get('/api/activities/:id/participants', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if activity exists
    const activities = await database.query('SELECT * FROM activities WHERE id = ?', [id]);
    if (activities.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    const participants = await database.query(
      `SELECT s.*, ae.enrollment_date, ae.status as enrollment_status
       FROM students s
       JOIN activity_enrollments ae ON s.id = ae.student_id
       WHERE ae.activity_id = ?
       ORDER BY ae.enrollment_date DESC`,
      [id]
    );
    
    logger.info(`Retrieved ${participants.length} participants for activity ${id}`);
    res.json(participants);
  } catch (error) {
    logger.error('Failed to get participants', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve participants' });
  }
});

// Assign teacher to activity
app.put('/api/activities/:id/teacher', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { teacher_id } = req.body;
    
    // Check if activity exists
    const activities = await database.query('SELECT * FROM activities WHERE id = ?', [id]);
    if (activities.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    // If teacher_id is provided, check if teacher exists
    if (teacher_id) {
      const teachers = await database.query('SELECT * FROM teachers WHERE id = ?', [teacher_id]);
      if (teachers.length === 0) {
        return res.status(404).json({ error: 'Teacher not found' });
      }
    }

    await database.query('UPDATE activities SET teacher_id = ? WHERE id = ?', [teacher_id, id]);
    
    const updatedActivity = await database.query('SELECT * FROM activities WHERE id = ?', [id]);
    
    logger.info(`Assigned teacher ${teacher_id} to activity ${id}`);
    res.json(updatedActivity[0]);
  } catch (error) {
    logger.error('Failed to assign teacher', { error: error.message });
    res.status(500).json({ error: 'Failed to assign teacher' });
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
      logger.info(`Activities service running on port ${PORT}`);
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
