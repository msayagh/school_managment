const express = require('express');
const cors = require('cors');
require('dotenv').config();

const database = require('../../../shared/utils/database');
const { authMiddleware, optionalAuthMiddleware } = require('../../../shared/utils/auth');
const { getLogger, requestLogger } = require('../../../shared/utils/logger');

const logger = getLogger('programs-service');

const app = express();
const PORT = process.env.SERVICE_PORT || 3006;

app.use(cors());
app.use(express.json());
app.use(requestLogger);

function isAdmin(user) {
  return String(user?.role || '').toLowerCase() === 'admin';
}

function getTeacherIdFromUser(user) {
  const raw = user?.relatedId ?? user?.related_id;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function teacherAssignedToProgram(programId, user) {
  const teacherId = getTeacherIdFromUser(user);
  if (!teacherId) return false;
  const rows = await database.query(
    'SELECT 1 FROM program_instructors WHERE program_id = ? AND teacher_id = ? LIMIT 1',
    [programId, teacherId]
  );
  return rows.length > 0;
}

// ─── Health ──────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'programs' });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  PROGRAMS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/programs  – list all programs (with instructor count + activity count)
app.get('/api/programs', optionalAuthMiddleware, async (req, res) => {
  try {
    const { status, teacher_id } = req.query;
    const isTeacherUser = String(req.user?.role || '').toLowerCase() === 'teacher';

    let query = `
      SELECT
        p.*,
        r.name AS room_name,
        COUNT(DISTINCT pi2.teacher_id) AS instructor_count,
        COUNT(DISTINCT a.id)           AS activity_count
      FROM programs p
      LEFT JOIN rooms r                 ON r.id           = p.room_id
      LEFT JOIN program_instructors pi2 ON pi2.program_id = p.id
      LEFT JOIN activities a            ON a.program_id   = p.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND p.status = ?';
      params.push(status);
    }
    if (isTeacherUser) {
      const ownTeacherId = getTeacherIdFromUser(req.user);
      if (!ownTeacherId) return res.json([]);
      query += ' AND pi2.teacher_id = ?';
      params.push(ownTeacherId);
    } else if (teacher_id) {
      query += ' AND pi2.teacher_id = ?';
      params.push(teacher_id);
    }

    query += ' GROUP BY p.id ORDER BY p.start_date DESC, p.id DESC';

    const programs = await database.query(query, params);
    logger.info(`Retrieved ${programs.length} programs`);
    res.json(programs.map(p => ({
      ...p,
      instructor_count: parseInt(p.instructor_count),
      activity_count:   parseInt(p.activity_count)
    })));
  } catch (error) {
    logger.error('Failed to get programs', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve programs' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  CALENDAR VIEW  – expand recurring schedules into occurrences
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/programs/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD&program_id=X
 *
 * Returns a flat list of calendar occurrences within [start, end].
 * Each occurrence carries: date, start_time, end_time, activity info, program info.
 */
app.get('/api/programs/calendar', optionalAuthMiddleware, async (req, res) => {
  try {
    const { start, end, program_id } = req.query;

    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query params are required (YYYY-MM-DD)' });
    }

    const rangeStart = new Date(start);
    const rangeEnd   = new Date(end);

    if (isNaN(rangeStart) || isNaN(rangeEnd) || rangeStart > rangeEnd) {
      return res.status(400).json({ error: 'Invalid date range' });
    }

    // Fetch schedules joined to activities and programs
    let query = `
      SELECT
        sch.*,
        a.id   AS activity_id, a.name AS activity_name, a.description AS activity_description,
        a.capacity, a.status AS activity_status,
        p.id   AS program_id,  p.name AS program_name,  p.color AS program_color,
        r.name AS room_name, rs.name AS room_site_name,
        CASE WHEN rs.name IS NULL THEN r.name ELSE CONCAT(rs.name, ' - ', r.name) END AS room_display_name,
        r.id   AS schedule_room_id,
        a.room_id AS default_room_id
      FROM activity_schedules sch
      JOIN  activities a ON a.id = sch.activity_id
      LEFT JOIN programs  p ON p.id = a.program_id
      LEFT JOIN rooms     r ON r.id = sch.room_id
      LEFT JOIN sites    rs ON rs.id = r.site_id
      WHERE (sch.valid_until IS NULL OR sch.valid_until >= ?)
        AND sch.valid_from <= ?
    `;
    const params = [start, end];

    if (program_id) {
      query += ' AND p.id = ?';
      params.push(program_id);
    }

    const schedules = await database.query(query, params);

    const occurrences = [];

    for (const sch of schedules) {
      const events = expandSchedule(sch, rangeStart, rangeEnd);
      occurrences.push(...events);
    }

    // Sort by date then start_time
    occurrences.sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));

    // ── Merge per-occurrence overrides ────────────────────────────────────────
    if (occurrences.length) {
      const scheduleIds = [...new Set(occurrences.map(o => o.schedule_id))];
      const ph = scheduleIds.map(() => '?').join(',');
      const overrides = await database.query(
        `SELECT ov.schedule_id,
                ov.occurrence_date,
                ov.teacher_id, ov.room_id,
                ov.start_time, ov.end_time,
                ov.is_cancelled, ov.notes,
                  r.name AS ov_room_name,
                  rs.name AS ov_room_site_name,
                  CASE WHEN rs.name IS NULL THEN r.name ELSE CONCAT(rs.name, ' - ', r.name) END AS ov_room_display_name,
                CONCAT(t.first_name, ' ', t.last_name) AS ov_teacher_name
         FROM activity_schedule_overrides ov
         LEFT JOIN rooms    r ON r.id = ov.room_id
                LEFT JOIN sites   rs ON rs.id = r.site_id
         LEFT JOIN teachers t ON t.id = ov.teacher_id
         WHERE ov.schedule_id IN (${ph})
           AND ov.occurrence_date BETWEEN ? AND ?`,
        [...scheduleIds, start, end]
      );

      // Build lookup: overrideMap[scheduleId][dateStr] = override
      const overrideMap = {};
      for (const ov of overrides) {
        const dateKey = ov.occurrence_date instanceof Date
          ? ov.occurrence_date.toISOString().slice(0, 10)
          : String(ov.occurrence_date).slice(0, 10);
        if (!overrideMap[ov.schedule_id]) overrideMap[ov.schedule_id] = {};
        overrideMap[ov.schedule_id][dateKey] = ov;
      }

      // Apply overrides in-place
      for (const occ of occurrences) {
        const ov = overrideMap[occ.schedule_id]?.[occ.date];
        if (!ov) continue;
        occ.has_override = true;
        if (ov.is_cancelled) { occ.is_cancelled = true; continue; }
        if (ov.room_id)    {
          occ.room_id = ov.room_id;
          occ.room_name = ov.ov_room_name;
          occ.room_site_name = ov.ov_room_site_name;
          occ.room_display_name = ov.ov_room_display_name || ov.ov_room_name;
        }
        if (ov.teacher_id) { occ.teacher_id = ov.teacher_id; occ.teacher_name = ov.ov_teacher_name; }
        if (ov.start_time) occ.start_time = ov.start_time;
        if (ov.end_time)   occ.end_time   = ov.end_time;
        if (ov.notes)      occ.notes      = ov.notes;
      }
    }

    logger.info(`Calendar: ${occurrences.length} occurrences between ${start} and ${end}`);
    res.json(occurrences);
  } catch (error) {
    logger.error('Failed to build calendar', { error: error.message });
    res.status(500).json({ error: 'Failed to build calendar' });
  }
});

// Get program enrollments for a student (must be before /:id route)
app.get('/api/programs/enrollments', optionalAuthMiddleware, async (req, res) => {
  try {
    const { student_id, program_id } = req.query;
    const role = String(req.user?.role || '').toLowerCase();
    const teacherId = getTeacherIdFromUser(req.user);

    // Admin can list all; other roles should provide at least one filter.
    if (!student_id && !program_id && role !== 'admin') {
      return res.status(400).json({ error: 'student_id or program_id is required' });
    }

    let query = `
      SELECT pe.*, p.name AS program_name, p.description, p.color,
             s.first_name, s.last_name, s.email
      FROM program_enrollments pe
      JOIN programs p ON p.id = pe.program_id
      LEFT JOIN students s ON s.id = pe.student_id
      WHERE pe.status = 'enrolled'
    `;
    const params = [];

    if (student_id) {
      query += ' AND pe.student_id = ?';
      params.push(student_id);
    }
    if (program_id) {
      if (role === 'teacher') {
        const allowed = await teacherAssignedToProgram(program_id, req.user);
        if (!allowed) return res.status(403).json({ error: 'Access denied to this program' });
      }
      query += ' AND pe.program_id = ?';
      params.push(program_id);
    }

    if (role === 'teacher') {
      if (!teacherId) return res.json([]);
      query += ' AND pe.program_id IN (SELECT program_id FROM program_instructors WHERE teacher_id = ?)';
      params.push(teacherId);
    }

    query += ' ORDER BY pe.updated_at DESC';

    const rows = await database.query(query, params);
    res.json(rows);
  } catch (error) {
    logger.error('Failed to fetch program enrollments', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch program enrollments' });
  }
});

// GET /api/programs/:id  – single program with full details
app.get('/api/programs/:id', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (String(req.user?.role || '').toLowerCase() === 'teacher') {
      const allowed = await teacherAssignedToProgram(id, req.user);
      if (!allowed) return res.status(403).json({ error: 'Access denied to this program' });
    }

    const programs = await database.query(
      `SELECT p.*, r.name AS room_name FROM programs p LEFT JOIN rooms r ON r.id = p.room_id WHERE p.id = ?`,
      [id]
    );
    if (programs.length === 0) {
      return res.status(404).json({ error: 'Program not found' });
    }

    const program = programs[0];

    // Fetch instructors
    const instructors = await database.query(
      `SELECT t.id, t.first_name, t.last_name, t.email, t.specialization, pi2.role
       FROM program_instructors pi2
       JOIN teachers t ON t.id = pi2.teacher_id
       WHERE pi2.program_id = ?`,
      [id]
    );

    // Fetch activities
    const activities = await database.query(
      `SELECT a.id, a.name, a.description, a.status,
              a.start_date, a.end_date, a.capacity,
              a.schedule,
              (SELECT COUNT(*) FROM activity_schedules sch WHERE sch.activity_id = a.id) AS schedule_count
       FROM activities a
       WHERE a.program_id = ?
       ORDER BY a.start_date`,
      [id]
    );

    res.json({ ...program, instructors, activities });
  } catch (error) {
    logger.error('Failed to get program', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve program' });
  }
});

// POST /api/programs  – create
app.post('/api/programs', authMiddleware, async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ error: 'Only admins can create programs' });
    }
    const { name, description, start_date, end_date, capacity, color, status, room_id } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Program name is required' });
    }

    const result = await database.query(
      `INSERT INTO programs (name, description, start_date, end_date, capacity, room_id, color, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        description  ?? null,
        start_date   ?? null,
        end_date     ?? null,
        capacity     ?? null,
        room_id      ?? null,
        color        ?? '#3B82F6',
        status       ?? 'draft',
        req.user?.id ?? null
      ]
    );

    const created = await database.query(`SELECT p.*, r.name AS room_name FROM programs p LEFT JOIN rooms r ON r.id = p.room_id WHERE p.id = ?`, [result.insertId]);
    logger.info(`Created program ${result.insertId}`, { name });
    res.status(201).json(created[0]);
  } catch (error) {
    logger.error('Failed to create program', { error: error.message });
    res.status(500).json({ error: 'Failed to create program' });
  }
});

