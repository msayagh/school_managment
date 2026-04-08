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

// Helper function to normalize datetime format
// Converts ISO format (2026-03-01T14:00:00Z) to MySQL format (2026-03-01 14:00:00)
function normalizeDatetime(datetimeStr) {
  if (!datetimeStr) return null;
  
  // If already in MySQL format (YYYY-MM-DD HH:MM:SS), return as is
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(datetimeStr)) {
    return datetimeStr;
  }
  
  // Convert ISO format (2026-03-01T14:00:00Z or 2026-03-01T14:00:00) to MySQL format
  // Remove 'Z' and replace 'T' with space
  const normalized = datetimeStr.replace('Z', '').replace('T', ' ');
  
  // Return first 19 characters (YYYY-MM-DD HH:MM:SS)
  return normalized.slice(0, 19);
}

const BOOKING_SCOPES = {
  GENERAL: 'GENERAL',
  PROGRAM_DEFAULT: 'PROGRAM_DEFAULT',
  ACTIVITY_OVERRIDE: 'ACTIVITY_OVERRIDE'
};

function normalizeScope(scope) {
  const raw = String(scope || BOOKING_SCOPES.GENERAL).toUpperCase();
  return BOOKING_SCOPES[raw] || null;
}

function toDateTimeParts(startTime, endTime) {
  const start = normalizeDatetime(startTime);
  const end = normalizeDatetime(endTime);
  if (!start || !end) return { start: null, end: null };
  return { start, end };
}

function priorityRank(scope) {
  if (scope === BOOKING_SCOPES.ACTIVITY_OVERRIDE) return 3;
  if (scope === BOOKING_SCOPES.PROGRAM_DEFAULT) return 2;
  return 1;
}

function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

function parseDaysOfWeek(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(Number).filter(n => n >= 0 && n <= 6);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(Number).filter(n => n >= 0 && n <= 6) : [];
  } catch {
    return [];
  }
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function expandScheduleOccurrences(scheduleRow, rangeStart, rangeEnd) {
  const validFrom = new Date(scheduleRow.valid_from);
  const validUntil = scheduleRow.valid_until ? new Date(scheduleRow.valid_until) : rangeEnd;
  const start = new Date(Math.max(validFrom.getTime(), rangeStart.getTime()));
  const end = new Date(Math.min(validUntil.getTime(), rangeEnd.getTime()));

  const days = parseDaysOfWeek(scheduleRow.days_of_week);
  const occurrences = [];

  const addOccurrence = (date) => {
    occurrences.push({
      activity_id: scheduleRow.activity_id,
      activity_name: scheduleRow.activity_name,
      schedule_id: scheduleRow.id,
      occurrence_date: toDateStr(date),
      start_time: scheduleRow.start_time,
      end_time: scheduleRow.end_time
    });
  };

  if ((scheduleRow.recurrence_type || 'once') === 'once') {
    if (validFrom >= rangeStart && validFrom <= rangeEnd) addOccurrence(validFrom);
    return occurrences;
  }

  let cursor = new Date(start);
  let biWeeklyAnchor = null;

  while (cursor <= end) {
    const dow = cursor.getDay();
    const weekMon = getMonday(cursor).getTime();
    const recurrence = scheduleRow.recurrence_type || 'once';
    let include = false;

    if (recurrence === 'daily') {
      include = true;
    } else if (recurrence === 'weekly') {
      include = days.length ? days.includes(dow) : true;
    } else if (recurrence === 'bi_weekly') {
      if (days.length ? days.includes(dow) : true) {
        if (biWeeklyAnchor === null) {
          biWeeklyAnchor = weekMon;
          include = true;
        } else {
          include = ((weekMon - biWeeklyAnchor) / (7 * 24 * 60 * 60 * 1000)) % 2 === 0;
        }
      }
    } else if (recurrence === 'monthly') {
      include = cursor.getDate() === validFrom.getDate();
    } else {
      include = true;
    }

    if (include) addOccurrence(cursor);
    cursor.setDate(cursor.getDate() + 1);
  }

  return occurrences;
}

