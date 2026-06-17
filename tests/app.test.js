import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';

describe('app', () => {
  it('serves the health endpoint', async () => {
    const app = createApp();

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, name: 'vibekids' });
  });
});
