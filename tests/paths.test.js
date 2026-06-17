import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPaths } from '../server/paths.js';

describe('createPaths', () => {
  it('uses project root defaults', () => {
    const paths = createPaths();
    const rootDir = path.resolve(import.meta.dirname, '..');

    expect(paths).toEqual({
      baseDir: rootDir,
      publicDir: path.join(rootDir, 'public'),
      dataDir: path.join(rootDir, 'data'),
      uploadsDir: path.join(rootDir, 'uploads'),
      projectsDir: path.join(rootDir, 'projects'),
      tempDir: path.join(rootDir, '.tmp'),
      projectIndexPath: path.join(rootDir, 'data', 'projects.json')
    });
  });

  it('applies baseDir override to default child paths', () => {
    const baseDir = path.join(path.sep, 'tmp', 'vibekids-base');

    const paths = createPaths({ baseDir });

    expect(paths).toEqual({
      baseDir,
      publicDir: path.join(baseDir, 'public'),
      dataDir: path.join(baseDir, 'data'),
      uploadsDir: path.join(baseDir, 'uploads'),
      projectsDir: path.join(baseDir, 'projects'),
      tempDir: path.join(baseDir, '.tmp'),
      projectIndexPath: path.join(baseDir, 'data', 'projects.json')
    });
  });

  it('uses dataDir override for the default project index path', () => {
    const baseDir = path.join(path.sep, 'tmp', 'vibekids-base');
    const dataDir = path.join(path.sep, 'tmp', 'vibekids-data');

    const paths = createPaths({ baseDir, dataDir });

    expect(paths.dataDir).toBe(dataDir);
    expect(paths.projectIndexPath).toBe(path.join(dataDir, 'projects.json'));
  });

  it('uses explicit projectIndexPath override', () => {
    const dataDir = path.join(path.sep, 'tmp', 'vibekids-data');
    const projectIndexPath = path.join(path.sep, 'tmp', 'custom-projects.json');

    const paths = createPaths({ dataDir, projectIndexPath });

    expect(paths.dataDir).toBe(dataDir);
    expect(paths.projectIndexPath).toBe(projectIndexPath);
  });
});
