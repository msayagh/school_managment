const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { query: dbQuery, initializePool } = require('../../../shared/utils/database');
const { getLogger } = require('../../../shared/utils/logger');

const logger = getLogger('auth-service');
const app = express();
const PORT = process.env.PORT || 3007;
const JWT_SECRET = process.env.JWT_SECRET || 'school-management-secret-key-change-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'auth' });
});

// Login endpoint
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const users = await dbQuery(
      'SELECT * FROM users WHERE (username = ? OR email = ?) AND status = "active"',
      [username, username]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    let userData = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    };

    if (user.role === 'teacher' && user.related_id) {
      const teachers = await dbQuery(
        'SELECT id, first_name, last_name, email, phone, specialization FROM teachers WHERE id = ?',
        [user.related_id]
      );
      if (teachers.length > 0) {
        userData.teacher = teachers[0];
      }
    } else if (user.role === 'student' && user.related_id) {
      const students = await dbQuery(
        'SELECT id, first_name, last_name, email, phone, enrollment_date FROM students WHERE id = ?',
        [user.related_id]
      );
      if (students.length > 0) {
        userData.student = students[0];
      }
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role, relatedId: user.related_id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    logger.info(`User logged in: ${username} (${user.role})`);
    res.json({ token, user: userData });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify token
app.post('/verify', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const users = await dbQuery(
      'SELECT id, username, email, role, related_id, status FROM users WHERE id = ? AND status = "active"',
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    res.json({ valid: true, user: users[0] });

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Change password
app.post('/change-password', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const { currentPassword, newPassword } = req.body;

  if (!token) return res.status(401).json({ error: 'No token provided' });
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new passwords are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const users = await dbQuery(
      'SELECT * FROM users WHERE id = ? AND status = "active"',
      [decoded.userId]
    );

    if (users.length === 0) return res.status(401).json({ error: 'User not found' });

    const user = users[0];
    const passwordValid = await bcrypt.compare(currentPassword, user.password_hash);
    
    if (!passwordValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await dbQuery(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newPasswordHash, user.id]
    );

    logger.info(`Password changed for user: ${user.username}`);
    res.json({ message: 'Password changed successfully' });

  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Create user
app.post('/users', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const { username, email, password, role, relatedId } = req.body;

  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    if (!username || !email || !password || !role) {
      return res.status(400).json({ error: 'Username, email, password, and role are required' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await dbQuery(
      'INSERT INTO users (username, email, password_hash, role, related_id, status) VALUES (?, ?, ?, ?, ?, "active")',
      [username, email, passwordHash, role, relatedId || null]
    );

    logger.info(`User created by admin: ${username} (${role})`);
    res.status(201).json({ id: result.insertId, username, email, role });

  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    logger.error('Create user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Get all users
app.get('/users', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    const users = await dbQuery(
      'SELECT id, username, email, role, related_id, status, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(users);

  } catch (error) {
    logger.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check username availability
app.get('/check-username/:username', async (req, res) => {
  const { username } = req.params;
  
  if (!username || username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    return res.status(400).json({ error: 'Username can only contain letters, numbers, dots, underscores, and hyphens' });
  }
  
  try {
    const existing = await dbQuery('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [username]);
    res.json({ available: existing.length === 0, username });
  } catch (error) {
    logger.error('Username check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Student self-registration
app.post('/register/student', async (req, res) => {
  const { firstName, lastName, email, phone, address, password, username } = req.body;

  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({ error: 'First name, last name, email, and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (username) {
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, dots, underscores, and hyphens' });
    }
  }

  try {
    const existingUsers = await dbQuery('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    
    if (username) {
      const existingUsername = await dbQuery('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [username]);
      if (existingUsername.length > 0) {
        return res.status(409).json({ error: 'Username already taken' });
      }
    }

    const studentResult = await dbQuery(
      'INSERT INTO students (first_name, last_name, email, phone, address, status) VALUES (?, ?, ?, ?, ?, "active")',
      [firstName, lastName, email, phone || null, address || null]
    );

    const studentId = studentResult.insertId;
    const generatedUsername = username || `${firstName.toLowerCase()}.${lastName.toLowerCase()}${studentId}`;
    const passwordHash = await bcrypt.hash(password, 10);

    await dbQuery(
      'INSERT INTO users (username, email, password_hash, role, related_id, status) VALUES (?, ?, ?, "student", ?, "active")',
      [generatedUsername, email, passwordHash, studentId]
    );

    logger.info(`Student self-registered: ${email}`);

    const token = jwt.sign(
      { userId: studentId, username: generatedUsername, role: 'student', relatedId: studentId },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: {
        id: studentId,
        username: generatedUsername,
        email,
        role: 'student',
        student: {
          id: studentId,
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          address,
          enrollment_date: new Date().toISOString().split('T')[0]
        }
      }
    });

  } catch (error) {
    logger.error('Student registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Initialize and start server
async function startServer() {
  try {
    await initializePool();
    logger.info('Database connection pool initialized');
    
    app.listen(PORT, () => {
      logger.info(`Auth service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

startServer();

module.exports = app;
