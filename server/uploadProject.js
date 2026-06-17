import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import { saveProject } from './projectStore.js';

function slugify(value) {
  const slug = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'project';
}

function stripZipExtension(filename) {
  return path.basename(filename, path.extname(filename));
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

async function uniqueSlug(baseSlug, projectsDir) {
  let slug = baseSlug;
  let suffix = 2;

  while (await pathExists(path.join(projectsDir, slug))) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

function normalizeZipPath(entryPath) {
  return entryPath.replaceAll('\\', '/');
}

function isUnsafeRelativePath(entryPath) {
  const normalized = normalizeZipPath(entryPath);

  return (
    normalized.startsWith('/') ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.split('/').some((segment) => segment === '..')
  );
}

function assertSafeRelativePath(entryPath, message = 'Zip contains an unsafe path') {
  if (!entryPath || isUnsafeRelativePath(entryPath)) {
    throw new Error(message);
  }
}

function openZip(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (error, zipfile) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(zipfile);
    });
  });
}

function openReadStream(zipfile, entry) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (error, stream) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(stream);
    });
  });
}

function waitForEntry(zipfile) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      zipfile.off('entry', onEntry);
      zipfile.off('end', onEnd);
      zipfile.off('error', onError);
    };
    const onEntry = (entry) => {
      cleanup();
      resolve(entry);
    };
    const onEnd = () => {
      cleanup();
      resolve(null);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };

    zipfile.once('entry', onEntry);
    zipfile.once('end', onEnd);
    zipfile.once('error', onError);
    zipfile.readEntry();
  });
}

async function extractZip(zipPath, destination) {
  const zipfile = await openZip(zipPath);
  const entryPaths = [];

  try {
    while (true) {
      const entry = await waitForEntry(zipfile);

      if (!entry) {
        break;
      }

      const entryPath = normalizeZipPath(entry.fileName);
      assertSafeRelativePath(entryPath);
      entryPaths.push(entryPath);

      if (entryPath.endsWith('/')) {
        await fs.mkdir(path.join(destination, entryPath), { recursive: true });
        continue;
      }

      const outputPath = path.join(destination, entryPath);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      const readStream = await openReadStream(zipfile, entry);
      await pipeline(readStream, createWriteStream(outputPath));
    }
  } finally {
    zipfile.close();
  }

  return entryPaths;
}

function findProjectRoot(entryPaths, extractionDir) {
  const files = entryPaths.filter((entryPath) => !entryPath.endsWith('/'));
  const rootIndex = files.some((entryPath) => entryPath.toLowerCase() === 'index.html');

  if (rootIndex) {
    return extractionDir;
  }

  const topLevelNames = new Set(files.map((entryPath) => entryPath.split('/')[0]).filter(Boolean));

  if (topLevelNames.size === 1) {
    const [topLevelName] = [...topLevelNames];
    const folderIndex = files.some((entryPath) => entryPath.toLowerCase() === `${topLevelName.toLowerCase()}/index.html`);

    if (folderIndex) {
      return path.join(extractionDir, topLevelName);
    }
  }

  throw new Error('Upload must include an index.html file');
}

async function readManifest(projectRoot) {
  try {
    const raw = await fs.readFile(path.join(projectRoot, 'manifest.json'), 'utf8');
    const manifest = JSON.parse(raw);
    return manifest && typeof manifest === 'object' && !Array.isArray(manifest) ? manifest : {};
  } catch {
    return {};
  }
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function parseTags(fields, manifest) {
  if (typeof fields.tags === 'string') {
    return fields.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  if (Array.isArray(manifest.tags) && manifest.tags.every((tag) => typeof tag === 'string')) {
    return manifest.tags;
  }

  return [];
}

function resolveCover(slug, fields, manifest) {
  const cover = firstString(fields.cover, manifest.cover);

  if (!cover) {
    return '';
  }

  assertSafeRelativePath(cover, 'Zip contains an unsafe path');
  return `/projects/${slug}/${normalizeZipPath(cover)}`;
}

function validateUpload(file) {
  if (!file?.path || !file?.originalname || path.extname(file.originalname).toLowerCase() !== '.zip') {
    throw new Error('Upload must be a .zip file');
  }
}

export async function processProjectUpload({ file, fields = {}, paths, now = () => new Date() }) {
  validateUpload(file);

  const timestamp = now();
  const createdAt = timestamp.toISOString();
  const sourceName = firstString(fields.title) || stripZipExtension(file.originalname);
  const slug = await uniqueSlug(slugify(sourceName), paths.projectsDir);
  const originalZipPath = path.join(paths.uploadsDir, `${slug}.zip`);
  const extractionDir = path.join(paths.tempDir, `upload-${slug}-${randomUUID()}`);
  const finalProjectDir = path.join(paths.projectsDir, slug);

  let movedProject = false;
  let savedOriginal = false;

  try {
    await fs.mkdir(paths.uploadsDir, { recursive: true });
    await fs.mkdir(paths.projectsDir, { recursive: true });
    await fs.mkdir(extractionDir, { recursive: true });
    await fs.copyFile(file.path, originalZipPath);
    savedOriginal = true;

    let entryPaths;

    try {
      entryPaths = await extractZip(originalZipPath, extractionDir);
    } catch (error) {
      if (error.message?.startsWith('invalid relative path:')) {
        throw new Error('Zip contains an unsafe path');
      }

      throw error;
    }

    const rootPath = findProjectRoot(entryPaths, extractionDir);
    const manifest = await readManifest(rootPath);

    const title = firstString(fields.title, manifest.title, stripZipExtension(file.originalname));
    const description = firstString(fields.description, manifest.description);
    const tags = parseTags(fields, manifest);
    const date = firstString(fields.date, manifest.date, createdAt.slice(0, 10));
    const cover = resolveCover(slug, fields, manifest);

    await fs.rename(rootPath, finalProjectDir);
    movedProject = true;

    const project = {
      id: randomUUID(),
      slug,
      title,
      description,
      cover,
      tags,
      date,
      createdAt,
      entryPath: `/projects/${slug}/index.html`,
      originalZip: `/uploads/${slug}.zip`
    };

    await saveProject(paths.projectIndexPath, project);

    return project;
  } catch (error) {
    if (movedProject) {
      await fs.rm(finalProjectDir, { recursive: true, force: true });
    }

    if (savedOriginal) {
      await fs.rm(originalZipPath, { force: true });
    }

    throw error;
  } finally {
    await fs.rm(extractionDir, { recursive: true, force: true });
    await fs.rm(file.path, { force: true });
  }
}
