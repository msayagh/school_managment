const request = require('supertest');

// Mock the database and logger modules
jest.mock('../../../shared/utils/database');
jest.mock('../../../shared/utils/logger');

const database = require('../../../shared/utils/database');
const app = require('../src/index');

describe('Teachers Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'healthy', service: 'teachers' });
    });
  });

  describe('GET /api/teachers', () => {
    it('should return all teachers', async () => {
      const mockTeachers = [
        { id: 1, first_name: 'John', last_name: 'Doe', email: 'john@example.com', specialization: 'Math' },
        { id: 2, first_name: 'Jane', last_name: 'Smith', email: 'jane@example.com', specialization: 'Science' }
      ];
      
      database.query.mockResolvedValue(mockTeachers);

      const response = await request(app).get('/api/teachers');
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockTeachers);
      expect(database.query).toHaveBeenCalledWith('SELECT * FROM teachers ORDER BY id DESC');
    });

    it('should handle database errors', async () => {
      database.query.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/teachers');
      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/teachers/:id', () => {
    it('should return a teacher by id', async () => {
      const mockTeacher = { id: 1, first_name: 'John', last_name: 'Doe', email: 'john@example.com' };
      database.query.mockResolvedValue([mockTeacher]);

      const response = await request(app).get('/api/teachers/1');
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockTeacher);
    });

    it('should return 404 if teacher not found', async () => {
      database.query.mockResolvedValue([]);

      const response = await request(app).get('/api/teachers/999');
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Teacher not found' });
    });
  });

  describe('POST /api/teachers', () => {
    it('should create a new teacher with valid token', async () => {
      const newTeacher = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '1234567890',
        specialization: 'Math'
      };

      database.query
        .mockResolvedValueOnce({ insertId: 1 })
        .mockResolvedValueOnce([{ id: 1, ...newTeacher }]);

      const response = await request(app)
        .post('/api/teachers')
        .set('Authorization', 'Bearer valid-token')
        .send(newTeacher);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id', 1);
    });

    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/api/teachers')
        .set('Authorization', 'Bearer valid-token')
        .send({ first_name: 'John' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 401 without authorization', async () => {
      const response = await request(app)
        .post('/api/teachers')
        .send({ first_name: 'John', last_name: 'Doe', email: 'john@example.com' });

      expect(response.status).toBe(401);
    });
  });

  describe('PUT /api/teachers/:id', () => {
    it('should update a teacher with valid token', async () => {
      const updatedTeacher = { id: 1, first_name: 'John Updated', last_name: 'Doe', email: 'john@example.com' };
      
      database.query
        .mockResolvedValueOnce([{ id: 1 }]) // Check exists
        .mockResolvedValueOnce({}) // Update
        .mockResolvedValueOnce([updatedTeacher]); // Get updated

      const response = await request(app)
        .put('/api/teachers/1')
        .set('Authorization', 'Bearer valid-token')
        .send({ first_name: 'John Updated' });

      expect(response.status).toBe(200);
      expect(response.body.first_name).toBe('John Updated');
    });

    it('should return 404 if teacher not found', async () => {
      database.query.mockResolvedValue([]);

      const response = await request(app)
        .put('/api/teachers/999')
        .set('Authorization', 'Bearer valid-token')
        .send({ first_name: 'John' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/teachers/:id', () => {
    it('should delete a teacher with valid token', async () => {
      database.query
        .mockResolvedValueOnce([{ id: 1 }]) // Check exists
        .mockResolvedValueOnce({}); // Delete

      const response = await request(app)
        .delete('/api/teachers/1')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 404 if teacher not found', async () => {
      database.query.mockResolvedValue([]);

      const response = await request(app)
        .delete('/api/teachers/999')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/teachers/:id/schedule', () => {
    it('should return teacher schedule', async () => {
      database.query
        .mockResolvedValueOnce([{ id: 1, first_name: 'John', last_name: 'Doe' }]) // Teacher exists
        .mockResolvedValueOnce([{ id: 1, name: 'Math', schedule: 'Mon/Wed 9-11am' }]); // Activities

      const response = await request(app).get('/api/teachers/1/schedule');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('teacher_id', 1);
      expect(response.body).toHaveProperty('schedule');
    });

    it('should return 404 if teacher not found', async () => {
      database.query.mockResolvedValue([]);

      const response = await request(app).get('/api/teachers/999/schedule');
      expect(response.status).toBe(404);
    });
  });
});
