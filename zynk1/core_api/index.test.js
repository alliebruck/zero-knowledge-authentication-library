import request from 'supertest';
import { app, server } from './index.js';

describe('API Endpoints', () => {
  afterAll((done) => {
    server.close(done);
  });

  it('should return Hello World for GET /', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.text).toBe('Hello World!');
  });
});