async function fetchRoomById(roomId) {
  const rows = await database.query(
    `SELECT r.*, s.name AS site_name
     FROM rooms r
     LEFT JOIN sites s ON s.id = r.site_id
     WHERE r.id = ?`,
    [roomId]
  );
  return rows[0] || null;
}

async function fetchConflictBookings({ roomId, startTime, endTime, excludeId }) {
  let query = `
    SELECT b.*,
           r.name AS room_name,
           s.name AS room_site_name,
           CASE WHEN s.name IS NULL THEN r.name ELSE CONCAT(s.name, ' - ', r.name) END AS room_display_name,
           a.name AS activity_name,
           p.name AS program_name
    FROM bookings b
    JOIN rooms r ON r.id = b.room_id
    LEFT JOIN sites s ON s.id = r.site_id
    LEFT JOIN activities a ON a.id = b.activity_id
    LEFT JOIN programs p ON p.id = COALESCE(b.program_id, a.program_id)
    WHERE b.room_id = ?
      AND b.status != 'cancelled'
      AND (
        (b.start_time <= ? AND b.end_time > ?) OR
        (b.start_time < ? AND b.end_time >= ?) OR
        (b.start_time >= ? AND b.end_time <= ?)
      )
  `;
  const params = [roomId, startTime, startTime, endTime, endTime, startTime, endTime];

  if (excludeId) {
    query += ' AND b.id != ?';
    params.push(excludeId);
  }

  query += ' ORDER BY b.start_time';
  return database.query(query, params);
}

async function proposeAlternativeRooms({ startTime, endTime, currentRoomId, activityId, limit = 5 }) {
  const [allRooms, currentRoom, activityRows] = await Promise.all([
    database.query(
      `SELECT r.*, s.name AS site_name,
              CASE WHEN s.name IS NULL THEN r.name ELSE CONCAT(s.name, ' - ', r.name) END AS room_display_name
       FROM rooms r
       LEFT JOIN sites s ON s.id = r.site_id
       WHERE r.status = 'available'
       ORDER BY r.capacity ASC`
    ),
    currentRoomId ? fetchRoomById(currentRoomId) : Promise.resolve(null),
    activityId ? database.query('SELECT id, capacity, program_id FROM activities WHERE id = ?', [activityId]) : Promise.resolve([])
  ]);

  const activity = activityRows[0] || null;
  const candidates = [];

  for (const room of allRooms) {
    if (currentRoomId && Number(room.id) === Number(currentRoomId)) continue;
    const conflicts = await fetchConflictBookings({ roomId: room.id, startTime, endTime });
    if (conflicts.length > 0) continue;

    let score = 0;
    const reasons = [];

    if (currentRoom?.site_id && room.site_id && Number(currentRoom.site_id) === Number(room.site_id)) {
      score += 30;
      reasons.push('same_site_as_requested_room');
    }

    if (activity?.capacity && room.capacity >= activity.capacity) {
      const surplus = room.capacity - activity.capacity;
      score += Math.max(0, 25 - surplus);
      reasons.push('fits_activity_capacity');
    }

    if (room.room_type === currentRoom?.room_type) {
      score += 10;
      reasons.push('same_room_type');
    }

    score += 5; // baseline score for available alternative

    candidates.push({
      room_id: room.id,
      room_name: room.name,
      room_site_name: room.site_name,
      room_display_name: room.room_display_name || room.name,
      score,
      reasons
    });
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, limit);
}

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
    const bookings = await database.query(
      `SELECT b.*,
              r.name AS room_name,
              s.name AS room_site_name,
              CASE WHEN s.name IS NULL THEN r.name ELSE CONCAT(s.name, ' - ', r.name) END AS room_display_name,
              a.name AS activity_name,
              p.name AS program_name
       FROM bookings b
       JOIN rooms r ON r.id = b.room_id
       LEFT JOIN sites s ON s.id = r.site_id
       LEFT JOIN activities a ON a.id = b.activity_id
       LEFT JOIN programs p ON p.id = COALESCE(b.program_id, a.program_id)
       ORDER BY b.start_time DESC`
    );
    logger.info(`Retrieved ${bookings.length} bookings`);
    res.json(bookings);
  } catch (error) {
    logger.error('Failed to get bookings', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve bookings' });
  }
});

