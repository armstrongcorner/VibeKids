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
