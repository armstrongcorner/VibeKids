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