// PUT /api/programs/:id  – update
app.put('/api/programs/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, start_date, end_date, capacity, color, status, room_id } = req.body;

    if (!isAdmin(req.user)) {
      const allowed = await teacherAssignedToProgram(id, req.user);
      if (!allowed) return res.status(403).json({ error: 'Access denied to this program' });
    }

    const existing = await database.query('SELECT * FROM programs WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Program not found' });
    }

    const updates = [];
    const values  = [];

    if (name        !== undefined) { updates.push('name = ?');        values.push(name); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (start_date  !== undefined) { updates.push('start_date = ?');  values.push(start_date); }
    if (end_date    !== undefined) { updates.push('end_date = ?');    values.push(end_date); }
    if (capacity    !== undefined) { updates.push('capacity = ?');    values.push(capacity); }
    if (room_id     !== undefined) { updates.push('room_id = ?');     values.push(room_id || null); }
    if (color       !== undefined) { updates.push('color = ?');       values.push(color); }
    if (status      !== undefined) { updates.push('status = ?');      values.push(status); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    await database.query(`UPDATE programs SET ${updates.join(', ')} WHERE id = ?`, values);

    const updated = await database.query(`SELECT p.*, r.name AS room_name FROM programs p LEFT JOIN rooms r ON r.id = p.room_id WHERE p.id = ?`, [id]);
    logger.info(`Updated program ${id}`);
    res.json(updated[0]);
  } catch (error) {
    logger.error('Failed to update program', { error: error.message });
    res.status(500).json({ error: 'Failed to update program' });
  }
});

