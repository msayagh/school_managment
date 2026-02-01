const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import utilities from shared folder
const database = require('../../../shared/utils/database');
const { authMiddleware, optionalAuthMiddleware } = require('../../../shared/utils/auth');
const { getLogger, requestLogger } = require('../../../shared/utils/logger');

const logger = getLogger('bookings-service');

const app = express();
const PORT = process.env.SERVICE_PORT || 3005;

// Middleware
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'bookings' });
});

// Get all bookings
app.get('/api/bookings', optionalAuthMiddleware, async (req, res) => {
  try {
    const bookings = await database.query('SELECT * FROM bookings ORDER BY start_time DESC');
    logger.info(`Retrieved ${bookings.length} bookings`);
    res.json(bookings);
  } catch (error) {
    logger.error('Failed to get bookings', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve bookings' });
  }
});

// Get booking by ID
app.get('/api/bookings/:id', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const bookings = await database.query('SELECT * FROM bookings WHERE id = ?', [id]);
    
    if (bookings.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    logger.info(`Retrieved booking ${id}`);
    res.json(bookings[0]);
  } catch (error) {
    logger.error('Failed to get booking', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve booking' });
  }
});

// Create new booking
app.post('/api/bookings', authMiddleware, async (req, res) => {
  try {
    const { room_id, activity_id, title, description, start_time, end_time, status, created_by } = req.body;
    
    // Validate required fields
    if (!room_id || !title || !start_time || !end_time) {
      return res.status(400).json({ error: 'Room ID, title, start time, and end time are required' });
    }

    // Validate time range
    if (new Date(start_time) >= new Date(end_time)) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }

    // Check if room exists
    const rooms = await database.query('SELECT * FROM rooms WHERE id = ?', [room_id]);
    if (rooms.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Check for conflicts
    const conflicts = await database.query(
      `SELECT * FROM bookings 
       WHERE room_id = ? 
       AND status != 'cancelled'
       AND (
         (start_time <= ? AND end_time > ?) OR
         (start_time < ? AND end_time >= ?) OR
         (start_time >= ? AND end_time <= ?)
       )`,
      [room_id, start_time, start_time, end_time, end_time, start_time, end_time]
    );

    if (conflicts.length > 0) {
      return res.status(409).json({ 
        error: 'Room is already booked for this time slot',
        conflicts: conflicts
      });
    }

    const result = await database.query(
      'INSERT INTO bookings (room_id, activity_id, title, description, start_time, end_time, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [room_id, activity_id, title, description, start_time, end_time, status || 'pending', created_by]
    );
    
    const newBooking = await database.query('SELECT * FROM bookings WHERE id = ?', [result.insertId]);
    
    logger.info(`Created booking ${result.insertId}`, { title, room_id });
    res.status(201).json(newBooking[0]);
  } catch (error) {
    logger.error('Failed to create booking', { error: error.message });
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

// Update booking
app.put('/api/bookings/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { room_id, activity_id, title, description, start_time, end_time, status } = req.body;
    
    // Check if booking exists
    const existing = await database.query('SELECT * FROM bookings WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // If updating time or room, check for conflicts
    if (room_id || start_time || end_time) {
      const checkRoomId = room_id || existing[0].room_id;
      const checkStartTime = start_time || existing[0].start_time;
      const checkEndTime = end_time || existing[0].end_time;

      // Validate time range
      if (new Date(checkStartTime) >= new Date(checkEndTime)) {
        return res.status(400).json({ error: 'End time must be after start time' });
      }

      const conflicts = await database.query(
        `SELECT * FROM bookings 
         WHERE room_id = ? 
         AND id != ?
         AND status != 'cancelled'
         AND (
           (start_time <= ? AND end_time > ?) OR
           (start_time < ? AND end_time >= ?) OR
           (start_time >= ? AND end_time <= ?)
         )`,
        [checkRoomId, id, checkStartTime, checkStartTime, checkEndTime, checkEndTime, checkStartTime, checkEndTime]
      );

      if (conflicts.length > 0) {
        return res.status(409).json({ 
          error: 'Room is already booked for this time slot',
          conflicts: conflicts
        });
      }
    }

    const updates = [];
    const values = [];

    if (room_id) { updates.push('room_id = ?'); values.push(room_id); }
    if (activity_id !== undefined) { updates.push('activity_id = ?'); values.push(activity_id); }
    if (title) { updates.push('title = ?'); values.push(title); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (start_time) { updates.push('start_time = ?'); values.push(start_time); }
    if (end_time) { updates.push('end_time = ?'); values.push(end_time); }
    if (status) { updates.push('status = ?'); values.push(status); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    await database.query(`UPDATE bookings SET ${updates.join(', ')} WHERE id = ?`, values);
    
    const updatedBooking = await database.query('SELECT * FROM bookings WHERE id = ?', [id]);
    
    logger.info(`Updated booking ${id}`);
    res.json(updatedBooking[0]);
  } catch (error) {
    logger.error('Failed to update booking', { error: error.message });
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

// Delete booking
app.delete('/api/bookings/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if booking exists
    const existing = await database.query('SELECT * FROM bookings WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    await database.query('DELETE FROM bookings WHERE id = ?', [id]);
    
    logger.info(`Deleted booking ${id}`);
    res.json({ message: 'Booking deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete booking', { error: error.message });
    res.status(500).json({ error: 'Failed to delete booking' });
  }
});

// Get bookings by room
app.get('/api/bookings/room/:roomId', optionalAuthMiddleware, async (req, res) => {
  try {
    const { roomId } = req.params;
    
    // Check if room exists
    const rooms = await database.query('SELECT * FROM rooms WHERE id = ?', [roomId]);
    if (rooms.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const bookings = await database.query(
      'SELECT * FROM bookings WHERE room_id = ? ORDER BY start_time DESC',
      [roomId]
    );
    
    logger.info(`Retrieved ${bookings.length} bookings for room ${roomId}`);
    res.json(bookings);
  } catch (error) {
    logger.error('Failed to get room bookings', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve bookings' });
  }
});

// Get booking conflicts
app.get('/api/bookings/conflicts', optionalAuthMiddleware, async (req, res) => {
  try {
    const { room_id, start_time, end_time, exclude_id } = req.query;

    if (!room_id || !start_time || !end_time) {
      return res.status(400).json({ error: 'Room ID, start time, and end time are required' });
    }

    let query = `SELECT * FROM bookings 
                 WHERE room_id = ? 
                 AND status != 'cancelled'
                 AND (
                   (start_time <= ? AND end_time > ?) OR
                   (start_time < ? AND end_time >= ?) OR
                   (start_time >= ? AND end_time <= ?)
                 )`;
    
    const params = [room_id, start_time, start_time, end_time, end_time, start_time, end_time];

    if (exclude_id) {
      query += ' AND id != ?';
      params.push(exclude_id);
    }

    const conflicts = await database.query(query, params);
    
    logger.info(`Found ${conflicts.length} conflicts`);
    res.json({
      has_conflicts: conflicts.length > 0,
      count: conflicts.length,
      conflicts: conflicts
    });
  } catch (error) {
    logger.error('Failed to check conflicts', { error: error.message });
    res.status(500).json({ error: 'Failed to check conflicts' });
  }
});

// Initialize database and start server
async function startServer() {
  try {
    await database.initializePool();
    logger.info('Database connection pool initialized');
    
    app.listen(PORT, () => {
      logger.info(`Bookings service running on port ${PORT}`);
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
