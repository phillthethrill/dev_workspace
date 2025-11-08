import request from 'supertest';
import express from 'express';
import apiRoutes from '../routes/api';
import { getDatabase } from '../utils/database';

const app = express();
app.use(express.json());
app.use('/api', apiRoutes);

describe('API Routes', () => {
  beforeAll(async () => {
    // Initialize test database
    const db = getDatabase();
    await db.init();
  });

  afterAll(async () => {
    // Clean up
    const db = getDatabase();
    await db.close();
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('ok');
      expect(response.body).toHaveProperty('time');
      expect(response.body).toHaveProperty('db');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('uptime');
    });
  });

  describe('GET /api/upcoming', () => {
    it('should return upcoming content', async () => {
      const response = await request(app).get('/api/upcoming');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/shows', () => {
    it('should return shows list', async () => {
      const response = await request(app).get('/api/shows');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('POST /api/shows/add', () => {
    it('should require TMDB ID', async () => {
      const response = await request(app)
        .post('/api/shows/add')
        .send({ title: 'Test Show' });

      expect(response.status).toBe(400);
    });

    it('should handle invalid TMDB ID', async () => {
      const response = await request(app)
        .post('/api/shows/add')
        .send({ title: 'Test Show', tmdb_id: 99999999 });

      expect(response.status).toBe(404);
    });
  });
});