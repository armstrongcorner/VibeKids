# Vibe Kids Local Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Vibe Kids gallery where the owner can upload `.zip` coding projects and kids/friends can browse cards and run each project in the site.

**Architecture:** Use a lightweight Node/Express app that serves static frontend files, exposes JSON/upload APIs, stores project metadata in `data/projects.json`, and serves extracted projects from `projects/<slug>/`. Caddy reverse proxies local traffic to the Node service.

**Tech Stack:** Node.js ESM, Express, Multer, yauzl, Vitest, Supertest, plain HTML/CSS/JavaScript, Caddy.

---

## File Structure

- Create `package.json`: scripts and dependencies for the Node app and tests.
- Create `server/app.js`: Express app factory, route wiring, static serving, and API endpoints.
- Create `server/index.js`: production server entrypoint.
- Create `server/paths.js`: central runtime path configuration.
- Create `server/projectStore.js`: atomic read/write access for `data/projects.json`.
- Create `server/uploadProject.js`: zip validation, extraction, manifest reading, slug creation, and project record creation.
- Create `public/index.html`: gallery page.
- Create `public/runner.html`: iframe-based project runner page.
- Create `public/admin.html`: upload form page.
- Create `public/assets/styles.css`: Bright Studio visual system.
- Create `public/assets/app.js`: gallery and runner browser logic.
- Create `public/assets/admin.js`: upload form browser logic.
- Create `tests/projectStore.test.js`: project index tests.
- Create `tests/uploadProject.test.js`: zip upload behavior tests.
- Create `tests/app.test.js`: API and static route tests.
- Create `tests/helpers/zip.js`: test zip helper.
- Create `Caddyfile`: local reverse proxy config.
- Modify `.gitignore`: keep runtime data and dependencies out of git.
- Modify `docs/superpowers/specs/2026-06-17-vibekids-design.md` only if implementation uncovers a required design correction.

## Task 1: Project Skeleton And Test Harness

**Files:**
- Create: `package.json`
- Create: `server/paths.js`
- Create: `server/index.js`
- Create: `server/app.js`
- Create: `tests/app.test.js`
- Modify: `.gitignore`

- [ ] **Step 1: Write the failing smoke test**

Create `tests/app.test.js`:

```js
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
```

- [ ] **Step 2: Add package metadata and dependencies**

Create `package.json`:

```json
{
  "name": "vibekids",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch server/index.js",
    "start": "node server/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "express": "^4.19.2",
    "multer": "^1.4.5-lts.1",
    "yauzl": "^3.1.3"
  },
  "devDependencies": {
    "adm-zip": "^0.5.16",
    "supertest": "^7.0.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`

Expected: `package-lock.json` is created and install completes without errors.

- [ ] **Step 4: Create path configuration**

Create `server/paths.js`:

```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

export function createPaths(overrides = {}) {
  const baseDir = overrides.baseDir ?? rootDir;

  return {
    baseDir,
    publicDir: overrides.publicDir ?? path.join(baseDir, 'public'),
    dataDir: overrides.dataDir ?? path.join(baseDir, 'data'),
    uploadsDir: overrides.uploadsDir ?? path.join(baseDir, 'uploads'),
    projectsDir: overrides.projectsDir ?? path.join(baseDir, 'projects'),
    tempDir: overrides.tempDir ?? path.join(baseDir, '.tmp'),
    projectIndexPath:
      overrides.projectIndexPath ?? path.join(baseDir, 'data', 'projects.json')
  };
}
```

- [ ] **Step 5: Create the minimal Express app**

Create `server/app.js`:

```js
import express from 'express';
import { createPaths } from './paths.js';

export function createApp(options = {}) {
  const app = express();
  const paths = createPaths(options.paths);

  app.locals.paths = paths;
  app.use(express.json());
  app.use(express.static(paths.publicDir));

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true, name: 'vibekids' });
  });

  return app;
}
```

Create `server/index.js`:

```js
import { createApp } from './app.js';

const port = Number.parseInt(process.env.PORT ?? '4321', 10);
const app = createApp();

app.listen(port, () => {
  console.log(`Vibe Kids listening on http://localhost:${port}`);
});
```

- [ ] **Step 6: Keep runtime files ignored**

Ensure `.gitignore` contains:

```gitignore
.superpowers/
node_modules/
.DS_Store
dist/
uploads/
projects/
data/
.tmp/
```

- [ ] **Step 7: Run the smoke test**

Run: `npm test -- tests/app.test.js`

Expected: PASS for `serves the health endpoint`.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json server tests .gitignore
git commit -m "chore: scaffold vibekids app"
```

