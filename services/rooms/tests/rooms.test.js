const request = require('supertest');

// Mock the database and logger modules
jest.mock('../../../shared/utils/database');
jest.mock('../../../shared/utils/logger');

const database = require('../../../shared/utils/database');
const app = require('../src/index');

describe('Rooms Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'healthy', service: 'rooms' });
    });
  });

  describe('GET /api/rooms', () => {
    it('should return all rooms', async () => {
      const mockRooms = [
        { id: 1, name: 'Room 101', capacity: 30, room_type: 'classroom' },
        { id: 2, name: 'Lab A', capacity: 20, room_type: 'lab' }
      ];
      
      database.query.mockResolvedValue(mockRooms);

      const response = await request(app).get('/api/rooms');
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockRooms);
    });
  });

  describe('POST /api/rooms', () => {
    it('should create a new room with valid token', async () => {
      const newRoom = {
        name: 'Room 101',
        capacity: 30,
        room_type: 'classroom'
      };

      database.query
        .mockResolvedValueOnce({ insertId: 1 })
        .mockResolvedValueOnce([{ id: 1, ...newRoom }]);

      const response = await request(app)
        .post('/api/rooms')
        .set('Authorization', 'Bearer valid-token')
        .send(newRoom);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id', 1);
    });

    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/api/rooms')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Room 101' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/rooms/:id/availability', () => {
    it('should return room availability without time range', async () => {
      database.query.mockResolvedValue([{ id: 1, name: 'Room 101', status: 'available' }]);

      const response = await request(app).get('/api/rooms/1/availability');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('available', true);
    });

    it('should check for conflicts with time range', async () => {
      database.query
        .mockResolvedValueOnce([{ id: 1, name: 'Room 101', status: 'available' }])
        .mockResolvedValueOnce([]); // No conflicts

      const response = await request(app)
        .get('/api/rooms/1/availability')
        .query({ start_time: '2024-01-01 10:00:00', end_time: '2024-01-01 11:00:00' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('available', true);
      expect(response.body).toHaveProperty('conflicts', 0);
    });

    it('should detect conflicts', async () => {
      database.query
        .mockResolvedValueOnce([{ id: 1, name: 'Room 101', status: 'available' }])
        .mockResolvedValueOnce([{ id: 1, room_id: 1 }]); // Has conflict

      const response = await request(app)
        .get('/api/rooms/1/availability')
        .query({ start_time: '2024-01-01 10:00:00', end_time: '2024-01-01 11:00:00' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('available', false);
      expect(response.body).toHaveProperty('conflicts', 1);
    });
  });

  describe('GET /api/rooms/available', () => {
    it('should return available rooms without filters', async () => {
      const mockRooms = [
        { id: 1, name: 'Room 101', status: 'available' }
      ];
      
      database.query.mockResolvedValue(mockRooms);

      const response = await request(app).get('/api/rooms/available');
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockRooms);
    });

    it('should filter by capacity and room type', async () => {
      const mockRooms = [
        { id: 1, name: 'Room 101', capacity: 30, room_type: 'classroom', status: 'available' }
      ];
      
      database.query.mockResolvedValue(mockRooms);

      const response = await request(app)
        .get('/api/rooms/available')
        .query({ capacity: 25, room_type: 'classroom' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockRooms);
    });
  });

  describe('PUT /api/rooms/:id', () => {
    it('should update a room with valid token', async () => {
      const updatedRoom = { id: 1, name: 'Room 101 Updated', capacity: 30 };
      
      database.query
        .mockResolvedValueOnce([{ id: 1 }]) // Check exists
        .mockResolvedValueOnce({}) // Update
        .mockResolvedValueOnce([updatedRoom]); // Get updated

      const response = await request(app)
        .put('/api/rooms/1')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Room 101 Updated' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Room 101 Updated');
    });
  });

  describe('DELETE /api/rooms/:id', () => {
    it('should delete a room with valid token', async () => {
      database.query
        .mockResolvedValueOnce([{ id: 1 }]) // Check exists
        .mockResolvedValueOnce({}); // Delete

      const response = await request(app)
        .delete('/api/rooms/1')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });
  });
});
