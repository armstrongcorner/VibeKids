import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const saveQueues = new Map();

function sortProjectsNewestFirst(projects) {
  return projects.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
}

export async function listProjects(indexPath) {
  try {
    const raw = await fs.readFile(indexPath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error('Project index must be an array');
    }

    return sortProjectsNewestFirst(parsed);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw new Error('Project index is unreadable');
  }
}

async function writeProject(indexPath, project) {
  const projects = await listProjects(indexPath);
  const nextProjects = sortProjectsNewestFirst([project, ...projects.filter((item) => item.id !== project.id)]);
  const directory = path.dirname(indexPath);
  const tempPath = path.join(directory, `${path.basename(indexPath)}.${randomUUID()}.tmp`);

  await fs.mkdir(directory, { recursive: true });

  try {
    await fs.writeFile(tempPath, `${JSON.stringify(nextProjects, null, 2)}\n`, 'utf8');
    await fs.rename(tempPath, indexPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }

  return project;
}

export async function saveProject(indexPath, project) {
  const previousSave = saveQueues.get(indexPath) ?? Promise.resolve();
  const currentSave = previousSave.catch(() => {}).then(() => writeProject(indexPath, project));

  saveQueues.set(indexPath, currentSave);

  try {
    return await currentSave;
  } finally {
    if (saveQueues.get(indexPath) === currentSave) {
      saveQueues.delete(indexPath);
    }
  }
}