## Task 2: Project Store

**Files:**
- Create: `server/projectStore.js`
- Create: `tests/projectStore.test.js`

- [ ] **Step 1: Write project store tests**

Create `tests/projectStore.test.js`:

```js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listProjects, saveProject } from '../server/projectStore.js';

let tempDir;
let indexPath;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibekids-store-'));
  indexPath = path.join(tempDir, 'data', 'projects.json');
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('projectStore', () => {
  it('returns an empty list when the index does not exist', async () => {
    await expect(listProjects(indexPath)).resolves.toEqual([]);
  });

  it('saves new projects newest first', async () => {
    await saveProject(indexPath, { id: 'one', title: 'One', createdAt: '2026-01-01T00:00:00.000Z' });
    await saveProject(indexPath, { id: 'two', title: 'Two', createdAt: '2026-01-02T00:00:00.000Z' });

    await expect(listProjects(indexPath)).resolves.toMatchObject([
      { id: 'two', title: 'Two' },
      { id: 'one', title: 'One' }
    ]);
  });

  it('throws a friendly error when the index is corrupt', async () => {
    await fs.mkdir(path.dirname(indexPath), { recursive: true });
    await fs.writeFile(indexPath, '{bad json', 'utf8');

    await expect(listProjects(indexPath)).rejects.toThrow('Project index is unreadable');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/projectStore.test.js`

Expected: FAIL because `server/projectStore.js` does not exist.

- [ ] **Step 3: Implement project store**

Create `server/projectStore.js`:

```js
import fs from 'node:fs/promises';
import path from 'node:path';

export async function listProjects(indexPath) {
  try {
    const raw = await fs.readFile(indexPath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error('Project index must be an array');
    }

    return parsed.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw new Error('Project index is unreadable');
  }
}

export async function saveProject(indexPath, project) {
  const projects = await listProjects(indexPath);
  const nextProjects = [project, ...projects.filter((item) => item.id !== project.id)];
  const directory = path.dirname(indexPath);
  const tempPath = `${indexPath}.tmp`;

  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(tempPath, `${JSON.stringify(nextProjects, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, indexPath);

  return project;
}
```

- [ ] **Step 4: Run project store tests**

Run: `npm test -- tests/projectStore.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/projectStore.js tests/projectStore.test.js
git commit -m "feat: add project store"
```

## Task 3: Zip Upload Processing

**Files:**
- Create: `server/uploadProject.js`
- Create: `tests/helpers/zip.js`
- Create: `tests/uploadProject.test.js`

- [ ] **Step 1: Create the test zip helper**

Create `tests/helpers/zip.js`:

```js
import AdmZip from 'adm-zip';

export function makeZipBuffer(entries) {
  const zip = new AdmZip();

  for (const [entryPath, content] of Object.entries(entries)) {
    zip.addFile(entryPath, Buffer.from(content));
  }

  return zip.toBuffer();
}
```

- [ ] **Step 2: Write upload processing tests**

Create `tests/uploadProject.test.js`:

```js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { processProjectUpload } from '../server/uploadProject.js';
import { listProjects } from '../server/projectStore.js';
import { makeZipBuffer } from './helpers/zip.js';

let tempDir;
let paths;

