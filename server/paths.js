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
