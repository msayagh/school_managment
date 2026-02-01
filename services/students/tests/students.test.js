const request = require('supertest');

// Mock the database and logger modules
jest.mock('../../../shared/utils/database');
jest.mock('../../../shared/utils/logger');

const database = require('../../../shared/utils/database');
const app = require('../src/index');

describe('Students Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'healthy', service: 'students' });
    });
  });

  describe('GET /api/students', () => {
    it('should return all students', async () => {
      const mockStudents = [
        { id: 1, first_name: 'John', last_name: 'Doe', email: 'john@example.com' },
        { id: 2, first_name: 'Jane', last_name: 'Smith', email: 'jane@example.com' }
      ];
      
      database.query.mockResolvedValue(mockStudents);

      const response = await request(app).get('/api/students');
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockStudents);
      expect(database.query).toHaveBeenCalledWith('SELECT * FROM students ORDER BY id DESC');
    });

    it('should handle database errors', async () => {
      database.query.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/students');
      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/students/:id', () => {
    it('should return a student by id', async () => {
      const mockStudent = { id: 1, first_name: 'John', last_name: 'Doe', email: 'john@example.com' };
      database.query.mockResolvedValue([mockStudent]);

      const response = await request(app).get('/api/students/1');
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockStudent);
    });

    it('should return 404 if student not found', async () => {
      database.query.mockResolvedValue([]);

      const response = await request(app).get('/api/students/999');
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Student not found' });
    });
  });

  describe('POST /api/students', () => {
    it('should create a new student with valid token', async () => {
      const newStudent = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '1234567890'
      };

      database.query
        .mockResolvedValueOnce({ insertId: 1 })
        .mockResolvedValueOnce([{ id: 1, ...newStudent }]);

      const response = await request(app)
        .post('/api/students')
        .set('Authorization', 'Bearer valid-token')
        .send(newStudent);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id', 1);
    });

    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/api/students')
        .set('Authorization', 'Bearer valid-token')
        .send({ first_name: 'John' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 401 without authorization', async () => {
      const response = await request(app)
        .post('/api/students')
        .send({ first_name: 'John', last_name: 'Doe', email: 'john@example.com' });

      expect(response.status).toBe(401);
    });
  });

  describe('PUT /api/students/:id', () => {
    it('should update a student with valid token', async () => {
      const updatedStudent = { id: 1, first_name: 'John Updated', last_name: 'Doe', email: 'john@example.com' };
      
      database.query
        .mockResolvedValueOnce([{ id: 1 }]) // Check exists
        .mockResolvedValueOnce({}) // Update
        .mockResolvedValueOnce([updatedStudent]); // Get updated

      const response = await request(app)
        .put('/api/students/1')
        .set('Authorization', 'Bearer valid-token')
        .send({ first_name: 'John Updated' });

      expect(response.status).toBe(200);
      expect(response.body.first_name).toBe('John Updated');
    });

    it('should return 404 if student not found', async () => {
      database.query.mockResolvedValue([]);

      const response = await request(app)
        .put('/api/students/999')
        .set('Authorization', 'Bearer valid-token')
        .send({ first_name: 'John' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/students/:id', () => {
    it('should delete a student with valid token', async () => {
      database.query
        .mockResolvedValueOnce([{ id: 1 }]) // Check exists
        .mockResolvedValueOnce({}); // Delete

      const response = await request(app)
        .delete('/api/students/1')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 404 if student not found', async () => {
      database.query.mockResolvedValue([]);

      const response = await request(app)
        .delete('/api/students/999')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(404);
    });
  });
});
