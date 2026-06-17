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

async function writeRawUpload(name, content) {
  const uploadPath = path.join(tempDir, name);
  await fs.writeFile(uploadPath, content);
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

  it('stores concurrent same-title uploads with unique slugs and original zips', async () => {
    const firstUploadPath = await writeUpload('first.zip', {
      'index.html': '<h1>First Space Game</h1>'
    });
    const secondUploadPath = await writeUpload('second.zip', {
      'index.html': '<h1>Second Space Game</h1>'
    });

    const [firstProject, secondProject] = await Promise.all([
      processProjectUpload({
        file: { path: firstUploadPath, originalname: 'first.zip' },
        fields: { title: 'Space Game' },
        paths,
        now: () => new Date('2026-06-17T00:00:00.000Z')
      }),
      processProjectUpload({
        file: { path: secondUploadPath, originalname: 'second.zip' },
        fields: { title: 'Space Game' },
        paths,
        now: () => new Date('2026-06-17T00:00:00.000Z')
      })
    ]);

    expect([firstProject.slug, secondProject.slug].sort()).toEqual(['space-game', 'space-game-2']);
    await expect(fs.access(path.join(paths.uploadsDir, 'space-game.zip'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(paths.uploadsDir, 'space-game-2.zip'))).resolves.toBeUndefined();
    await expect(listProjects(paths.projectIndexPath)).resolves.toHaveLength(2);
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

  it('uses form metadata before manifest metadata', async () => {
    const uploadPath = await writeUpload('robot.zip', {
      'index.html': '<h1>Robot</h1>',
      'manifest-cover.png': 'manifest image bytes',
      'form-cover.png': 'form image bytes',
      'manifest.json': JSON.stringify({
        title: 'Manifest Robot',
        description: 'Manifest description',
        cover: 'manifest-cover.png',
        tags: ['manifest', 'robot'],
        date: '2026-06-17'
      })
    });

    const project = await processProjectUpload({
      file: { path: uploadPath, originalname: 'robot.zip' },
      fields: {
        title: 'Form Robot',
        description: 'Form description',
        cover: 'form-cover.png',
        tags: 'form, override',
        date: '2026-06-18'
      },
      paths,
      now: () => new Date('2026-06-17T00:00:00.000Z')
    });

    expect(project).toMatchObject({
      slug: 'form-robot',
      title: 'Form Robot',
      description: 'Form description',
      cover: '/projects/form-robot/form-cover.png',
      tags: ['form', 'override'],
      date: '2026-06-18'
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

  it('cleans up reserved project directory and copied zip when validation fails after slug reservation', async () => {
    const uploadPath = await writeUpload('broken.zip', {
      'readme.txt': 'no entry point'
    });

    await expect(processProjectUpload({
      file: { path: uploadPath, originalname: 'broken.zip' },
      fields: { title: 'Broken Project' },
      paths
    })).rejects.toThrow('Upload must include an index.html file');

    await expect(fs.access(path.join(paths.projectsDir, 'broken-project'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.access(path.join(paths.uploadsDir, 'broken-project.zip'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects corrupt zip content with a zip filename', async () => {
    const uploadPath = await writeRawUpload('fake.zip', 'not actually a zip');

    await expect(processProjectUpload({
      file: { path: uploadPath, originalname: 'fake.zip' },
      fields: { title: 'Fake' },
      paths
    })).rejects.toThrow('Upload must be a .zip file');
  });

  it('removes the provided temp file when upload extension is invalid', async () => {
    const uploadPath = await writeRawUpload('not-a-zip.txt', 'not a zip');

    await expect(processProjectUpload({
      file: { path: uploadPath, originalname: 'not-a-zip.txt' },
      fields: { title: 'Invalid' },
      paths
    })).rejects.toThrow('Upload must be a .zip file');

    await expect(fs.access(uploadPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects uppercase INDEX.HTML without lowercase index.html', async () => {
    const uploadPath = await writeUpload('uppercase.zip', {
      'INDEX.HTML': '<h1>Uppercase</h1>'
    });

    await expect(processProjectUpload({
      file: { path: uploadPath, originalname: 'uppercase.zip' },
      fields: { title: 'Uppercase' },
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

  it('rejects absolute unix path entries', async () => {
    const uploadPath = await writeUpload('absolute.zip', {
      '/absolute.txt': 'bad',
      'index.html': '<h1>Absolute</h1>'
    });

    await expect(processProjectUpload({
      file: { path: uploadPath, originalname: 'absolute.zip' },
      fields: { title: 'Absolute' },
      paths
    })).rejects.toThrow('Zip contains an unsafe path');
  });

  it('rejects absolute windows drive path entries', async () => {
    const uploadPath = await writeUpload('windows-absolute.zip', {
      'C:/absolute.txt': 'bad',
      'index.html': '<h1>Absolute</h1>'
    });

    await expect(processProjectUpload({
      file: { path: uploadPath, originalname: 'windows-absolute.zip' },
      fields: { title: 'Absolute' },
      paths
    })).rejects.toThrow('Zip contains an unsafe path');
  });
});
