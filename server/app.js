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
  const uploadFileSizeLimit = options.uploadFileSizeLimit ?? 50 * 1024 * 1024;
  fs.mkdirSync(paths.tempDir, { recursive: true });

  const upload = multer({
    dest: paths.tempDir,
    limits: { fileSize: uploadFileSizeLimit }
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
    if (error instanceof multer.MulterError || error.code === 'LIMIT_FILE_SIZE') {
      if (error.code === 'LIMIT_FILE_SIZE') {
        response.status(413).json({ error: 'Project zip must be 50 MB or smaller' });
        return;
      }

      response.status(400).json({ error: error.message || 'Upload failed' });
      return;
    }

    const message = error.message || 'Something went wrong';
    const status = message.startsWith('Upload') || message.startsWith('Zip') ? 400 : 500;
    response.status(status).json({ error: message });
  });

  return app;
}
