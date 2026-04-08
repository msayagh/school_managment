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

function isAdmin(user) {
  return String(user?.role || '').toLowerCase() === 'admin';
}

function getTeacherIdFromUser(user) {
  const raw = user?.relatedId ?? user?.related_id;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function teacherCanManageProgram(user, programId) {
  if (!programId) return false;
  const teacherId = getTeacherIdFromUser(user);
  if (!teacherId) return false;
  const rows = await database.query(
    'SELECT 1 FROM program_instructors WHERE program_id = ? AND teacher_id = ? LIMIT 1',
    [programId, teacherId]
  );
  return rows.length > 0;
}

async function getActivityProgramId(activityId) {
  const rows = await database.query('SELECT program_id FROM activities WHERE id = ?', [activityId]);
  if (!rows.length) return null;
  return rows[0].program_id ?? null;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'activities' });
});

// Get all activities
app.get('/api/activities', optionalAuthMiddleware, async (req, res) => {
  try {
    const { program_id, status } = req.query;

    let query = `
      SELECT a.*,
             p.name  AS program_name,  p.color AS program_color,
             t.first_name AS teacher_first_name, t.last_name AS teacher_last_name,
                  r.name  AS room_name,     r.site_id, s.name AS site_name,
                  CASE WHEN s.name IS NULL THEN r.name ELSE CONCAT(s.name, ' - ', r.name) END AS room_display_name,
             (SELECT COUNT(*) FROM activity_schedules WHERE activity_id = a.id) AS schedule_count
      FROM activities a
      LEFT JOIN programs p ON p.id = a.program_id
      LEFT JOIN teachers t ON t.id = a.teacher_id
      LEFT JOIN rooms    r ON r.id = a.room_id
                LEFT JOIN sites    s ON s.id = r.site_id
      WHERE 1=1
    `;
    const params = [];

    if (program_id) { query += ' AND a.program_id = ?'; params.push(program_id); }
    if (status)     { query += ' AND a.status = ?';     params.push(status); }

    query += ' ORDER BY a.id DESC';

    const activities = await database.query(query, params);
    logger.info(`Retrieved ${activities.length} activities`);
    res.json(activities);
  } catch (error) {
    logger.error('Failed to get activities', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve activities' });
  }
});

// Get all activities with enrollment counts (MUST be before /:id route)
app.get('/api/activities/with-enrollment', optionalAuthMiddleware, async (req, res) => {
  try {
    const activities = await database.query(`
      SELECT 
        a.*,
        COUNT(ae.id) as enrolled_count,
        (a.capacity - COUNT(ae.id)) as available_spots
      FROM activities a
      LEFT JOIN activity_enrollments ae ON a.id = ae.activity_id AND ae.status = 'enrolled'
      GROUP BY a.id
      ORDER BY a.id DESC
    `);
    
    logger.info(`Retrieved ${activities.length} activities with enrollment counts`);
    res.json(activities.map(a => ({
      ...a,
      enrolled_count: parseInt(a.enrolled_count),
      available_spots: parseInt(a.available_spots)
    })));
  } catch (error) {
    logger.error('Failed to get activities with enrollment', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve activities' });
  }
});

// Get activity by ID  (includes schedules)
app.get('/api/activities/:id', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const activities = await database.query(
      `SELECT a.*,
              p.name AS program_name, p.color AS program_color,
              t.first_name AS teacher_first_name, t.last_name AS teacher_last_name,
              r.name AS room_name, r.site_id, s.name AS site_name,
              CASE WHEN s.name IS NULL THEN r.name ELSE CONCAT(s.name, ' - ', r.name) END AS room_display_name
       FROM activities a
       LEFT JOIN programs p ON p.id = a.program_id
       LEFT JOIN teachers t ON t.id = a.teacher_id
       LEFT JOIN rooms    r ON r.id = a.room_id
            LEFT JOIN sites    s ON s.id = r.site_id
       WHERE a.id = ?`,
      [id]
    );
    
    if (activities.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    const schedules = await database.query(
      'SELECT * FROM activity_schedules WHERE activity_id = ? ORDER BY valid_from',
      [id]
    );
    
    logger.info(`Retrieved activity ${id}`);
    res.json({ ...activities[0], schedules });
  } catch (error) {
    logger.error('Failed to get activity', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve activity' });
  }
});

// Create new activity
app.post('/api/activities', authMiddleware, async (req, res) => {
  try {
    const { name, description, teacher_id, room_id, capacity, start_date, end_date, schedule, status, program_id } = req.body;
    
    // Validate required fields
    if (!name || !capacity) {
      return res.status(400).json({ error: 'Name and capacity are required' });
    }

    if (program_id) {
      const prog = await database.query('SELECT id FROM programs WHERE id = ?', [program_id]);
      if (prog.length === 0) {
        return res.status(400).json({ error: 'Program not found' });
      }
    }

    if (!isAdmin(req.user)) {
      if (!program_id) {
        return res.status(403).json({ error: 'Teachers can create activities only inside assigned programs' });
      }
      const allowed = await teacherCanManageProgram(req.user, program_id);
      if (!allowed) {
        return res.status(403).json({ error: 'Access denied for this program' });
      }
    }

    const result = await database.query(
      'INSERT INTO activities (program_id, name, description, teacher_id, room_id, capacity, start_date, end_date, schedule, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        program_id   ?? null,
        name,
        description  ?? null,
        teacher_id   ?? null,
        room_id      ?? null,
        capacity,
        start_date   ?? null,
        end_date     ?? null,
        schedule     ?? null,
        status       || 'active'
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
    const { name, description, teacher_id, room_id, capacity, start_date, end_date, schedule, status, program_id } = req.body;
    
    // Check if activity exists
    const existing = await database.query('SELECT * FROM activities WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    if (!isAdmin(req.user)) {
      const currentProgramId = existing[0].program_id;
      const targetProgramId = program_id !== undefined ? program_id : currentProgramId;
      const allowed = await teacherCanManageProgram(req.user, targetProgramId);
      if (!allowed) {
        return res.status(403).json({ error: 'Access denied for this activity/program' });
      }
    }

    const updates = [];
    const values = [];

    if (name)               { updates.push('name = ?');        values.push(name); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (teacher_id  !== undefined) { updates.push('teacher_id = ?');  values.push(teacher_id); }
    if (room_id     !== undefined) { updates.push('room_id = ?');     values.push(room_id); }
    if (capacity)                  { updates.push('capacity = ?');    values.push(capacity); }
    if (start_date  !== undefined) { updates.push('start_date = ?');  values.push(start_date); }
    if (end_date    !== undefined) { updates.push('end_date = ?');    values.push(end_date); }
    if (schedule    !== undefined) { updates.push('schedule = ?');    values.push(schedule); }
    if (status)                    { updates.push('status = ?');      values.push(status); }
    if (program_id  !== undefined) { updates.push('program_id = ?'); values.push(program_id); }

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

    if (!isAdmin(req.user)) {
      const allowed = await teacherCanManageProgram(req.user, existing[0].program_id);
      if (!allowed) {
        return res.status(403).json({ error: 'Access denied for this activity/program' });
      }
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

// Get activity capacity and enrollment info
app.get('/api/activities/:id/capacity', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if activity exists
    const activities = await database.query('SELECT * FROM activities WHERE id = ?', [id]);
    if (activities.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    const activity = activities[0];

    // Count enrolled students
    const enrolled = await database.query(
      'SELECT COUNT(*) as count FROM activity_enrollments WHERE activity_id = ? AND status = "enrolled"',
      [id]
    );

    const enrolledCount = enrolled[0].count;
    const capacity = activity.capacity;
    const availableSpots = capacity - enrolledCount;
    const isFull = availableSpots <= 0;

    logger.info(`Retrieved capacity info for activity ${id}`);
    res.json({
      activity_id: parseInt(id),
      capacity,
      enrolled: enrolledCount,
      available: availableSpots,
      is_full: isFull,
      percentage: Math.round((enrolledCount / capacity) * 100)
    });
  } catch (error) {
    logger.error('Failed to get activity capacity', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve activity capacity' });
  }
});

// Get all enrollments (can be called from any service)
app.get('/api/enrollments', optionalAuthMiddleware, async (req, res) => {
  try {
    const enrollments = await database.query(`
      SELECT 
        ae.*,
        s.first_name,
        s.last_name,
        s.email,
        a.name as activity_name,
        a.capacity as activity_capacity
      FROM activity_enrollments ae
      LEFT JOIN students s ON ae.student_id = s.id
      LEFT JOIN activities a ON ae.activity_id = a.id
      ORDER BY ae.enrollment_date DESC
    `);
    
    logger.info(`Retrieved ${enrollments.length} enrollments`);
    res.json(enrollments);
  } catch (error) {
    logger.error('Failed to get enrollments', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve enrollments' });
  }
});

// Get enrollments for a specific student
app.get('/api/students/:id/enrollments', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const enrollments = await database.query(`
      SELECT 
        ae.*,
        a.name as activity_name,
        a.capacity as activity_capacity,
        t.first_name as teacher_first_name,
        t.last_name as teacher_last_name
      FROM activity_enrollments ae
      LEFT JOIN activities a ON ae.activity_id = a.id
      LEFT JOIN teachers t ON a.teacher_id = t.id
      WHERE ae.student_id = ?
      ORDER BY ae.enrollment_date DESC
    `, [id]);
    
    logger.info(`Retrieved ${enrollments.length} enrollments for student ${id}`);
    res.json(enrollments);
  } catch (error) {
    logger.error('Failed to get student enrollments', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve student enrollments' });
  }
});

// Get enrollments for a specific activity
app.get('/api/activities/:id/enrollments', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const enrollments = await database.query(`
      SELECT 
        ae.*,
        s.first_name,
        s.last_name,
        s.email
      FROM activity_enrollments ae
      LEFT JOIN students s ON ae.student_id = s.id
      WHERE ae.activity_id = ?
      ORDER BY ae.enrollment_date DESC
    `, [id]);
    
    logger.info(`Retrieved ${enrollments.length} enrollments for activity ${id}`);
    res.json(enrollments);
  } catch (error) {
    logger.error('Failed to get activity enrollments', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve activity enrollments' });
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

// ═══════════════════════════════════════════════════════════════════════════════
//  ACTIVITY SCHEDULES  (recurring schedule rules)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/activities/:id/schedules
app.get('/api/activities/:id/schedules', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const activity = await database.query('SELECT id FROM activities WHERE id = ?', [id]);
    if (activity.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    const schedules = await database.query(
      `SELECT sch.*, r.name AS room_name, s.name AS site_name,
          CASE WHEN s.name IS NULL THEN r.name ELSE CONCAT(s.name, ' - ', r.name) END AS room_display_name
       FROM activity_schedules sch
       LEFT JOIN rooms r ON r.id = sch.room_id
       LEFT JOIN sites s ON s.id = r.site_id
       WHERE sch.activity_id = ?
       ORDER BY sch.valid_from`,
      [id]
    );

    res.json(schedules.map(s => ({ ...s, days_of_week: parseJson(s.days_of_week) })));
  } catch (error) {
    logger.error('Failed to get schedules', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve schedules' });
  }
});

// POST /api/activities/:id/schedules  – add a schedule rule
app.post('/api/activities/:id/schedules', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { recurrence_type, days_of_week, start_time, end_time, valid_from, valid_until, room_id, rrule } = req.body;

    if (!start_time || !end_time || !valid_from) {
      return res.status(400).json({ error: 'start_time, end_time, and valid_from are required' });
    }

    const validRecurrences = ['once', 'daily', 'weekly', 'bi_weekly', 'monthly', 'custom'];
    if (recurrence_type && !validRecurrences.includes(recurrence_type)) {
      return res.status(400).json({ error: `recurrence_type must be one of: ${validRecurrences.join(', ')}` });
    }

    const activity = await database.query('SELECT id FROM activities WHERE id = ?', [id]);
    if (activity.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    if (!isAdmin(req.user)) {
      const activityProgramId = await getActivityProgramId(id);
      const allowed = await teacherCanManageProgram(req.user, activityProgramId);
      if (!allowed) {
        return res.status(403).json({ error: 'Access denied for this activity/program' });
      }
    }

    const result = await database.query(
      `INSERT INTO activity_schedules
         (activity_id, recurrence_type, days_of_week, start_time, end_time, valid_from, valid_until, room_id, rrule)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        recurrence_type ?? 'once',
        days_of_week    ? JSON.stringify(days_of_week) : null,
        start_time,
        end_time,
        valid_from,
        valid_until     ?? null,
        room_id         ?? null,
        rrule           ?? null
      ]
    );

    const created = await database.query(
      'SELECT * FROM activity_schedules WHERE id = ?', [result.insertId]
    );
    logger.info(`Created schedule ${result.insertId} for activity ${id}`);
    res.status(201).json({ ...created[0], days_of_week: parseJson(created[0].days_of_week) });
  } catch (error) {
    logger.error('Failed to create schedule', { error: error.message });
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

// PUT /api/activities/:id/schedules/:scheduleId
app.put('/api/activities/:id/schedules/:scheduleId', authMiddleware, async (req, res) => {
  try {
    const { id, scheduleId } = req.params;
    const { recurrence_type, days_of_week, start_time, end_time, valid_from, valid_until, room_id, rrule } = req.body;

    const existing = await database.query(
      'SELECT id FROM activity_schedules WHERE id = ? AND activity_id = ?', [scheduleId, id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    if (!isAdmin(req.user)) {
      const activityProgramId = await getActivityProgramId(id);
      const allowed = await teacherCanManageProgram(req.user, activityProgramId);
      if (!allowed) {
        return res.status(403).json({ error: 'Access denied for this activity/program' });
      }
    }

    const updates = [];
    const values  = [];

    if (recurrence_type !== undefined) { updates.push('recurrence_type = ?'); values.push(recurrence_type); }
    if (days_of_week    !== undefined) { updates.push('days_of_week = ?');    values.push(JSON.stringify(days_of_week)); }
    if (start_time      !== undefined) { updates.push('start_time = ?');      values.push(start_time); }
    if (end_time        !== undefined) { updates.push('end_time = ?');        values.push(end_time); }
    if (valid_from      !== undefined) { updates.push('valid_from = ?');      values.push(valid_from); }
    if (valid_until     !== undefined) { updates.push('valid_until = ?');     values.push(valid_until); }
    if (room_id         !== undefined) { updates.push('room_id = ?');         values.push(room_id); }
    if (rrule           !== undefined) { updates.push('rrule = ?');           values.push(rrule); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(scheduleId);
    await database.query(`UPDATE activity_schedules SET ${updates.join(', ')} WHERE id = ?`, values);

    const updated = await database.query('SELECT * FROM activity_schedules WHERE id = ?', [scheduleId]);
    logger.info(`Updated schedule ${scheduleId}`);
    res.json({ ...updated[0], days_of_week: parseJson(updated[0].days_of_week) });
  } catch (error) {
    logger.error('Failed to update schedule', { error: error.message });
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

// DELETE /api/activities/:id/schedules/:scheduleId
app.delete('/api/activities/:id/schedules/:scheduleId', authMiddleware, async (req, res) => {
  try {
    const { id, scheduleId } = req.params;

    if (!isAdmin(req.user)) {
      const activityProgramId = await getActivityProgramId(id);
      const allowed = await teacherCanManageProgram(req.user, activityProgramId);
      if (!allowed) {
        return res.status(403).json({ error: 'Access denied for this activity/program' });
      }
    }

    const result = await database.query(
      'DELETE FROM activity_schedules WHERE id = ? AND activity_id = ?', [scheduleId, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    logger.info(`Deleted schedule ${scheduleId} from activity ${id}`);
    res.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete schedule', { error: error.message });
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

// ─── Schedule Occurrence Overrides ───────────────────────────────────────────

// GET /api/activities/:id/schedules/:scheduleId/overrides
app.get('/api/activities/:id/schedules/:scheduleId/overrides', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id, scheduleId } = req.params;
    const existing = await database.query(
      'SELECT id FROM activity_schedules WHERE id = ? AND activity_id = ?', [scheduleId, id]
    );
    if (existing.length === 0) return res.status(404).json({ error: 'Schedule not found' });

    const overrides = await database.query(
            `SELECT ov.*,
              r.name AS room_name,
              s.name AS site_name,
              CASE WHEN s.name IS NULL THEN r.name ELSE CONCAT(s.name, ' - ', r.name) END AS room_display_name,
              t.first_name AS teacher_first_name, t.last_name AS teacher_last_name
       FROM activity_schedule_overrides ov
       LEFT JOIN rooms r    ON r.id = ov.room_id
             LEFT JOIN sites s    ON s.id = r.site_id
       LEFT JOIN teachers t ON t.id = ov.teacher_id
       WHERE ov.schedule_id = ?
       ORDER BY ov.occurrence_date`,
      [scheduleId]
    );
    res.json(overrides);
  } catch (error) {
    logger.error('Failed to get overrides', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve overrides' });
  }
});

// PUT /api/activities/:id/schedules/:scheduleId/overrides/:date
// Upsert a per-occurrence override for the given date (YYYY-MM-DD).
// Pass null for a field to revert it to the rule/activity default.
app.put('/api/activities/:id/schedules/:scheduleId/overrides/:date', authMiddleware, async (req, res) => {
  try {
    const { id, scheduleId, date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format, expected YYYY-MM-DD' });
    }

    const existing = await database.query(
      'SELECT id FROM activity_schedules WHERE id = ? AND activity_id = ?', [scheduleId, id]
    );
    if (existing.length === 0) return res.status(404).json({ error: 'Schedule not found' });

    if (!isAdmin(req.user)) {
      const activityProgramId = await getActivityProgramId(id);
      const allowed = await teacherCanManageProgram(req.user, activityProgramId);
      if (!allowed) {
        return res.status(403).json({ error: 'Access denied for this activity/program' });
      }
    }

    const { teacher_id, room_id, start_time, end_time, is_cancelled, notes } = req.body;

    await database.query(
      `INSERT INTO activity_schedule_overrides
         (schedule_id, occurrence_date, teacher_id, room_id, start_time, end_time, is_cancelled, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         teacher_id   = VALUES(teacher_id),
         room_id      = VALUES(room_id),
         start_time   = VALUES(start_time),
         end_time     = VALUES(end_time),
         is_cancelled = VALUES(is_cancelled),
         notes        = VALUES(notes),
         updated_at   = CURRENT_TIMESTAMP`,
      [
        scheduleId, date,
        teacher_id  ?? null,
        room_id     ?? null,
        start_time  ?? null,
        end_time    ?? null,
        is_cancelled ? 1 : 0,
        notes       ?? null
      ]
    );

    const rows = await database.query(
            `SELECT ov.*, r.name AS room_name, s.name AS site_name,
              CASE WHEN s.name IS NULL THEN r.name ELSE CONCAT(s.name, ' - ', r.name) END AS room_display_name,
              t.first_name AS teacher_first_name, t.last_name AS teacher_last_name
       FROM activity_schedule_overrides ov
       LEFT JOIN rooms    r ON r.id = ov.room_id
             LEFT JOIN sites    s ON s.id = r.site_id
       LEFT JOIN teachers t ON t.id = ov.teacher_id
       WHERE ov.schedule_id = ? AND ov.occurrence_date = ?`,
      [scheduleId, date]
    );
    logger.info(`Upserted override for schedule ${scheduleId} on ${date}`);
    res.json(rows[0]);
  } catch (error) {
    logger.error('Failed to save override', { error: error.message });
    res.status(500).json({ error: 'Failed to save override' });
  }
});

// DELETE /api/activities/:id/schedules/:scheduleId/overrides/:date
// Remove an override — restores the occurrence to rule defaults.
app.delete('/api/activities/:id/schedules/:scheduleId/overrides/:date', authMiddleware, async (req, res) => {
  try {
    const { id, scheduleId, date } = req.params;

    if (!isAdmin(req.user)) {
      const activityProgramId = await getActivityProgramId(id);
      const allowed = await teacherCanManageProgram(req.user, activityProgramId);
      if (!allowed) {
        return res.status(403).json({ error: 'Access denied for this activity/program' });
      }
    }

    const result = await database.query(
      'DELETE FROM activity_schedule_overrides WHERE schedule_id = ? AND occurrence_date = ?',
      [scheduleId, date]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Override not found' });
    logger.info(`Removed override for schedule ${scheduleId} on ${date}`);
    res.json({ message: 'Override removed, occurrence restored to rule default' });
  } catch (error) {
    logger.error('Failed to remove override', { error: error.message });
    res.status(500).json({ error: 'Failed to remove override' });
  }
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function parseJson(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return raw; }
}

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