// DELETE /api/programs/:id
app.delete('/api/programs/:id', authMiddleware, async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ error: 'Only admins can delete programs' });
    }
    const { id } = req.params;

    const existing = await database.query('SELECT * FROM programs WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Program not found' });
    }

    // Gather all activity IDs belonging to this program
    const activities = await database.query('SELECT id FROM activities WHERE program_id = ?', [id]);
    const activityIds = activities.map(a => a.id);

    if (activityIds.length > 0) {
      const placeholders = activityIds.map(() => '?').join(',');
      // Delete bookings linked to these activities
      await database.query(`DELETE FROM bookings WHERE activity_id IN (${placeholders})`, activityIds);
      // activity_schedules → activity_schedule_overrides cascade via FK
      // activity_enrollments cascade via FK
      // Delete activities (cascades schedules, overrides, enrollments)
      await database.query(`DELETE FROM activities WHERE id IN (${placeholders})`, activityIds);
    }

    // program_enrollments, program_instructors, program_evaluation_templates cascade via FK
    await database.query('DELETE FROM programs WHERE id = ?', [id]);

    logger.info(`Deleted program ${id} along with ${activityIds.length} activities`);
    res.json({ message: 'Program deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete program', { error: error.message });
    res.status(500).json({ error: 'Failed to delete program' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  PROGRAM INSTRUCTORS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/programs/:id/instructors
app.get('/api/programs/:id/instructors', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const instructors = await database.query(
      `SELECT t.id, t.first_name, t.last_name, t.email, t.specialization, pi2.role, pi2.created_at AS assigned_at
       FROM program_instructors pi2
       JOIN teachers t ON t.id = pi2.teacher_id
       WHERE pi2.program_id = ?
       ORDER BY pi2.role, t.last_name`,
      [id]
    );
    res.json(instructors);
  } catch (error) {
    logger.error('Failed to get program instructors', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve instructors' });
  }
});

// POST /api/programs/:id/instructors  – assign an instructor
app.post('/api/programs/:id/instructors', authMiddleware, async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ error: 'Only admins can manage instructors' });
    }
    const { id } = req.params;
    const { teacher_id, role } = req.body;

    if (!teacher_id) {
      return res.status(400).json({ error: 'teacher_id is required' });
    }

    const program = await database.query('SELECT id FROM programs WHERE id = ?', [id]);
    if (program.length === 0) {
      return res.status(404).json({ error: 'Program not found' });
    }

    const teacher = await database.query('SELECT id FROM teachers WHERE id = ?', [teacher_id]);
    if (teacher.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    await database.query(
      `INSERT INTO program_instructors (program_id, teacher_id, role)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE role = VALUES(role)`,
      [id, teacher_id, role ?? 'assistant']
    );

    logger.info(`Assigned teacher ${teacher_id} to program ${id}`);
    res.status(201).json({ message: 'Instructor assigned successfully' });
  } catch (error) {
    logger.error('Failed to assign instructor', { error: error.message });
    res.status(500).json({ error: 'Failed to assign instructor' });
  }
});

