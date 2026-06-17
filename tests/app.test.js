import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { makeZipBuffer } from './helpers/zip.js';

let tempDir;
let app;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibekids-app-'));
  app = createApp({
    paths: {
      baseDir: tempDir,
      publicDir: path.join(process.cwd(), 'public'),
      dataDir: path.join(tempDir, 'data'),
      uploadsDir: path.join(tempDir, 'uploads'),
      projectsDir: path.join(tempDir, 'projects'),
      tempDir: path.join(tempDir, '.tmp'),
      projectIndexPath: path.join(tempDir, 'data', 'projects.json')
    }
  });
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('app', () => {
  it('serves the health endpoint', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, name: 'vibekids' });
  });

  it('lists projects', async () => {
    const response = await request(app).get('/api/projects');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ projects: [] });
  });

  it('uploads a project and returns it', async () => {
    const zip = makeZipBuffer({ 'index.html': '<h1>Hello</h1>' });

    const upload = await request(app)
      .post('/api/projects')
      .field('title', 'Hello Project')
      .field('description', 'First upload')
      .attach('project', zip, 'hello-project.zip');

    expect(upload.status).toBe(201);
    expect(upload.body.project).toMatchObject({
      slug: 'hello-project',
      title: 'Hello Project',
      description: 'First upload'
    });

    const list = await request(app).get('/api/projects');
    expect(list.body.projects).toHaveLength(1);
  });

  it('returns a clear error for an invalid project zip', async () => {
    const zip = makeZipBuffer({ 'readme.txt': 'missing index' });

    const response = await request(app)
      .post('/api/projects')
      .field('title', 'Broken')
      .attach('project', zip, 'broken.zip');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Upload must include an index.html file');
  });
});