// Get booking conflicts (MUST be before /:id route)
app.get('/api/bookings/conflicts', optionalAuthMiddleware, async (req, res) => {
  try {
    const { room_id, start_time, end_time, exclude_id, activity_id } = req.query;

    if (!room_id || !start_time || !end_time) {
      return res.status(400).json({ error: 'Room ID, start time, and end time are required' });
    }
    const { start, end } = toDateTimeParts(start_time, end_time);
    const conflicts = await fetchConflictBookings({
      roomId: room_id,
      startTime: start,
      endTime: end,
      excludeId: exclude_id
    });
    const alternatives = await proposeAlternativeRooms({
      startTime: start,
      endTime: end,
      currentRoomId: room_id,
      activityId: activity_id
    });
    
    logger.info(`Found ${conflicts.length} conflicts`);
    res.json({
      has_conflicts: conflicts.length > 0,
      count: conflicts.length,
      conflicts,
      proposals: alternatives
    });
  } catch (error) {
    logger.error('Failed to check conflicts', { error: error.message });
    res.status(500).json({ error: 'Failed to check conflicts' });
  }
});

// Resolve booking request and propose alternatives without inserting records.
app.post('/api/bookings/resolve', authMiddleware, async (req, res) => {
  try {
    const {
      room_id,
      start_time,
      end_time,
      scope,
      activity_id,
      program_id,
      exclude_id
    } = req.body;

    const normalizedScope = normalizeScope(scope);
    if (!normalizedScope) {
      return res.status(400).json({ error: 'Invalid booking scope' });
    }
    if (!room_id || !start_time || !end_time) {
      return res.status(400).json({ error: 'room_id, start_time, and end_time are required' });
    }
    if (normalizedScope === BOOKING_SCOPES.PROGRAM_DEFAULT && !program_id) {
      return res.status(400).json({ error: 'program_id is required for PROGRAM_DEFAULT scope' });
    }
    if (normalizedScope === BOOKING_SCOPES.ACTIVITY_OVERRIDE && !activity_id) {
      return res.status(400).json({ error: 'activity_id is required for ACTIVITY_OVERRIDE scope' });
    }

    const { start, end } = toDateTimeParts(start_time, end_time);
    if (!start || !end || new Date(start) >= new Date(end)) {
      return res.status(400).json({ error: 'Invalid time range' });
    }

    const conflicts = await fetchConflictBookings({
      roomId: room_id,
      startTime: start,
      endTime: end,
      excludeId: exclude_id
    });

    const proposals = await proposeAlternativeRooms({
      startTime: start,
      endTime: end,
      currentRoomId: room_id,
      activityId: activity_id
    });

    const response = {
      can_book: conflicts.length === 0,
      conflict_count: conflicts.length,
      conflicts,
      proposals,
      suggested_resolution: null
    };

    if (conflicts.length > 0 && proposals.length > 0) {
      const best = proposals[0];
      response.suggested_resolution = {
        strategy: normalizedScope === BOOKING_SCOPES.PROGRAM_DEFAULT && activity_id
          ? 'keep_program_default_and_create_activity_override'
          : 'move_booking_to_alternative_room',
        recommendation: {
          room_id: best.room_id,
          room_display_name: best.room_display_name,
          score: best.score
        }
      };
    }

    await database.query(
      `INSERT INTO booking_conflict_events
         (requested_scope, requested_room_id, requested_program_id, requested_activity_id, requested_start_time, requested_end_time, conflict_count, proposal_count, resolution_strategy, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizedScope,
        room_id,
        program_id ?? null,
        activity_id ?? null,
        start,
        end,
        conflicts.length,
        proposals.length,
        response.suggested_resolution?.strategy || null,
        req.user?.username || null
      ]
    );

    return res.json(response);
  } catch (error) {
    logger.error('Failed to resolve booking', { error: error.message });
    return res.status(500).json({ error: 'Failed to resolve booking request' });
  }
});

// Plan/apply default room bookings for a whole program based on activity schedules.
app.post('/api/bookings/program-default', authMiddleware, async (req, res) => {
  try {
    const {
      program_id,
      room_id,
      start_date,
      end_date,
      dry_run = true,
      conflict_strategy = 'propose_only'
    } = req.body;

    if (!program_id || !room_id || !start_date || !end_date) {
      return res.status(400).json({ error: 'program_id, room_id, start_date, and end_date are required' });
    }

    const rangeStart = new Date(start_date);
    const rangeEnd = new Date(end_date);
    if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime()) || rangeStart > rangeEnd) {
      return res.status(400).json({ error: 'Invalid date range' });
    }

    const [programRows, room] = await Promise.all([
      database.query('SELECT id, name FROM programs WHERE id = ?', [program_id]),
      fetchRoomById(room_id)
    ]);
    if (!programRows.length) return res.status(404).json({ error: 'Program not found' });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const schedules = await database.query(
      `SELECT sch.*, a.name AS activity_name
       FROM activity_schedules sch
       JOIN activities a ON a.id = sch.activity_id
       WHERE a.program_id = ?
         AND (sch.valid_until IS NULL OR sch.valid_until >= ?)
         AND sch.valid_from <= ?`,
      [program_id, start_date, end_date]
    );

    const occurrences = schedules.flatMap(s => expandScheduleOccurrences(s, rangeStart, rangeEnd));
    const plan = [];
    const toCreate = [];

    for (const occ of occurrences) {
      const bookingStart = `${occ.occurrence_date} ${String(occ.start_time).substring(0, 8)}`;
      const bookingEnd = `${occ.occurrence_date} ${String(occ.end_time).substring(0, 8)}`;
      const conflicts = await fetchConflictBookings({
        roomId: room_id,
        startTime: bookingStart,
        endTime: bookingEnd
      });

      const proposals = conflicts.length
        ? await proposeAlternativeRooms({
            startTime: bookingStart,
            endTime: bookingEnd,
            currentRoomId: room_id,
            activityId: occ.activity_id
          })
        : [];

      const item = {
        activity_id: occ.activity_id,
        activity_name: occ.activity_name,
        schedule_id: occ.schedule_id,
        occurrence_date: occ.occurrence_date,
        start_time: bookingStart,
        end_time: bookingEnd,
        has_conflict: conflicts.length > 0,
        conflicts,
        proposals
      };
      plan.push(item);

      if (!item.has_conflict) {
        toCreate.push({ ...item, room_id, scope: BOOKING_SCOPES.PROGRAM_DEFAULT, title: `${programRows[0].name} - ${occ.activity_name}` });
      } else if (conflict_strategy === 'auto_override_best_room' && proposals.length) {
        toCreate.push({
          ...item,
          room_id: proposals[0].room_id,
          scope: BOOKING_SCOPES.ACTIVITY_OVERRIDE,
          title: `${programRows[0].name} - ${occ.activity_name} (override)`
        });
      }
    }

    const summary = {
      total_occurrences: plan.length,
      non_conflicting: plan.filter(p => !p.has_conflict).length,
      conflicting: plan.filter(p => p.has_conflict).length,
      creatable_now: toCreate.length
    };

    if (dry_run) {
      return res.json({
        dry_run: true,
        program_id,
        room_id,
        room_display_name: room.site_name ? `${room.site_name} - ${room.name}` : room.name,
        conflict_strategy,
        summary,
        plan
      });
    }

    const created = [];
    for (const c of toCreate) {
      const insertRes = await database.query(
        `INSERT INTO bookings
           (room_id, activity_id, program_id, schedule_id, occurrence_date, scope, priority, title, start_time, end_time, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)`,
        [
          c.room_id,
          c.activity_id,
          program_id,
          c.schedule_id,
          c.occurrence_date,
          c.scope,
          priorityRank(c.scope),
          c.title,
          c.start_time,
          c.end_time,
          req.user?.username || null
        ]
      );
      created.push(insertRes.insertId);
    }

    return res.status(201).json({
      dry_run: false,
      program_id,
      room_id,
      conflict_strategy,
      summary,
      created_count: created.length,
      created_ids: created,
      unresolved_conflicts: plan.filter(p => p.has_conflict && !(conflict_strategy === 'auto_override_best_room' && p.proposals.length))
    });
  } catch (error) {
    logger.error('Failed to plan/apply program default bookings', { error: error.message });
    return res.status(500).json({ error: 'Failed to plan/apply program default bookings' });
  }
});

// Get bookings by room (MUST be before /:id route)
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
    const {
      room_id,
      activity_id,
      program_id,
      schedule_id,
      occurrence_date,
      source_booking_id,
      scope,
      title,
      description,
      start_time,
      end_time,
      status,
      created_by
    } = req.body;

    const normalizedScope = normalizeScope(scope);
    if (!normalizedScope) {
      return res.status(400).json({ error: 'Invalid booking scope' });
    }
    
    // Normalize datetime format (convert ISO to MySQL format)
    const normalizedStartTime = normalizeDatetime(start_time);
    const normalizedEndTime = normalizeDatetime(end_time);
    
    // Validate required fields
    if (!room_id || !title || !normalizedStartTime || !normalizedEndTime) {
      return res.status(400).json({ error: 'Room ID, title, start time, and end time are required' });
    }

    if (normalizedScope === BOOKING_SCOPES.PROGRAM_DEFAULT && !program_id) {
      return res.status(400).json({ error: 'program_id is required for PROGRAM_DEFAULT scope' });
    }
    if (normalizedScope === BOOKING_SCOPES.ACTIVITY_OVERRIDE && !activity_id) {
      return res.status(400).json({ error: 'activity_id is required for ACTIVITY_OVERRIDE scope' });
    }

    // Validate time range
    if (new Date(normalizedStartTime) >= new Date(normalizedEndTime)) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }

    // Check if room exists
    const rooms = await database.query('SELECT * FROM rooms WHERE id = ?', [room_id]);
    if (rooms.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (activity_id && program_id) {
      const activityRows = await database.query('SELECT id, program_id FROM activities WHERE id = ?', [activity_id]);
      if (!activityRows.length) {
        return res.status(404).json({ error: 'Activity not found' });
      }
      if (activityRows[0].program_id && Number(activityRows[0].program_id) !== Number(program_id)) {
        return res.status(400).json({ error: 'activity_id does not belong to the provided program_id' });
      }
    }

    if (source_booking_id) {
      const source = await database.query('SELECT id FROM bookings WHERE id = ?', [source_booking_id]);
      if (!source.length) {
        return res.status(404).json({ error: 'source_booking_id not found' });
      }
    }

    const conflicts = await fetchConflictBookings({
      roomId: room_id,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime
    });

    if (conflicts.length > 0) {
      const alternatives = await proposeAlternativeRooms({
        startTime: normalizedStartTime,
        endTime: normalizedEndTime,
        currentRoomId: room_id,
        activityId: activity_id
      });
      return res.status(409).json({ 
        error: 'Room is already booked for this time slot',
        conflicts,
        proposals: alternatives
      });
    }

    const normalizedActivityId = activity_id ?? null;
    const normalizedProgramId = program_id ?? null;
    const normalizedScheduleId = schedule_id ?? null;
    const normalizedOccurrenceDate = occurrence_date ?? null;
    const normalizedSourceBookingId = source_booking_id ?? null;
    const normalizedDescription = description ?? null;
    const normalizedCreatedBy = created_by ?? null;

    const result = await database.query(
      `INSERT INTO bookings
         (room_id, activity_id, program_id, schedule_id, occurrence_date, source_booking_id, scope, priority, title, description, start_time, end_time, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        room_id,
        normalizedActivityId,
        normalizedProgramId,
        normalizedScheduleId,
        normalizedOccurrenceDate,
        normalizedSourceBookingId,
        normalizedScope,
        priorityRank(normalizedScope),
        title,
        normalizedDescription,
        normalizedStartTime,
        normalizedEndTime,
        status || 'pending',
        normalizedCreatedBy
      ]
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
    const {
      room_id,
      activity_id,
      program_id,
      schedule_id,
      occurrence_date,
      source_booking_id,
      scope,
      title,
      description,
      start_time,
      end_time,
      status
    } = req.body;
    
    // Check if booking exists
    const existing = await database.query('SELECT * FROM bookings WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Normalize datetime format if provided
    const normalizedStartTime = start_time ? normalizeDatetime(start_time) : null;
    const normalizedEndTime = end_time ? normalizeDatetime(end_time) : null;
    const normalizedScope = scope !== undefined ? normalizeScope(scope) : existing[0].scope;

    if (!normalizedScope) {
      return res.status(400).json({ error: 'Invalid booking scope' });
    }

    const resolvedActivityId = activity_id !== undefined ? activity_id : existing[0].activity_id;
    const resolvedProgramId = program_id !== undefined ? program_id : existing[0].program_id;

    if (normalizedScope === BOOKING_SCOPES.PROGRAM_DEFAULT && !resolvedProgramId) {
      return res.status(400).json({ error: 'program_id is required for PROGRAM_DEFAULT scope' });
    }
    if (normalizedScope === BOOKING_SCOPES.ACTIVITY_OVERRIDE && !resolvedActivityId) {
      return res.status(400).json({ error: 'activity_id is required for ACTIVITY_OVERRIDE scope' });
    }

    if (resolvedActivityId && resolvedProgramId) {
      const activityRows = await database.query('SELECT id, program_id FROM activities WHERE id = ?', [resolvedActivityId]);
      if (!activityRows.length) {
        return res.status(404).json({ error: 'Activity not found' });
      }
      if (activityRows[0].program_id && Number(activityRows[0].program_id) !== Number(resolvedProgramId)) {
        return res.status(400).json({ error: 'activity_id does not belong to the provided program_id' });
      }
    }

    // If updating time or room, check for conflicts
    if (room_id || normalizedStartTime || normalizedEndTime) {
      const checkRoomId = room_id || existing[0].room_id;
      const checkStartTime = normalizedStartTime || existing[0].start_time;
      const checkEndTime = normalizedEndTime || existing[0].end_time;

      // Validate time range
      if (new Date(checkStartTime) >= new Date(checkEndTime)) {
        return res.status(400).json({ error: 'End time must be after start time' });
      }

      const conflicts = await fetchConflictBookings({
        roomId: checkRoomId,
        startTime: checkStartTime,
        endTime: checkEndTime,
        excludeId: id
      });

      if (conflicts.length > 0) {
        const alternatives = await proposeAlternativeRooms({
          startTime: checkStartTime,
          endTime: checkEndTime,
          currentRoomId: checkRoomId,
          activityId: resolvedActivityId
        });
        return res.status(409).json({ 
          error: 'Room is already booked for this time slot',
          conflicts,
          proposals: alternatives
        });
      }
    }

    const updates = [];
    const values = [];

    if (room_id) { updates.push('room_id = ?'); values.push(room_id); }
    if (activity_id !== undefined) { updates.push('activity_id = ?'); values.push(activity_id); }
    if (program_id !== undefined) { updates.push('program_id = ?'); values.push(program_id); }
    if (schedule_id !== undefined) { updates.push('schedule_id = ?'); values.push(schedule_id); }
    if (occurrence_date !== undefined) { updates.push('occurrence_date = ?'); values.push(occurrence_date); }
    if (source_booking_id !== undefined) { updates.push('source_booking_id = ?'); values.push(source_booking_id); }
    if (scope !== undefined) {
      updates.push('scope = ?');
      values.push(normalizedScope);
      updates.push('priority = ?');
      values.push(priorityRank(normalizedScope));
    }
    if (title) { updates.push('title = ?'); values.push(title); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (normalizedStartTime) { updates.push('start_time = ?'); values.push(normalizedStartTime); }
    if (normalizedEndTime) { updates.push('end_time = ?'); values.push(normalizedEndTime); }
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

  async function ensureBookingSchema() {
    const [{ dbName }] = await database.query('SELECT DATABASE() AS dbName');

    async function hasColumn(tableName, columnName) {
      const rows = await database.query(
        `SELECT 1
         FROM information_schema.columns
         WHERE table_schema = ? AND table_name = ? AND column_name = ?
         LIMIT 1`,
        [dbName, tableName, columnName]
      );
      return rows.length > 0;
    }

    async function hasIndex(tableName, indexName) {
      const rows = await database.query(
        `SELECT 1
         FROM information_schema.statistics
         WHERE table_schema = ? AND table_name = ? AND index_name = ?
         LIMIT 1`,
        [dbName, tableName, indexName]
      );
      return rows.length > 0;
    }

    async function hasConstraint(tableName, constraintName) {
      const rows = await database.query(
        `SELECT 1
         FROM information_schema.table_constraints
         WHERE table_schema = ? AND table_name = ? AND constraint_name = ?
         LIMIT 1`,
        [dbName, tableName, constraintName]
      );
      return rows.length > 0;
    }

    if (!await hasColumn('bookings', 'program_id')) {
      await database.query('ALTER TABLE bookings ADD COLUMN program_id INT NULL AFTER activity_id');
    }
    if (!await hasColumn('bookings', 'schedule_id')) {
      await database.query('ALTER TABLE bookings ADD COLUMN schedule_id INT NULL AFTER program_id');
    }
    if (!await hasColumn('bookings', 'occurrence_date')) {
      await database.query('ALTER TABLE bookings ADD COLUMN occurrence_date DATE NULL AFTER schedule_id');
    }
    if (!await hasColumn('bookings', 'source_booking_id')) {
      await database.query('ALTER TABLE bookings ADD COLUMN source_booking_id INT NULL AFTER occurrence_date');
    }
    if (!await hasColumn('bookings', 'scope')) {
      await database.query(`ALTER TABLE bookings
        ADD COLUMN scope ENUM('GENERAL','PROGRAM_DEFAULT','ACTIVITY_OVERRIDE') NOT NULL DEFAULT 'GENERAL' AFTER source_booking_id`);
    }
    if (!await hasColumn('bookings', 'priority')) {
      await database.query('ALTER TABLE bookings ADD COLUMN priority INT NOT NULL DEFAULT 1 AFTER scope');
    }

    if (!await hasIndex('bookings', 'idx_bookings_scope')) {
      await database.query('CREATE INDEX idx_bookings_scope ON bookings(scope)');
    }
    if (!await hasIndex('bookings', 'idx_bookings_program')) {
      await database.query('CREATE INDEX idx_bookings_program ON bookings(program_id)');
    }
    if (!await hasIndex('bookings', 'idx_bookings_activity')) {
      await database.query('CREATE INDEX idx_bookings_activity ON bookings(activity_id)');
    }
    if (!await hasIndex('bookings', 'idx_bookings_occurrence')) {
      await database.query('CREATE INDEX idx_bookings_occurrence ON bookings(occurrence_date)');
    }

    if (!await hasConstraint('bookings', 'fk_bookings_program')) {
      await database.query('ALTER TABLE bookings ADD CONSTRAINT fk_bookings_program FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE');
    }
    if (!await hasConstraint('bookings', 'fk_bookings_schedule')) {
      await database.query('ALTER TABLE bookings ADD CONSTRAINT fk_bookings_schedule FOREIGN KEY (schedule_id) REFERENCES activity_schedules(id) ON DELETE SET NULL');
    }
    if (!await hasConstraint('bookings', 'fk_bookings_source')) {
      await database.query('ALTER TABLE bookings ADD CONSTRAINT fk_bookings_source FOREIGN KEY (source_booking_id) REFERENCES bookings(id) ON DELETE SET NULL');
    }

    await database.query(`CREATE TABLE IF NOT EXISTS booking_conflict_events (
       id BIGINT AUTO_INCREMENT PRIMARY KEY,
       requested_scope ENUM('GENERAL','PROGRAM_DEFAULT','ACTIVITY_OVERRIDE') NOT NULL,
       requested_room_id INT NOT NULL,
       requested_program_id INT NULL,
       requested_activity_id INT NULL,
       requested_start_time DATETIME NOT NULL,
       requested_end_time DATETIME NOT NULL,
       conflict_count INT NOT NULL DEFAULT 0,
       proposal_count INT NOT NULL DEFAULT 0,
       resolution_strategy VARCHAR(100) NULL,
       created_by VARCHAR(100) NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (requested_room_id) REFERENCES rooms(id) ON DELETE RESTRICT
     )`);
  }

// Initialize database and start server
async function startServer() {
  try {
    await database.initializePool();
     await ensureBookingSchema();
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

// Only start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

module.exports = app;