// PUT /api/programs/:id/instructors/:teacherId  – change role
app.put('/api/programs/:id/instructors/:teacherId', authMiddleware, async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ error: 'Only admins can manage instructors' });
    }
    const { id, teacherId } = req.params;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({ error: 'role is required' });
    }

    const result = await database.query(
      'UPDATE program_instructors SET role = ? WHERE program_id = ? AND teacher_id = ?',
      [role, id, teacherId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Instructor assignment not found' });
    }

    res.json({ message: 'Role updated successfully' });
  } catch (error) {
    logger.error('Failed to update instructor role', { error: error.message });
    res.status(500).json({ error: 'Failed to update instructor role' });
  }
});

// DELETE /api/programs/:id/instructors/:teacherId
app.delete('/api/programs/:id/instructors/:teacherId', authMiddleware, async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ error: 'Only admins can manage instructors' });
    }
    const { id, teacherId } = req.params;

    const result = await database.query(
      'DELETE FROM program_instructors WHERE program_id = ? AND teacher_id = ?',
      [id, teacherId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Instructor assignment not found' });
    }

    logger.info(`Removed teacher ${teacherId} from program ${id}`);
    res.json({ message: 'Instructor removed successfully' });
  } catch (error) {
    logger.error('Failed to remove instructor', { error: error.message });
    res.status(500).json({ error: 'Failed to remove instructor' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  PROGRAM ACTIVITIES  (read-only – activities are managed via activities-service)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/programs/:id/activities  – with schedule info
app.get('/api/programs/:id/activities', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const program = await database.query('SELECT id FROM programs WHERE id = ?', [id]);
    if (program.length === 0) {
      return res.status(404).json({ error: 'Program not found' });
    }

    const activities = await database.query(
            `SELECT a.*,
              t.first_name AS teacher_first_name, t.last_name AS teacher_last_name,
              r.name AS room_name,
              s.name AS site_name,
              CASE WHEN s.name IS NULL THEN r.name ELSE CONCAT(s.name, ' - ', r.name) END AS room_display_name
       FROM activities a
       LEFT JOIN teachers t ON t.id = a.teacher_id
       LEFT JOIN rooms    r ON r.id = a.room_id
             LEFT JOIN sites    s ON s.id = r.site_id
       WHERE a.program_id = ?
       ORDER BY a.start_date`,
      [id]
    );

    // Attach schedules to each activity
    const activityIds = activities.map(a => a.id);
    let schedules = [];
    if (activityIds.length > 0) {
      schedules = await database.query(
        `SELECT * FROM activity_schedules WHERE activity_id IN (${activityIds.map(() => '?').join(',')})`,
        activityIds
      );
    }

    const schedulesByActivity = schedules.reduce((acc, s) => {
      (acc[s.activity_id] = acc[s.activity_id] || []).push(s);
      return acc;
    }, {});

    res.json(activities.map(a => ({
      ...a,
      schedules: schedulesByActivity[a.id] || []
    })));
  } catch (error) {
    logger.error('Failed to get program activities', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve activities' });
  }
});

// Enroll a student into a program
app.post('/api/programs/:id/enroll', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { student_id } = req.body;
    if (!student_id) return res.status(400).json({ error: 'student_id is required' });

    if (String(req.user?.role || '').toLowerCase() === 'teacher') {
      const allowed = await teacherAssignedToProgram(id, req.user);
      if (!allowed) return res.status(403).json({ error: 'Access denied to this program' });
    }

    const program = await database.query('SELECT id, name FROM programs WHERE id = ?', [id]);
    if (program.length === 0) return res.status(404).json({ error: 'Program not found' });

    await database.query(
      'INSERT INTO program_enrollments (student_id, program_id, enrollment_date, status) VALUES (?, ?, CURDATE(), "enrolled") ON DUPLICATE KEY UPDATE status = "enrolled", updated_at = NOW()',
      [student_id, id]
    );
    res.json({ message: `Enrolled in ${program[0].name}` });
  } catch (error) {
    logger.error('Failed to enroll in program', { error: error.message });
    res.status(500).json({ error: 'Failed to enroll in program' });
  }
});

