import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { makeZipBuffer } from './helpers/zip.js';

let tempDir;
let app;
let paths;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibekids-app-'));
  paths = {
    baseDir: tempDir,
    publicDir: path.join(tempDir, 'public'),
    dataDir: path.join(tempDir, 'data'),
    uploadsDir: path.join(tempDir, 'uploads'),
    projectsDir: path.join(tempDir, 'projects'),
    tempDir: path.join(tempDir, '.tmp'),
    projectIndexPath: path.join(tempDir, 'data', 'projects.json')
  };

  await Promise.all([
    fs.mkdir(paths.publicDir, { recursive: true }),
    fs.mkdir(paths.dataDir, { recursive: true }),
    fs.mkdir(paths.uploadsDir, { recursive: true }),
    fs.mkdir(paths.projectsDir, { recursive: true })
  ]);

  app = createApp({
    paths
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

  it('allows project uploads from the same browser origin', async () => {
    const zip = makeZipBuffer({ 'index.html': '<h1>Hello</h1>' });

    const response = await request(app)
      .post('/api/projects')
      .set('Host', 'vibekids.localhost')
      .set('Origin', 'http://vibekids.localhost')
      .field('title', 'Same Origin')
      .attach('project', zip, 'same-origin.zip');

    expect(response.status).toBe(201);
    expect(response.body.project.slug).toBe('same-origin');
  });

  it('allows project uploads with no origin header for local tooling', async () => {
    const zip = makeZipBuffer({ 'index.html': '<h1>Hello</h1>' });

    const response = await request(app)
      .post('/api/projects')
      .field('title', 'No Origin')
      .attach('project', zip, 'no-origin.zip');

    expect(response.status).toBe(201);
    expect(response.body.project.slug).toBe('no-origin');
  });

  it('rejects project uploads from null browser origins before reading the file', async () => {
    const zip = makeZipBuffer({ 'index.html': '<h1>Hello</h1>' });

    const response = await request(app)
      .post('/api/projects')
      .set('Origin', 'null')
      .field('title', 'Null Origin')
      .attach('project', zip, 'null-origin.zip');

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Uploads must come from the Vibe Kids admin page');
  });

  it('rejects project uploads from cross-origin browser requests', async () => {
    const zip = makeZipBuffer({ 'index.html': '<h1>Hello</h1>' });

    const response = await request(app)
      .post('/api/projects')
      .set('Host', 'vibekids.localhost')
      .set('Origin', 'http://evil.localhost')
      .field('title', 'Cross Origin')
      .attach('project', zip, 'cross-origin.zip');

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Uploads must come from the Vibe Kids admin page');
  });

  it('allows same-origin uploads behind a reverse proxy', async () => {
    const zip = makeZipBuffer({ 'index.html': '<h1>Hello</h1>' });

    const response = await request(app)
      .post('/api/projects')
      .set('Host', '127.0.0.1:4321')
      .set('X-Forwarded-Host', 'vibekids.localhost')
      .set('X-Forwarded-Proto', 'https')
      .set('Origin', 'https://vibekids.localhost')
      .field('title', 'Proxy Origin')
      .attach('project', zip, 'proxy-origin.zip');

    expect(response.status).toBe(201);
    expect(response.body.project.slug).toBe('proxy-origin');
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

  it('returns a clear error when a project file is missing', async () => {
    const response = await request(app)
      .post('/api/projects')
      .field('title', 'Missing file');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Upload must be a .zip file');
  });

  it('returns a clear error when a project zip is too large', async () => {
    const limitedApp = createApp({
      paths,
      uploadFileSizeLimit: 10
    });

    const response = await request(limitedApp)
      .post('/api/projects')
      .field('title', 'Too large')
      .attach('project', Buffer.alloc(11, 'a'), 'too-large.zip');

    expect(response.status).toBe(413);
    expect(response.body.error).toBe('Project zip must be 50 MB or smaller');
  });

  it('serves the runner shell from the configured public directory', async () => {
    await fs.writeFile(path.join(paths.publicDir, 'runner.html'), '<!doctype html><h1>Runner</h1>');

    const response = await request(app).get('/runner/hello-project');

    expect(response.status).toBe(200);
    expect(response.text).toContain('<h1>Runner</h1>');
  });

  it('serves project files from the configured projects directory', async () => {
    await fs.mkdir(path.join(paths.projectsDir, 'hello-project'), { recursive: true });
    await fs.writeFile(path.join(paths.projectsDir, 'hello-project', 'index.html'), '<h1>Hello</h1>');

    const response = await request(app).get('/projects/hello-project/index.html');

    expect(response.status).toBe(200);
    expect(response.text).toContain('<h1>Hello</h1>');
  });

  it('serves upload files from the configured uploads directory', async () => {
    await fs.writeFile(path.join(paths.uploadsDir, 'hello-project.zip'), 'zip archive');

    const response = await request(app).get('/uploads/hello-project.zip');

    expect(response.status).toBe(200);
    expect(response.text).toBe('zip archive');
  });
});
