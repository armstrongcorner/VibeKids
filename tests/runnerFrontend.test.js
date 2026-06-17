import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = path.resolve(import.meta.dirname, '..');

async function readPublicFile(filePath) {
  return fs.readFile(path.join(rootDir, 'public', filePath), 'utf8');
}

describe('runner frontend', () => {
  it('keeps uploaded projects in a script-only iframe sandbox', async () => {
    const html = await readPublicFile('runner.html');

    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).not.toContain('allow-same-origin');
  });

  it('prechecks the project entry and shows a friendly load failure', async () => {
    const script = await readPublicFile('assets/app.js');

    expect(script).toContain("method: 'HEAD'");
    expect(script).toContain('Project files could not be loaded.');
    expect(script).toContain('This project may be missing its index.html file.');
    expect(script).toContain('frame.hidden = true');
  });
});