async function writeUpload(name, entries) {
  const uploadPath = path.join(tempDir, name);
  await fs.writeFile(uploadPath, makeZipBuffer(entries));
  return uploadPath;
}

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibekids-upload-'));
  paths = {
    dataDir: path.join(tempDir, 'data'),
    uploadsDir: path.join(tempDir, 'uploads'),
    projectsDir: path.join(tempDir, 'projects'),
    tempDir: path.join(tempDir, '.tmp'),
    projectIndexPath: path.join(tempDir, 'data', 'projects.json')
  };
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('processProjectUpload', () => {
  it('accepts a zip with root index.html', async () => {
    const uploadPath = await writeUpload('space-game.zip', {
      'index.html': '<h1>Space Game</h1>'
    });

    const project = await processProjectUpload({
      file: { path: uploadPath, originalname: 'space-game.zip' },
      fields: { title: 'Space Game', description: 'A tiny game' },
      paths,
      now: () => new Date('2026-06-17T00:00:00.000Z')
    });

    expect(project).toMatchObject({
      slug: 'space-game',
      title: 'Space Game',
      description: 'A tiny game',
      entryPath: '/projects/space-game/index.html',
      originalZip: '/uploads/space-game.zip'
    });
    await expect(fs.readFile(path.join(paths.projectsDir, 'space-game', 'index.html'), 'utf8')).resolves.toContain('Space Game');
    await expect(listProjects(paths.projectIndexPath)).resolves.toHaveLength(1);
  });

  it('accepts a zip with one top-level folder', async () => {
    const uploadPath = await writeUpload('maze.zip', {
      'maze/index.html': '<h1>Maze</h1>',
      'maze/style.css': 'body { color: red; }'
    });

    const project = await processProjectUpload({
      file: { path: uploadPath, originalname: 'maze.zip' },
      fields: { title: 'Maze' },
      paths,
      now: () => new Date('2026-06-17T00:00:00.000Z')
    });

    expect(project.entryPath).toBe('/projects/maze/index.html');
    await expect(fs.readFile(path.join(paths.projectsDir, 'maze', 'style.css'), 'utf8')).resolves.toContain('red');
  });

  it('uses manifest metadata when form fields are missing', async () => {
    const uploadPath = await writeUpload('robot.zip', {
      'index.html': '<h1>Robot</h1>',
      'cover.png': 'fake image bytes',
      'manifest.json': JSON.stringify({
        title: 'Robot Dance',
        description: 'A dancing robot',
        cover: 'cover.png',
        tags: ['animation', 'music'],
        date: '2026-06-17'
      })
    });

    const project = await processProjectUpload({
      file: { path: uploadPath, originalname: 'robot.zip' },
      fields: {},
      paths,
      now: () => new Date('2026-06-17T00:00:00.000Z')
    });

    expect(project).toMatchObject({
      title: 'Robot Dance',
      description: 'A dancing robot',
      cover: '/projects/robot/cover.png',
      tags: ['animation', 'music'],
      date: '2026-06-17'
    });
  });

  it('rejects a zip without index.html', async () => {
    const uploadPath = await writeUpload('broken.zip', {
      'readme.txt': 'no entry point'
    });

    await expect(processProjectUpload({
      file: { path: uploadPath, originalname: 'broken.zip' },
      fields: { title: 'Broken' },
      paths
    })).rejects.toThrow('Upload must include an index.html file');
  });

  it('rejects path traversal entries', async () => {
    const uploadPath = await writeUpload('escape.zip', {
      '../escape.txt': 'bad',
      'index.html': '<h1>Escape</h1>'
    });

    await expect(processProjectUpload({
      file: { path: uploadPath, originalname: 'escape.zip' },
      fields: { title: 'Escape' },
      paths
    })).rejects.toThrow('Zip contains an unsafe path');
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run: `npm test -- tests/uploadProject.test.js`

Expected: FAIL because `server/uploadProject.js` does not exist.

- [ ] **Step 4: Implement zip upload processing**

Create `server/uploadProject.js`:

```js
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import yauzl from 'yauzl';
import { saveProject } from './projectStore.js';

const MAX_SLUG_LENGTH = 60;

export async function processProjectUpload({ file, fields, paths, now = () => new Date() }) {
  if (!file?.path || !file?.originalname?.toLowerCase().endsWith('.zip')) {
    throw new Error('Upload must be a .zip file');
  }

  const baseSlug = slugify(fields.title || path.basename(file.originalname, path.extname(file.originalname)) || 'project');
  const slug = await uniqueSlug(paths.projectsDir, baseSlug);
  const originalZipPath = path.join(paths.uploadsDir, `${slug}.zip`);
  const extractDir = path.join(paths.tempDir, `${slug}-${crypto.randomUUID()}`);
  const finalDir = path.join(paths.projectsDir, slug);

  await fs.mkdir(paths.uploadsDir, { recursive: true });
  await fs.mkdir(paths.projectsDir, { recursive: true });
  await fs.mkdir(paths.tempDir, { recursive: true });

  try {
    await fs.copyFile(file.path, originalZipPath);
    await extractZip(file.path, extractDir);

    const projectRoot = await findProjectRoot(extractDir);
    const manifest = await readManifest(projectRoot);
    const metadata = mergeMetadata(fields, manifest);

    await fs.rm(finalDir, { recursive: true, force: true });
    await fs.rename(projectRoot, finalDir);
    await cleanupExtractParent(extractDir, projectRoot);

    const createdAt = now().toISOString();
    const project = {
      id: crypto.randomUUID(),
      slug,
      title: metadata.title || titleFromSlug(slug),
      description: metadata.description || '',
      cover: metadata.cover ? `/projects/${slug}/${metadata.cover}` : '',
      tags: metadata.tags,
      date: metadata.date || createdAt.slice(0, 10),
      createdAt,
      entryPath: `/projects/${slug}/index.html`,
      originalZip: `/uploads/${slug}.zip`
    };

    await saveProject(paths.projectIndexPath, project);
    return project;
  } catch (error) {
    await fs.rm(extractDir, { recursive: true, force: true });
    await fs.rm(finalDir, { recursive: true, force: true });
    await fs.rm(originalZipPath, { force: true });
    throw error;
  } finally {
    await fs.rm(file.path, { force: true });
  }
}

function slugify(value) {
  const slug = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');

  return slug || 'project';
}

async function uniqueSlug(projectsDir, baseSlug) {
  let candidate = baseSlug;
  let count = 2;

  while (await exists(path.join(projectsDir, candidate))) {
    candidate = `${baseSlug}-${count}`;
    count += 1;
  }

  return candidate;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function titleFromSlug(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function extractZip(zipPath, destination) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (openError, zipfile) => {
      if (openError) {
        reject(new Error('Upload must be a valid zip file'));
        return;
      }

      let settled = false;

      function fail(error) {
        if (!settled) {
          settled = true;
          zipfile.close();
          reject(error);
        }
      }

      zipfile.readEntry();

      zipfile.on('entry', async (entry) => {
        const normalized = entry.fileName.replace(/\\/g, '/');

        if (isUnsafeZipPath(normalized)) {
          fail(new Error('Zip contains an unsafe path'));
          return;
        }

        const targetPath = path.join(destination, normalized);

        try {
          if (normalized.endsWith('/')) {
            await fs.mkdir(targetPath, { recursive: true });
          } else {
            await extractEntry(zipfile, entry, targetPath);
          }
          zipfile.readEntry();
        } catch (error) {
          fail(error);
        }
      });

      zipfile.on('end', () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });

      zipfile.on('error', fail);
    });
  });
}

function isUnsafeZipPath(entryPath) {
  return path.isAbsolute(entryPath) || entryPath.split('/').includes('..');
}

function extractEntry(zipfile, entry, targetPath) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, async (streamError, readStream) => {
      if (streamError) {
        reject(streamError);
        return;
      }

      try {
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        const chunks = [];

        readStream.on('data', (chunk) => chunks.push(chunk));
        readStream.on('error', reject);
        readStream.on('end', async () => {
          try {
            await fs.writeFile(targetPath, Buffer.concat(chunks));
            resolve();
          } catch (writeError) {
            reject(writeError);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function findProjectRoot(extractDir) {
  if (await exists(path.join(extractDir, 'index.html'))) {
    return extractDir;
  }

  const entries = await fs.readdir(extractDir, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());

  if (directories.length === 1) {
    const candidate = path.join(extractDir, directories[0].name);
    if (await exists(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }

  throw new Error('Upload must include an index.html file');
}

async function readManifest(projectRoot) {
  try {
    const raw = await fs.readFile(path.join(projectRoot, 'manifest.json'), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }

    return {};
  }
}

function mergeMetadata(fields, manifest) {
  const tags = fields.tags
    ? parseTags(fields.tags)
    : Array.isArray(manifest.tags)
      ? manifest.tags.map(String)
      : [];

  return {
    title: cleanText(fields.title) || cleanText(manifest.title),
    description: cleanText(fields.description) || cleanText(manifest.description),
    cover: cleanRelativePath(fields.cover) || cleanRelativePath(manifest.cover),
    tags,
    date: cleanText(fields.date) || cleanText(manifest.date)
  };
}

function parseTags(value) {
  return String(value)
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanRelativePath(value) {
  const cleaned = cleanText(value).replace(/\\/g, '/');

  if (!cleaned || isUnsafeZipPath(cleaned)) {
    return '';
  }

  return cleaned;
}

async function cleanupExtractParent(extractDir, projectRoot) {
  if (path.resolve(extractDir) !== path.resolve(projectRoot)) {
    await fs.rm(extractDir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 5: Run upload tests**

Run: `npm test -- tests/uploadProject.test.js`

Expected: PASS.

- [ ] **Step 6: Run all tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/uploadProject.js tests/helpers/zip.js tests/uploadProject.test.js
git commit -m "feat: process project zip uploads"
```

## Task 4: API Routes

**Files:**
- Modify: `server/app.js`
- Modify: `tests/app.test.js`

- [ ] **Step 1: Expand API tests**

Replace `tests/app.test.js` with:

```js
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
```

- [ ] **Step 2: Run API tests to verify failure**

Run: `npm test -- tests/app.test.js`

Expected: FAIL because `/api/projects` and upload routes are not implemented.

- [ ] **Step 3: Implement API routes and upload middleware**

Replace `server/app.js` with:

```js
import express from 'express';
import fs from 'node:fs';
import multer from 'multer';
import path from 'node:path';
import { createPaths } from './paths.js';
import { listProjects } from './projectStore.js';
import { processProjectUpload } from './uploadProject.js';

export function createApp(options = {}) {
  const app = express();
  const paths = createPaths(options.paths);
  fs.mkdirSync(paths.tempDir, { recursive: true });

  const upload = multer({
    dest: paths.tempDir,
    limits: { fileSize: 50 * 1024 * 1024 }
  });

  app.locals.paths = paths;
  app.use(express.json());
  app.use('/projects', express.static(paths.projectsDir));
  app.use('/uploads', express.static(paths.uploadsDir));
  app.use(express.static(paths.publicDir));

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true, name: 'vibekids' });
  });

  app.get('/api/projects', async (_request, response, next) => {
    try {
      const projects = await listProjects(paths.projectIndexPath);
      response.json({ projects });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects', upload.single('project'), async (request, response, next) => {
    try {
      const project = await processProjectUpload({
        file: request.file,
        fields: request.body,
        paths
      });

      response.status(201).json({ project });
    } catch (error) {
      next(error);
    }
  });

  app.get('/runner/:slug', (_request, response) => {
    response.sendFile(path.join(paths.publicDir, 'runner.html'));
  });

  app.use((error, _request, response, _next) => {
    const message = error.message || 'Something went wrong';
    const status = message.startsWith('Upload') || message.startsWith('Zip') ? 400 : 500;
    response.status(status).json({ error: message });
  });

  return app;
}
```

- [ ] **Step 4: Run API tests**

Run: `npm test -- tests/app.test.js`

Expected: PASS.

- [ ] **Step 5: Run all tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/app.js tests/app.test.js
git commit -m "feat: add project API routes"
```

## Task 5: Frontend Pages

**Files:**
- Create: `public/index.html`
- Create: `public/admin.html`
- Create: `public/runner.html`
- Create: `public/assets/styles.css`
- Create: `public/assets/app.js`
- Create: `public/assets/admin.js`

- [ ] **Step 1: Create gallery page**

Create `public/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Vibe Kids Studio</title>
    <link rel="stylesheet" href="/assets/styles.css">
    <script type="module" src="/assets/app.js"></script>
  </head>
  <body data-page="gallery">
    <header class="site-header">
      <a class="brand" href="/">Vibe Kids Studio</a>
      <nav class="nav">
        <a href="/admin.html">Upload</a>
      </nav>
    </header>
    <main class="shell">
      <section class="gallery-head">
        <div>
          <p class="eyebrow">Local coding gallery</p>
          <h1>Projects made with imagination and code.</h1>
        </div>
      </section>
      <section id="gallery" class="project-grid" aria-live="polite"></section>
    </main>
  </body>
</html>
```

- [ ] **Step 2: Create runner page**

Create `public/runner.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Run Project - Vibe Kids Studio</title>
    <link rel="stylesheet" href="/assets/styles.css">
    <script type="module" src="/assets/app.js"></script>
  </head>
  <body data-page="runner">
    <header class="site-header">
      <a class="brand" href="/">Vibe Kids Studio</a>
      <nav class="nav">
        <a href="/">Gallery</a>
      </nav>
    </header>
    <main class="runner-shell">
      <div id="runner-title" class="runner-title">Loading project...</div>
      <iframe id="project-frame" class="project-frame" title="Project preview" sandbox="allow-scripts allow-same-origin"></iframe>
    </main>
  </body>
</html>
```

- [ ] **Step 3: Create admin page**

Create `public/admin.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Upload - Vibe Kids Studio</title>
    <link rel="stylesheet" href="/assets/styles.css">
    <script type="module" src="/assets/admin.js"></script>
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="/">Vibe Kids Studio</a>
      <nav class="nav">
        <a href="/">Gallery</a>
      </nav>
    </header>
    <main class="shell narrow">
      <section class="admin-panel">
        <p class="eyebrow">Owner upload</p>
        <h1>Add a new project</h1>
        <form id="upload-form" class="upload-form">
          <label>
            Project zip
            <input name="project" type="file" accept=".zip" required>
          </label>
          <label>
            Title
            <input name="title" type="text" placeholder="Space maze">
          </label>
          <label>
            Description
            <textarea name="description" rows="4" placeholder="What did this project make or explore?"></textarea>
          </label>
          <label>
            Cover path
            <input name="cover" type="text" placeholder="cover.png">
          </label>
          <label>
            Tags
            <input name="tags" type="text" placeholder="game, animation">
          </label>
          <label>
            Date
            <input name="date" type="date">
          </label>
          <button type="submit">Upload project</button>
          <p id="upload-status" class="status" role="status"></p>
        </form>
      </section>
    </main>
  </body>
</html>
```

- [ ] **Step 4: Create Bright Studio CSS**

Create `public/assets/styles.css`:

```css
:root {
  color-scheme: light;
  --ink: #202124;
  --muted: #5f6368;
  --paper: #fffdf7;
  --panel: #ffffff;
  --line: #202124;
  --yellow: #ffd84d;
  --blue: #55c7e8;
  --pink: #ff7a9c;
  --green: #69c77f;
  --shadow: 0 8px 0 rgba(32, 33, 36, 0.16);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

a {
  color: inherit;
}

.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 18px clamp(18px, 4vw, 48px);
  border-bottom: 2px solid var(--line);
  background: var(--panel);
}

.brand {
  font-size: 1.1rem;
  font-weight: 850;
  text-decoration: none;
}

.nav {
  display: flex;
  gap: 14px;
  font-weight: 700;
}

.nav a {
  text-decoration: none;
}

.shell {
  width: min(1120px, calc(100% - 32px));
  margin: 0 auto;
  padding: 36px 0 56px;
}

.shell.narrow {
  width: min(720px, calc(100% - 32px));
}

.gallery-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 28px;
}

.eyebrow {
  margin: 0 0 8px;
  font-size: 0.78rem;
  font-weight: 850;
  text-transform: uppercase;
}

h1 {
  max-width: 760px;
  margin: 0;
  font-size: clamp(2.1rem, 6vw, 4.8rem);
  line-height: 0.98;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 18px;
}

.project-card,
.admin-panel {
  border: 2px solid var(--line);
  background: var(--panel);
  box-shadow: var(--shadow);
}

.project-card {
  display: grid;
  grid-template-rows: 150px 1fr;
}

.cover {
  display: grid;
  place-items: center;
  border-bottom: 2px solid var(--line);
  background: var(--yellow);
  overflow: hidden;
}

.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-fallback {
  font-size: 3rem;
  font-weight: 900;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.card-body h2 {
  margin: 0;
  font-size: 1.25rem;
}

.card-body p {
  margin: 0;
  color: var(--muted);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag {
  border: 2px solid var(--line);
  padding: 3px 8px;
  background: var(--blue);
  font-size: 0.78rem;
  font-weight: 800;
}

.button,
button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  border: 2px solid var(--line);
  background: var(--pink);
  color: var(--ink);
  padding: 0 14px;
  font: inherit;
  font-weight: 850;
  text-decoration: none;
  cursor: pointer;
}

.empty,
.status {
  color: var(--muted);
  font-weight: 700;
}

.admin-panel {
  padding: clamp(18px, 4vw, 32px);
}

.upload-form {
  display: grid;
  gap: 16px;
  margin-top: 24px;
}

label {
  display: grid;
  gap: 8px;
  font-weight: 800;
}

input,
textarea {
  width: 100%;
  border: 2px solid var(--line);
  background: #fff;
  color: var(--ink);
  padding: 11px 12px;
  font: inherit;
}

.runner-shell {
  display: grid;
  grid-template-rows: auto 1fr;
  height: calc(100vh - 65px);
}

.runner-title {
  padding: 12px 18px;
  border-bottom: 2px solid var(--line);
  font-weight: 850;
  background: var(--yellow);
}

.project-frame {
  width: 100%;
  height: 100%;
  border: 0;
  background: #fff;
}

@media (max-width: 640px) {
  .gallery-head {
    display: block;
  }
}
```

- [ ] **Step 5: Create gallery and runner JavaScript**

Create `public/assets/app.js`:

```js
const page = document.body.dataset.page;

if (page === 'gallery') {
  loadGallery();
}

if (page === 'runner') {
  loadRunner();
}

async function loadGallery() {
  const gallery = document.querySelector('#gallery');
  gallery.innerHTML = '<p class="empty">Loading projects...</p>';

  try {
    const response = await fetch('/api/projects');
    const { projects } = await response.json();

    if (!projects.length) {
      gallery.innerHTML = '<p class="empty">No projects yet. Upload the first one from the Upload page.</p>';
      return;
    }

    gallery.innerHTML = projects.map(renderCard).join('');
  } catch {
    gallery.innerHTML = '<p class="empty">Projects could not be loaded.</p>';
  }
}

function renderCard(project) {
  const tags = (project.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
  const cover = project.cover
    ? `<img src="${escapeAttribute(project.cover)}" alt="">`
    : `<div class="cover-fallback">${escapeHtml(project.title.charAt(0).toUpperCase())}</div>`;

  return `
    <article class="project-card">
      <div class="cover">${cover}</div>
      <div class="card-body">
        <h2>${escapeHtml(project.title)}</h2>
        <p>${escapeHtml(project.description || 'A fresh coding project.')}</p>
        <div class="tags">${tags}</div>
        <a class="button" href="/runner/${encodeURIComponent(project.slug)}">Open project</a>
      </div>
    </article>
  `;
}

async function loadRunner() {
  const slug = decodeURIComponent(window.location.pathname.split('/').filter(Boolean).at(-1) || '');
  const title = document.querySelector('#runner-title');
  const frame = document.querySelector('#project-frame');

  try {
    const response = await fetch('/api/projects');
    const { projects } = await response.json();
    const project = projects.find((item) => item.slug === slug);

    if (!project) {
      title.textContent = 'Project not found';
      return;
    }

    title.textContent = project.title;
    frame.src = project.entryPath;
  } catch {
    title.textContent = 'Project could not be loaded';
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#096;');
}
```

- [ ] **Step 6: Create admin JavaScript**

Create `public/assets/admin.js`:

```js
const form = document.querySelector('#upload-form');
const statusElement = document.querySelector('#upload-status');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusElement.textContent = 'Uploading project...';

  const formData = new FormData(form);

  try {
    const response = await fetch('/api/projects', {
      method: 'POST',
      body: formData
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || 'Upload failed');
    }

    statusElement.textContent = 'Upload complete. Opening project...';
    window.location.href = `/runner/${encodeURIComponent(payload.project.slug)}`;
  } catch (error) {
    statusElement.textContent = error.message;
  }
});
```

- [ ] **Step 7: Run all tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 8: Start the app and verify static pages load**

Run: `npm start`

Expected: terminal prints `Vibe Kids listening on http://localhost:4321`.

Visit:

- `http://localhost:4321/`
- `http://localhost:4321/admin.html`

Expected: both pages render without console-blocking errors.

- [ ] **Step 9: Stop the app**

Press `Ctrl+C` in the running terminal.

- [ ] **Step 10: Commit**

```bash
git add public
git commit -m "feat: add gallery frontend"
```

## Task 6: Caddy Local Deployment

**Files:**
- Create: `Caddyfile`
- Create: `README.md`

- [ ] **Step 1: Create Caddyfile**

Create `Caddyfile`:

```caddyfile
vibekids.localhost {
	reverse_proxy 127.0.0.1:4321
}
```

- [ ] **Step 2: Create README**

Create `README.md`:

```md
# Vibe Kids Studio

Local gallery for uploading and running kids' vibe coding projects.

## Requirements

- Node.js
- Caddy

## Run Locally

Install dependencies:

```bash
npm install
```

Start the Node app:

```bash
npm start
```

In another terminal, start Caddy from this project directory:

```bash
caddy run
```

Open:

- Gallery: http://vibekids.localhost
- Upload page: http://vibekids.localhost/admin.html

## Project Zip Format

Upload a `.zip` containing `index.html` at the root or inside a single top-level folder.

Optional `manifest.json` can sit beside `index.html`:

```json
{
  "title": "Project title",
  "description": "Short description",
  "cover": "cover.png",
  "tags": ["game", "animation"],
  "date": "2026-06-17"
}
```

Runtime project data is stored in `data/`, `uploads/`, and `projects/`.
```

- [ ] **Step 3: Validate Caddyfile if Caddy is installed**

Run: `caddy validate --config Caddyfile`

Expected: PASS. If `caddy` is not installed, record that Caddy validation was skipped.

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Caddyfile README.md
git commit -m "docs: add local deployment guide"
```

## Task 7: End-To-End Upload Verification

**Files:**
- Create: `fixtures/sample-project/index.html`
- Create: `fixtures/sample-project/manifest.json`
- Create: `fixtures/sample-project/cover.txt`

- [ ] **Step 1: Create a sample project fixture**

Create `fixtures/sample-project/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Rainbow Counter</title>
    <style>
      body {
        display: grid;
        place-items: center;
        min-height: 100vh;
        margin: 0;
        font-family: system-ui, sans-serif;
        background: linear-gradient(135deg, #ffd84d, #55c7e8);
      }
      button {
        border: 3px solid #202124;
        background: #ff7a9c;
        padding: 18px 24px;
        font: inherit;
        font-weight: 800;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <button id="counter">Clicks: 0</button>
    <script>
      let count = 0;
      document.querySelector('#counter').addEventListener('click', () => {
        count += 1;
        document.querySelector('#counter').textContent = `Clicks: ${count}`;
      });
    </script>
  </body>
</html>
```

Create `fixtures/sample-project/manifest.json`:

```json
{
  "title": "Rainbow Counter",
  "description": "A tiny click counter with bright colors.",
  "tags": ["button", "demo"],
  "date": "2026-06-17"
}
```

Create `fixtures/sample-project/cover.txt`:

```text
Sample project fixture.
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Create a sample zip**

Run:

```bash
cd fixtures/sample-project
zip -r ../sample-project.zip .
cd ../..
```

Expected: `fixtures/sample-project.zip` exists.

- [ ] **Step 4: Start the app**

Run: `npm start`

Expected: terminal prints `Vibe Kids listening on http://localhost:4321`.

- [ ] **Step 5: Upload manually through the browser**

Open `http://localhost:4321/admin.html`, choose `fixtures/sample-project.zip`, and submit.

Expected: browser redirects to `/runner/rainbow-counter` and the iframe shows the Rainbow Counter button.

- [ ] **Step 6: Verify gallery persistence**

Open `http://localhost:4321/`.

Expected: the gallery shows a card titled `Rainbow Counter`.

- [ ] **Step 7: Stop the app**

Press `Ctrl+C`.

- [ ] **Step 8: Remove generated runtime data before committing**

Run:

```bash
rm -rf data uploads projects .tmp fixtures/sample-project.zip
```

Expected: runtime data is removed; fixture source remains.

- [ ] **Step 9: Commit fixture**

```bash
git add fixtures/sample-project
git commit -m "test: add sample project fixture"
```

## Final Verification

- [ ] Run: `npm test`

Expected: all Vitest suites pass.

- [ ] Run: `npm start`

Expected: app starts on `http://localhost:4321`.

- [ ] If Caddy is installed, run: `caddy validate --config Caddyfile`

Expected: Caddyfile validates successfully.

- [ ] Confirm `git status --short` only shows intentional changes.

Expected: clean working tree after all commits.
