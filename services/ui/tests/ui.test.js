const request = require('supertest');
const app = require('../src/server');

describe('UI Service', () => {
  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'healthy', service: 'ui' });
    });
  });

  describe('GET /', () => {
    it('should serve the main HTML page', async () => {
      const response = await request(app).get('/');
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/html/);
      expect(response.text).toContain('School Management System');
    });
  });

  describe('GET /unknown', () => {
    it('should serve the main HTML page for unknown routes (SPA)', async () => {
      const response = await request(app).get('/some/unknown/route');
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/html/);
    });
  });
});
