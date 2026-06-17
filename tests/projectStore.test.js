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

  it('replaces projects with the same id', async () => {
    await saveProject(indexPath, { id: 'one', title: 'Original', createdAt: '2026-01-01T00:00:00.000Z' });
    await saveProject(indexPath, { id: 'one', title: 'Updated', createdAt: '2026-01-02T00:00:00.000Z' });

    await expect(listProjects(indexPath)).resolves.toEqual([
      { id: 'one', title: 'Updated', createdAt: '2026-01-02T00:00:00.000Z' }
    ]);
  });

  it('throws a friendly error when the index is corrupt', async () => {
    await fs.mkdir(path.dirname(indexPath), { recursive: true });
    await fs.writeFile(indexPath, '{bad json', 'utf8');

    await expect(listProjects(indexPath)).rejects.toThrow('Project index is unreadable');
  });

  it('throws a friendly error when the index shape is invalid', async () => {
    await fs.mkdir(path.dirname(indexPath), { recursive: true });
    await fs.writeFile(indexPath, '{"projects":[]}\n', 'utf8');

    await expect(listProjects(indexPath)).rejects.toThrow('Project index is unreadable');
  });

  it('preserves all projects from concurrent saves', async () => {
    const projects = Array.from({ length: 20 }, (_, index) => ({
      id: `project-${index}`,
      title: `Project ${index}`,
      createdAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString()
    }));

    await Promise.all(projects.map((project) => saveProject(indexPath, project)));

    const savedProjects = await listProjects(indexPath);
    expect(savedProjects).toHaveLength(projects.length);
    expect(savedProjects.map((project) => project.id).sort()).toEqual(projects.map((project) => project.id).sort());
  });
});
