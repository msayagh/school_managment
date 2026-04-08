const express = require('express');
const cors = require('cors');
require('dotenv').config();

const database = require('../../../shared/utils/database');
const { authMiddleware, optionalAuthMiddleware } = require('../../../shared/utils/auth');
const { getLogger, requestLogger } = require('../../../shared/utils/logger');

const logger = getLogger('evaluations-service');

const app = express();
const PORT = process.env.SERVICE_PORT || 3008;

app.use(cors());
app.use(express.json());
app.use(requestLogger);

// ─── Health ──────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'evaluations' });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  EVALUATION TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/evaluations/templates
app.get('/api/evaluations/templates', optionalAuthMiddleware, async (req, res) => {
  try {
    const templates = await database.query(
      'SELECT * FROM evaluation_templates ORDER BY id DESC'
    );
    res.json(templates.map(parseCriteria));
  } catch (error) {
    logger.error('Failed to get templates', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve templates' });
  }
});

// GET /api/evaluations/templates/:id
app.get('/api/evaluations/templates/:id', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await database.query(
      'SELECT * FROM evaluation_templates WHERE id = ?', [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(parseCriteria(rows[0]));
  } catch (error) {
    logger.error('Failed to get template', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve template' });
  }
});

// POST /api/evaluations/templates
app.post('/api/evaluations/templates', authMiddleware, async (req, res) => {
  try {
    const { name, description, criteria } = req.body;

    if (!name || !criteria || !Array.isArray(criteria) || criteria.length === 0) {
      return res.status(400).json({ error: 'name and criteria (non-empty array) are required' });
    }

    // Validate criteria items
    const validTypes = ['score', 'grade', 'pass_fail', 'comment'];
    for (const c of criteria) {
      if (!c.name || !validTypes.includes(c.type)) {
        return res.status(400).json({
          error: `Each criterion needs a name and type (${validTypes.join('|')})`
        });
      }
    }

    const result = await database.query(
      `INSERT INTO evaluation_templates (name, description, criteria, created_by)
       VALUES (?, ?, ?, ?)`,
      [name, description ?? null, JSON.stringify(criteria), req.user?.id ?? null]
    );

    const created = await database.query(
      'SELECT * FROM evaluation_templates WHERE id = ?', [result.insertId]
    );
    logger.info(`Created evaluation template ${result.insertId}`, { name });
    res.status(201).json(parseCriteria(created[0]));
  } catch (error) {
    logger.error('Failed to create template', { error: error.message });
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// PUT /api/evaluations/templates/:id
app.put('/api/evaluations/templates/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, criteria } = req.body;

    const existing = await database.query(
      'SELECT id FROM evaluation_templates WHERE id = ?', [id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const updates = [];
    const values  = [];

    if (name        !== undefined) { updates.push('name = ?');        values.push(name); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (criteria    !== undefined) {
      if (!Array.isArray(criteria) || criteria.length === 0) {
        return res.status(400).json({ error: 'criteria must be a non-empty array' });
      }
      updates.push('criteria = ?');
      values.push(JSON.stringify(criteria));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    await database.query(`UPDATE evaluation_templates SET ${updates.join(', ')} WHERE id = ?`, values);

    const updated = await database.query(
      'SELECT * FROM evaluation_templates WHERE id = ?', [id]
    );
    res.json(parseCriteria(updated[0]));
  } catch (error) {
    logger.error('Failed to update template', { error: error.message });
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// DELETE /api/evaluations/templates/:id
app.delete('/api/evaluations/templates/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await database.query(
      'SELECT id FROM evaluation_templates WHERE id = ?', [id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    await database.query('DELETE FROM evaluation_templates WHERE id = ?', [id]);
    logger.info(`Deleted evaluation template ${id}`);
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete template', { error: error.message });
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  TEMPLATE ASSIGNMENTS  (link templates to programs / activities)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/evaluations/assignments?program_id=X&activity_id=Y
app.get('/api/evaluations/assignments', optionalAuthMiddleware, async (req, res) => {
  try {
    const { program_id, activity_id } = req.query;

    let query = `
      SELECT pet.*, et.name AS template_name, et.description AS template_description, et.criteria
      FROM program_evaluation_templates pet
      JOIN evaluation_templates et ON et.id = pet.evaluation_template_id
      WHERE 1=1
    `;
    const params = [];

    if (program_id)  { query += ' AND pet.program_id = ?';  params.push(program_id); }
    if (activity_id) { query += ' AND pet.activity_id = ?'; params.push(activity_id); }

    const rows = await database.query(query, params);
    res.json(rows.map(r => ({ ...r, criteria: parseJson(r.criteria) })));
  } catch (error) {
    logger.error('Failed to get assignments', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve template assignments' });
  }
});

// POST /api/evaluations/assignments
app.post('/api/evaluations/assignments', authMiddleware, async (req, res) => {
  try {
    const { evaluation_template_id, program_id, activity_id } = req.body;

    if (!evaluation_template_id) {
      return res.status(400).json({ error: 'evaluation_template_id is required' });
    }
    if (!program_id && !activity_id) {
      return res.status(400).json({ error: 'Either program_id or activity_id must be provided' });
    }

    const tpl = await database.query(
      'SELECT id FROM evaluation_templates WHERE id = ?', [evaluation_template_id]
    );
    if (tpl.length === 0) {
      return res.status(404).json({ error: 'Evaluation template not found' });
    }

    const result = await database.query(
      `INSERT INTO program_evaluation_templates (program_id, activity_id, evaluation_template_id)
       VALUES (?, ?, ?)`,
      [program_id ?? null, activity_id ?? null, evaluation_template_id]
    );

    logger.info(`Assigned template ${evaluation_template_id} to program=${program_id}, activity=${activity_id}`);
    res.status(201).json({ id: result.insertId, message: 'Template assigned successfully' });
  } catch (error) {
    logger.error('Failed to assign template', { error: error.message });
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Template already assigned to this program/activity' });
    }
    res.status(500).json({ error: 'Failed to assign template' });
  }
});

// DELETE /api/evaluations/assignments/:id
app.delete('/api/evaluations/assignments/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await database.query(
      'DELETE FROM program_evaluation_templates WHERE id = ?', [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    res.json({ message: 'Assignment removed successfully' });
  } catch (error) {
    logger.error('Failed to remove assignment', { error: error.message });
    res.status(500).json({ error: 'Failed to remove assignment' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  EVALUATIONS  (actual student assessments)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/evaluations
// Supports filters: student_id, program_id, activity_id, instructor_id
// parent_view=true limits results to parent_visible=1 only
app.get('/api/evaluations', optionalAuthMiddleware, async (req, res) => {
  try {
    const { student_id, program_id, activity_id, instructor_id, parent_view } = req.query;

    let query = `
      SELECT
        e.*,
        et.name AS template_name, et.criteria,
        s.first_name AS student_first_name, s.last_name AS student_last_name,
        t.first_name AS instructor_first_name, t.last_name AS instructor_last_name
      FROM evaluations e
      JOIN evaluation_templates et ON et.id = e.evaluation_template_id
      JOIN students  s ON s.id = e.student_id
      JOIN teachers  t ON t.id = e.instructor_id
      WHERE 1=1
    `;
    const params = [];

    if (student_id)    { query += ' AND e.student_id = ?';    params.push(student_id); }
    if (program_id)    { query += ' AND e.program_id = ?';    params.push(program_id); }
    if (activity_id)   { query += ' AND e.activity_id = ?';   params.push(activity_id); }
    if (instructor_id) { query += ' AND e.instructor_id = ?'; params.push(instructor_id); }
    if (parent_view === 'true') {
      query += ' AND e.parent_visible = 1';
    }

    query += ' ORDER BY e.created_at DESC';

    const rows = await database.query(query, params);
    res.json(rows.map(r => ({
      ...r,
      criteria: parseJson(r.criteria),
      scores:   parseJson(r.scores)
    })));
  } catch (error) {
    logger.error('Failed to get evaluations', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve evaluations' });
  }
});

// GET /api/evaluations/:id
app.get('/api/evaluations/:id', optionalAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const rows = await database.query(
      `SELECT
         e.*,
         et.name AS template_name, et.criteria,
         s.first_name AS student_first_name, s.last_name AS student_last_name,
         t.first_name AS instructor_first_name, t.last_name AS instructor_last_name
       FROM evaluations e
       JOIN evaluation_templates et ON et.id = e.evaluation_template_id
       JOIN students  s ON s.id = e.student_id
       JOIN teachers  t ON t.id = e.instructor_id
       WHERE e.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Evaluation not found' });
    }

    const row = rows[0];
    res.json({ ...row, criteria: parseJson(row.criteria), scores: parseJson(row.scores) });
  } catch (error) {
    logger.error('Failed to get evaluation', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve evaluation' });
  }
});

// POST /api/evaluations  – create an evaluation (instructor action)
app.post('/api/evaluations', authMiddleware, async (req, res) => {
  try {
    const {
      evaluation_template_id,
      program_id,
      activity_id,
      student_id,
      instructor_id,
      scores,
      instructor_comments,
      parent_visible
    } = req.body;

    if (!evaluation_template_id || !student_id || !instructor_id) {
      return res.status(400).json({
        error: 'evaluation_template_id, student_id, and instructor_id are required'
      });
    }

    // Validate template exists
    const tpl = await database.query(
      'SELECT * FROM evaluation_templates WHERE id = ?', [evaluation_template_id]
    );
    if (tpl.length === 0) {
      return res.status(404).json({ error: 'Evaluation template not found' });
    }

    // Validate student exists
    const student = await database.query('SELECT id FROM students WHERE id = ?', [student_id]);
    if (student.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Validate instructor (teacher) exists
    const instructor = await database.query('SELECT id FROM teachers WHERE id = ?', [instructor_id]);
    if (instructor.length === 0) {
      return res.status(404).json({ error: 'Instructor not found' });
    }

    const result = await database.query(
      `INSERT INTO evaluations
         (evaluation_template_id, program_id, activity_id, student_id, instructor_id,
          scores, instructor_comments, parent_visible)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        evaluation_template_id,
        program_id           ?? null,
        activity_id          ?? null,
        student_id,
        instructor_id,
        scores               ? JSON.stringify(scores) : null,
        instructor_comments  ?? null,
        parent_visible !== undefined ? (parent_visible ? 1 : 0) : 1
      ]
    );

    const created = await database.query('SELECT * FROM evaluations WHERE id = ?', [result.insertId]);
    logger.info(`Created evaluation ${result.insertId} for student ${student_id}`);
    res.status(201).json({ ...created[0], scores: parseJson(created[0].scores) });
  } catch (error) {
    logger.error('Failed to create evaluation', { error: error.message });
    res.status(500).json({ error: 'Failed to create evaluation' });
  }
});

// PUT /api/evaluations/:id  – update scores / comments (instructor only)
app.put('/api/evaluations/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { scores, instructor_comments, parent_visible } = req.body;

    const existing = await database.query('SELECT * FROM evaluations WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Evaluation not found' });
    }

    const updates = [];
    const values  = [];

    if (scores              !== undefined) { updates.push('scores = ?');              values.push(JSON.stringify(scores)); }
    if (instructor_comments !== undefined) { updates.push('instructor_comments = ?'); values.push(instructor_comments); }
    if (parent_visible      !== undefined) { updates.push('parent_visible = ?');      values.push(parent_visible ? 1 : 0); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    await database.query(`UPDATE evaluations SET ${updates.join(', ')} WHERE id = ?`, values);

    const updated = await database.query('SELECT * FROM evaluations WHERE id = ?', [id]);
    logger.info(`Updated evaluation ${id}`);
    res.json({ ...updated[0], scores: parseJson(updated[0].scores) });
  } catch (error) {
    logger.error('Failed to update evaluation', { error: error.message });
    res.status(500).json({ error: 'Failed to update evaluation' });
  }
});

// DELETE /api/evaluations/:id
app.delete('/api/evaluations/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await database.query('SELECT id FROM evaluations WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Evaluation not found' });
    }

    await database.query('DELETE FROM evaluations WHERE id = ?', [id]);
    logger.info(`Deleted evaluation ${id}`);
    res.json({ message: 'Evaluation deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete evaluation', { error: error.message });
    res.status(500).json({ error: 'Failed to delete evaluation' });
  }
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function parseJson(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object') return raw; // already parsed by mysql2
  try { return JSON.parse(raw); } catch { return raw; }
}

function parseCriteria(row) {
  return { ...row, criteria: parseJson(row.criteria) };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Start server
// ═══════════════════════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  logger.info(`Evaluations service running on port ${PORT}`);
});

module.exports = app;
