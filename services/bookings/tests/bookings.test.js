const request = require('supertest');

// Mock the database and logger modules
jest.mock('../../../shared/utils/database');
jest.mock('../../../shared/utils/logger');

const database = require('../../../shared/utils/database');
const app = require('../src/index');

describe('Bookings Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'healthy', service: 'bookings' });
    });
  });

  describe('GET /api/bookings', () => {
    it('should return all bookings', async () => {
      const mockBookings = [
        { id: 1, title: 'Math Class', room_id: 1, start_time: '2024-01-01 10:00:00', end_time: '2024-01-01 11:00:00' },
        { id: 2, title: 'Science Lab', room_id: 2, start_time: '2024-01-01 14:00:00', end_time: '2024-01-01 15:00:00' }
      ];
      
      database.query.mockResolvedValue(mockBookings);

      const response = await request(app).get('/api/bookings');
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockBookings);
    });
  });

  describe('POST /api/bookings', () => {
    it('should create a new booking with valid token', async () => {
      const newBooking = {
        room_id: 1,
        title: 'Math Class',
        start_time: '2024-01-01 10:00:00',
        end_time: '2024-01-01 11:00:00'
      };

      database.query
        .mockResolvedValueOnce([{ id: 1 }]) // Check room exists
        .mockResolvedValueOnce([]) // No conflicts
        .mockResolvedValueOnce({ insertId: 1 }) // Insert
        .mockResolvedValueOnce([{ id: 1, ...newBooking }]); // Get created

      const response = await request(app)
        .post('/api/bookings')
        .set('Authorization', 'Bearer valid-token')
        .send(newBooking);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id', 1);
    });

    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/api/bookings')
        .set('Authorization', 'Bearer valid-token')
        .send({ title: 'Math Class' });

      expect(response.status).toBe(400);
    });

    it('should return 400 if end time is before start time', async () => {
      const response = await request(app)
        .post('/api/bookings')
        .set('Authorization', 'Bearer valid-token')
        .send({
          room_id: 1,
          title: 'Math Class',
          start_time: '2024-01-01 11:00:00',
          end_time: '2024-01-01 10:00:00'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('End time must be after start time');
    });

    it('should return 409 if there is a booking conflict', async () => {
      const newBooking = {
        room_id: 1,
        title: 'Math Class',
        start_time: '2024-01-01 10:00:00',
        end_time: '2024-01-01 11:00:00'
      };

      database.query
        .mockResolvedValueOnce([{ id: 1 }]) // Check room exists
        .mockResolvedValueOnce([{ id: 2, room_id: 1 }]); // Has conflict

      const response = await request(app)
        .post('/api/bookings')
        .set('Authorization', 'Bearer valid-token')
        .send(newBooking);

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('already booked');
    });
  });

  describe('PUT /api/bookings/:id', () => {
    it('should update a booking with valid token', async () => {
      const updatedBooking = { 
        id: 1, 
        title: 'Updated Math Class',
        room_id: 1,
        start_time: '2024-01-01 10:00:00',
        end_time: '2024-01-01 11:00:00'
      };
      
      database.query
        .mockResolvedValueOnce([updatedBooking]) // Check exists
        .mockResolvedValueOnce({}) // Update
        .mockResolvedValueOnce([{ ...updatedBooking, title: 'Updated Math Class' }]); // Get updated

      const response = await request(app)
        .put('/api/bookings/1')
        .set('Authorization', 'Bearer valid-token')
        .send({ title: 'Updated Math Class' });

      expect(response.status).toBe(200);
      expect(response.body.title).toBe('Updated Math Class');
    });

    it('should check for conflicts when updating time', async () => {
      const existingBooking = { 
        id: 1, 
        room_id: 1,
        start_time: '2024-01-01 10:00:00',
        end_time: '2024-01-01 11:00:00'
      };
      
      database.query
        .mockResolvedValueOnce([existingBooking]) // Check exists
        .mockResolvedValueOnce([]) // No conflicts
        .mockResolvedValueOnce({}) // Update
        .mockResolvedValueOnce([{ ...existingBooking, start_time: '2024-01-01 09:00:00', end_time: '2024-01-01 10:00:00' }]); // Get updated

      const response = await request(app)
        .put('/api/bookings/1')
        .set('Authorization', 'Bearer valid-token')
        .send({ start_time: '2024-01-01 09:00:00', end_time: '2024-01-01 10:00:00' });

      expect(response.status).toBe(200);
    });
  });

  describe('DELETE /api/bookings/:id', () => {
    it('should delete a booking with valid token', async () => {
      database.query
        .mockResolvedValueOnce([{ id: 1 }]) // Check exists
        .mockResolvedValueOnce({}); // Delete

      const response = await request(app)
        .delete('/api/bookings/1')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 404 if booking not found', async () => {
      database.query.mockResolvedValueOnce([]);

      const response = await request(app)
        .delete('/api/bookings/999')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/bookings/room/:roomId', () => {
    it('should return bookings for a specific room', async () => {
      const mockBookings = [
        { id: 1, room_id: 1, title: 'Math Class', start_time: '2024-01-01 10:00:00', end_time: '2024-01-01 11:00:00' }
      ];
      
      database.query
        .mockResolvedValueOnce([{ id: 1 }]) // Check room exists
        .mockResolvedValueOnce(mockBookings); // Get bookings

      const response = await request(app).get('/api/bookings/room/1');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('length', 1);
      expect(response.body[0]).toHaveProperty('room_id', 1);
    });

    it('should return 404 if room not found', async () => {
      database.query.mockResolvedValueOnce([]);

      const response = await request(app).get('/api/bookings/room/999');
      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/bookings/conflicts', () => {
    it('should check for booking conflicts', async () => {
      database.query.mockResolvedValueOnce([]);

      const response = await request(app)
        .get('/api/bookings/conflicts')
        .query({
          room_id: 1,
          start_time: '2024-01-01 10:00:00',
          end_time: '2024-01-01 11:00:00'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('has_conflicts', false);
      expect(response.body).toHaveProperty('count', 0);
    });

    it('should return 400 if required parameters missing', async () => {
      const response = await request(app)
        .get('/api/bookings/conflicts')
        .query({ room_id: 1 });

      expect(response.status).toBe(400);
    });

    it('should detect conflicts', async () => {
      const conflicts = [{ id: 1, room_id: 1 }];
      database.query.mockResolvedValueOnce(conflicts);

      const response = await request(app)
        .get('/api/bookings/conflicts')
        .query({
          room_id: 1,
          start_time: '2024-01-01 10:00:00',
          end_time: '2024-01-01 11:00:00'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('has_conflicts', true);
      expect(response.body).toHaveProperty('count', 1);
    });
  });
});
