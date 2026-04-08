const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import utilities from shared folder
const database = require('../../../shared/utils/database');
const { authMiddleware, optionalAuthMiddleware } = require('../../../shared/utils/auth');
const { getLogger, requestLogger } = require('../../../shared/utils/logger');

const logger = getLogger('rooms-service');

const app = express();
const PORT = process.env.SERVICE_PORT || 3004;

// Middleware
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'rooms' });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  SITES  (physical locations that contain rooms)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/rooms/sites
app.get('/api/rooms/sites', optionalAuthMiddleware, async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT s.*, COUNT(r.id) AS room_count
      FROM sites s
      LEFT JOIN rooms r ON r.site_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (status) { query += ' AND s.status = ?'; params.push(status); }
    query += ' GROUP BY s.id ORDER BY s.name';

    const sites = await database.query(query, params);
    logger.info(`Retrieved ${sites.length} sites`);
    res.json(sites.map(s => ({ ...s, room_count: parseInt(s.room_count) })));
  } catch (error) {
    logger.error('Failed to get sites', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve sites' });
  }
});

// GET /api/rooms/sites/:id
app.get('/api/rooms/sites/:id', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const sites = await database.query('SELECT * FROM sites WHERE id = ?', [id]);
    if (sites.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }

    const rooms = await database.query(
      'SELECT * FROM rooms WHERE site_id = ? ORDER BY name', [id]
    );

    res.json({ ...sites[0], rooms });
  } catch (error) {
    logger.error('Failed to get site', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve site' });
  }
});

// POST /api/rooms/sites
app.post('/api/rooms/sites', authMiddleware, async (req, res) => {
  try {
    const { name, address, description, status } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Site name is required' });
    }
    const result = await database.query(
      'INSERT INTO sites (name, address, description, status) VALUES (?, ?, ?, ?)',
      [name, address ?? null, description ?? null, status ?? 'active']
    );
    const created = await database.query('SELECT * FROM sites WHERE id = ?', [result.insertId]);
    logger.info(`Created site ${result.insertId}`, { name });
    res.status(201).json(created[0]);
  } catch (error) {
    logger.error('Failed to create site', { error: error.message });
    res.status(500).json({ error: 'Failed to create site' });
  }
});

