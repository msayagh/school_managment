const request = require('supertest');

// Mock the database and logger modules
jest.mock('../../../shared/utils/database');
jest.mock('../../../shared/utils/logger');

const database = require('../../../shared/utils/database');
const app = require('../src/index');

describe('Activities Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'healthy', service: 'activities' });
    });
  });

  describe('GET /api/activities', () => {
    it('should return all activities', async () => {
      const mockActivities = [
        { id: 1, name: 'Math Club', capacity: 20 },
        { id: 2, name: 'Science Fair', capacity: 30 }
      ];
      
      database.query.mockResolvedValue(mockActivities);

      const response = await request(app).get('/api/activities');
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockActivities);
    });
  });

  describe('POST /api/activities', () => {
    it('should create a new activity with valid token', async () => {
      const newActivity = {
        name: 'Math Club',
        capacity: 20,
        description: 'Weekly math sessions'
      };

      database.query
        .mockResolvedValueOnce({ insertId: 1 })
        .mockResolvedValueOnce([{ id: 1, ...newActivity }]);

      const response = await request(app)
        .post('/api/activities')
        .set('Authorization', 'Bearer valid-token')
        .send(newActivity);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id', 1);
    });

    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/api/activities')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Math Club' });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/activities/:id/enroll', () => {
    it('should enroll a student in activity', async () => {
      database.query
        .mockResolvedValueOnce([{ id: 1, capacity: 20 }]) // Check activity exists
        .mockResolvedValueOnce([{ id: 1 }]) // Check student exists
        .mockResolvedValueOnce([{ count: 10 }]) // Check capacity
        .mockResolvedValueOnce({ insertId: 1 }); // Enroll

      const response = await request(app)
        .post('/api/activities/1/enroll')
        .set('Authorization', 'Bearer valid-token')
        .send({ student_id: 1 });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 400 if activity is at full capacity', async () => {
      database.query
        .mockResolvedValueOnce([{ id: 1, capacity: 20 }])
        .mockResolvedValueOnce([{ id: 1 }])
        .mockResolvedValueOnce([{ count: 20 }]);

      const response = await request(app)
        .post('/api/activities/1/enroll')
        .set('Authorization', 'Bearer valid-token')
        .send({ student_id: 1 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('capacity');
    });
  });

  describe('DELETE /api/activities/:id/enroll/:studentId', () => {
    it('should unenroll a student from activity', async () => {
      database.query
        .mockResolvedValueOnce([{ id: 1 }]) // Check enrollment exists
        .mockResolvedValueOnce({}); // Delete

      const response = await request(app)
        .delete('/api/activities/1/enroll/1')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('GET /api/activities/:id/participants', () => {
    it('should return activity participants', async () => {
      const mockParticipants = [
        { id: 1, first_name: 'John', last_name: 'Doe' }
      ];
      
      database.query
        .mockResolvedValueOnce([{ id: 1 }]) // Check activity exists
        .mockResolvedValueOnce(mockParticipants); // Get participants

      const response = await request(app).get('/api/activities/1/participants');
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockParticipants);
    });
  });

  describe('PUT /api/activities/:id/teacher', () => {
    it('should assign teacher to activity', async () => {
      const updatedActivity = { id: 1, name: 'Math Club', teacher_id: 1 };
      
      database.query
        .mockResolvedValueOnce([{ id: 1 }]) // Check activity exists
        .mockResolvedValueOnce([{ id: 1 }]) // Check teacher exists
        .mockResolvedValueOnce({}) // Update
        .mockResolvedValueOnce([updatedActivity]); // Get updated

      const response = await request(app)
        .put('/api/activities/1/teacher')
        .set('Authorization', 'Bearer valid-token')
        .send({ teacher_id: 1 });

      expect(response.status).toBe(200);
      expect(response.body.teacher_id).toBe(1);
    });
  });
});