// Unenroll a student from a program
app.delete('/api/programs/:id/enroll/:studentId', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id, studentId } = req.params;
    if (String(req.user?.role || '').toLowerCase() === 'teacher') {
      const allowed = await teacherAssignedToProgram(id, req.user);
      if (!allowed) return res.status(403).json({ error: 'Access denied to this program' });
    }
    await database.query(
      'UPDATE program_enrollments SET status = "dropped" WHERE program_id = ? AND student_id = ?',
      [id, studentId]
    );
    res.json({ message: 'Dropped from program' });
  } catch (error) {
    logger.error('Failed to unenroll from program', { error: error.message });
    res.status(500).json({ error: 'Failed to unenroll from program' });
  }
});

// ─── Schedule expansion helper ────────────────────────────────────────────────

/**
 * Expands a schedule row into concrete occurrences within [rangeStart, rangeEnd].
 */
function expandSchedule(sch, rangeStart, rangeEnd) {
  const occurrences = [];
  const validFrom   = new Date(sch.valid_from);
  const validUntil  = sch.valid_until ? new Date(sch.valid_until) : rangeEnd;

  const start = new Date(Math.max(validFrom.getTime(), rangeStart.getTime()));
  const end   = new Date(Math.min(validUntil.getTime(), rangeEnd.getTime()));

  const makeOcc = (date) => ({
    schedule_id:       sch.id,
    date:              toDateStr(date),
    start_time:        sch.start_time,
    end_time:          sch.end_time,
    recurrence_type:   sch.recurrence_type,
    activity_id:       sch.activity_id,
    activity_name:     sch.activity_name,
    activity_description: sch.activity_description,
    activity_status:   sch.activity_status,
    capacity:          sch.capacity,
    program_id:        sch.program_id,
    program_name:      sch.program_name,
    program_color:     sch.program_color,
    room_id:           sch.schedule_room_id ?? sch.default_room_id,
    room_name:         sch.room_name,
    room_site_name:    sch.room_site_name,
    room_display_name: sch.room_display_name || sch.room_name
  });

  if (sch.recurrence_type === 'once') {
    if (validFrom >= rangeStart && validFrom <= rangeEnd) {
      occurrences.push(makeOcc(validFrom));
    }
    return occurrences;
  }

  const days = parseDaysOfWeek(sch.days_of_week);

  let cursor = new Date(start);
  let weekCounter = 0; // used for bi_weekly tracking
  let lastWeekMon = null; // ISO week of last emitted biweekly occurrence

  while (cursor <= end) {
    const dow = cursor.getDay(); // 0=Sun
    const weekMon = getMonday(cursor).getTime();

    let include = false;

    switch (sch.recurrence_type) {
      case 'daily':
        include = true;
        break;
      case 'weekly':
        include = days.length === 0 ? true : days.includes(dow);
        break;
      case 'bi_weekly':
        if (days.length === 0 || days.includes(dow)) {
          if (lastWeekMon === null) {
            // first occurrence – anchor the bi-weekly cycle
            lastWeekMon = weekMon;
            include = true;
          } else {
            const weeksDiff = Math.round((weekMon - lastWeekMon) / (7 * 86400000));
            if (weeksDiff >= 2) {
              lastWeekMon = weekMon;
              include = true;
            }
          }
        }
        break;
      case 'monthly':
        // same day-of-month as valid_from
        include = cursor.getDate() === validFrom.getDate();
        break;
      default:
        include = false;
    }

    if (include) {
      occurrences.push(makeOcc(new Date(cursor)));
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return occurrences;
}

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function parseDaysOfWeek(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed.map(Number) : [];
  } catch {
    return [];
  }
}

function getMonday(d) {
  const date = new Date(d);
  const day  = date.getDay();
  const diff = (day === 0 ? -6 : 1 - day); // Mon = 1
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Start server
// ═══════════════════════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  logger.info(`Programs service running on port ${PORT}`);
});

module.exports = app;