// PUT /api/rooms/sites/:id
app.put('/api/rooms/sites/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, description, status } = req.body;

    const existing = await database.query('SELECT id FROM sites WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }

    const updates = [];
    const values  = [];
    if (name        !== undefined) { updates.push('name = ?');        values.push(name); }
    if (address     !== undefined) { updates.push('address = ?');     values.push(address); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (status      !== undefined) { updates.push('status = ?');      values.push(status); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    await database.query(`UPDATE sites SET ${updates.join(', ')} WHERE id = ?`, values);
    const updated = await database.query('SELECT * FROM sites WHERE id = ?', [id]);
    logger.info(`Updated site ${id}`);
    res.json(updated[0]);
  } catch (error) {
    logger.error('Failed to update site', { error: error.message });
    res.status(500).json({ error: 'Failed to update site' });
  }
});

// DELETE /api/rooms/sites/:id
app.delete('/api/rooms/sites/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await database.query('SELECT id FROM sites WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }

    await database.query('DELETE FROM sites WHERE id = ?', [id]);
    logger.info(`Deleted site ${id}`);
    res.json({ message: 'Site deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete site', { error: error.message });
    res.status(500).json({ error: 'Failed to delete site' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ROOMS
// ═══════════════════════════════════════════════════════════════════════════════

// Get all rooms
app.get('/api/rooms', optionalAuthMiddleware, async (req, res) => {
  try {
    const { site_id } = req.query;
    let query = `
      SELECT r.*, s.name AS site_name
      FROM rooms r
      LEFT JOIN sites s ON s.id = r.site_id
      WHERE 1=1
    `;
    const params = [];
    if (site_id) { query += ' AND r.site_id = ?'; params.push(site_id); }
    query += ' ORDER BY r.id DESC';

    const rooms = await database.query(query, params);
    logger.info(`Retrieved ${rooms.length} rooms`);
    res.json(rooms);
  } catch (error) {
    logger.error('Failed to get rooms', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve rooms' });
  }
});

// Get available rooms (MUST be before /:id routes to avoid matching "available" as an ID)
app.get('/api/rooms/available', optionalAuthMiddleware, async (req, res) => {
  try {
    const { start_time, end_time, capacity, room_type } = req.query;

    // Build query
    let query = 'SELECT * FROM rooms WHERE status = "available"';
    const params = [];

    if (capacity) {
      query += ' AND capacity >= ?';
      params.push(capacity);
    }

    if (room_type) {
      query += ' AND room_type = ?';
      params.push(room_type);
    }

    let rooms = await database.query(query, params);

    // Include site info
    if (rooms.length > 0) {
      const siteIds = [...new Set(rooms.map(r => r.site_id).filter(Boolean))];
      let siteMap = {};
      if (siteIds.length > 0) {
        const sites = await database.query(
          `SELECT id, name FROM sites WHERE id IN (${siteIds.map(() => '?').join(',')})`,
          siteIds
        );
        siteMap = sites.reduce((acc, s) => { acc[s.id] = s.name; return acc; }, {});
      }
      rooms = rooms.map(r => ({ ...r, site_name: siteMap[r.site_id] ?? null }));
    }

    // If time range specified, filter out rooms with conflicts
    if (start_time && end_time) {
      const availableRooms = [];
      
      for (const room of rooms) {
        const conflicts = await database.query(
          `SELECT COUNT(*) as count FROM bookings 
           WHERE room_id = ? 
           AND status != 'cancelled'
           AND (
             (start_time <= ? AND end_time > ?) OR
             (start_time < ? AND end_time >= ?) OR
             (start_time >= ? AND end_time <= ?)
           )`,
          [room.id, start_time, start_time, end_time, end_time, start_time, end_time]
        );

        if (conflicts[0].count === 0) {
          availableRooms.push(room);
        }
      }
      
      rooms = availableRooms;
    }

    logger.info(`Retrieved ${rooms.length} available rooms`);
    res.json(rooms);
  } catch (error) {
    logger.error('Failed to get available rooms', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve available rooms' });
  }
});

// Get room by ID
app.get('/api/rooms/:id', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const rooms = await database.query(
      `SELECT r.*, s.name AS site_name FROM rooms r LEFT JOIN sites s ON s.id = r.site_id WHERE r.id = ?`,
      [id]
    );
    
    if (rooms.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    logger.info(`Retrieved room ${id}`);
    res.json(rooms[0]);
  } catch (error) {
    logger.error('Failed to get room', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve room' });
  }
});

// Get room availability
app.get('/api/rooms/:id/availability', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { start_time, end_time } = req.query;
    
    // Check if room exists
    const rooms = await database.query('SELECT * FROM rooms WHERE id = ?', [id]);
    if (rooms.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const room = rooms[0];

    // If no time range specified, return room status
    if (!start_time || !end_time) {
      return res.json({
        room_id: room.id,
        name: room.name,
        status: room.status,
        available: room.status === 'available'
      });
    }

    // Check for conflicting bookings in the time range
    const conflicts = await database.query(
      `SELECT * FROM bookings 
       WHERE room_id = ? 
       AND status != 'cancelled'
       AND (
         (start_time <= ? AND end_time > ?) OR
         (start_time < ? AND end_time >= ?) OR
         (start_time >= ? AND end_time <= ?)
       )`,
      [id, start_time, start_time, end_time, end_time, start_time, end_time]
    );

    const available = room.status === 'available' && conflicts.length === 0;

    logger.info(`Checked availability for room ${id}`);
    res.json({
      room_id: room.id,
      name: room.name,
      status: room.status,
      available,
      conflicts: conflicts.length,
      bookings: conflicts
    });
  } catch (error) {
    logger.error('Failed to check room availability', { error: error.message });
    res.status(500).json({ error: 'Failed to check availability' });
  }
});

// Create new room
app.post('/api/rooms', authMiddleware, async (req, res) => {
  try {
    const { name, capacity, room_type, location, equipment, status, site_id } = req.body;
    
    // Validate required fields
    if (!name || !capacity) {
      return res.status(400).json({ error: 'Name and capacity are required' });
    }

    if (site_id) {
      const site = await database.query('SELECT id FROM sites WHERE id = ?', [site_id]);
      if (site.length === 0) {
        return res.status(400).json({ error: 'Site not found' });
      }
    }

    const result = await database.query(
      'INSERT INTO rooms (name, site_id, capacity, room_type, location, equipment, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, site_id ?? null, capacity, room_type || 'classroom', location ?? null, equipment ?? null, status || 'available']
    );
    
    const newRoom = await database.query(
      `SELECT r.*, s.name AS site_name FROM rooms r LEFT JOIN sites s ON s.id = r.site_id WHERE r.id = ?`,
      [result.insertId]
    );
    
    logger.info(`Created room ${result.insertId}`, { name });
    res.status(201).json(newRoom[0]);
  } catch (error) {
    logger.error('Failed to create room', { error: error.message });
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Update room
app.put('/api/rooms/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, capacity, room_type, location, equipment, status, site_id } = req.body;
    
    // Check if room exists
    const existing = await database.query('SELECT * FROM rooms WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const updates = [];
    const values = [];

    if (name      !== undefined) { updates.push('name = ?');      values.push(name); }
    if (capacity  !== undefined) { updates.push('capacity = ?');  values.push(capacity); }
    if (room_type !== undefined) { updates.push('room_type = ?'); values.push(room_type); }
    if (location  !== undefined) { updates.push('location = ?');  values.push(location); }
    if (equipment !== undefined) { updates.push('equipment = ?'); values.push(equipment); }
    if (status    !== undefined) { updates.push('status = ?');    values.push(status); }
    if (site_id   !== undefined) { updates.push('site_id = ?');   values.push(site_id); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    await database.query(`UPDATE rooms SET ${updates.join(', ')} WHERE id = ?`, values);
    
    const updatedRoom = await database.query(
      `SELECT r.*, s.name AS site_name FROM rooms r LEFT JOIN sites s ON s.id = r.site_id WHERE r.id = ?`,
      [id]
    );
    
    logger.info(`Updated room ${id}`);
    res.json(updatedRoom[0]);
  } catch (error) {
    logger.error('Failed to update room', { error: error.message });
    res.status(500).json({ error: 'Failed to update room' });
  }
});

// Delete room
app.delete('/api/rooms/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if room exists
    const existing = await database.query('SELECT * FROM rooms WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    await database.query('DELETE FROM rooms WHERE id = ?', [id]);
    
    logger.info(`Deleted room ${id}`);
    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete room', { error: error.message });
    res.status(500).json({ error: 'Failed to delete room' });
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
      logger.info(`Rooms service running on port ${PORT}`);
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
