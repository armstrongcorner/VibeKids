# Vibe Kids Studio

Vibe Kids Studio is a small Node.js and Express gallery for uploading, cataloging, and running kids' vibe coding projects. It accepts zip files, extracts each project into an isolated runtime directory, and serves both a public gallery and an admin upload page.

中文说明见 [README.zh-CN.md](./README.zh-CN.md).

## Features

- Public project gallery.
- Admin upload page for project zip files.
- Project runner pages at `/runner/:slug`.
- Optional project metadata through `manifest.json`.
- Caddy reverse proxy configuration for a friendly domain.

## Requirements

- Node.js 18 or newer.
- npm.
- Caddy, if you want to use the bundled reverse proxy configuration.

## Run Locally

Install dependencies:

```bash
npm install
```

Start the Node app:

```bash
npm start
```

For development with automatic restarts:

```bash
npm run dev
```

The Node server listens on `http://127.0.0.1:4321` by default. You can override this with `HOST` and `PORT`:

```bash
HOST=0.0.0.0 PORT=4321 npm start
```

## Run With Caddy

The included `Caddyfile` proxies `vibekids.ddns.net` to the Node server on port `4321`.

Start the Node app first, then run Caddy from the project directory:

```bash
caddy run
```

Open:

- Gallery: `https://vibekids.ddns.net`
- Upload page: `https://vibekids.ddns.net/admin.html`

For local-only usage, you can change the Caddy site address back to `vibekids.localhost`.

## Project Zip Format

Upload a `.zip` containing `index.html` at the root or inside a single top-level folder.

Optional `manifest.json` can sit beside `index.html`:

```json
{
  "title": "Project title",
  "description": "Short description",
  "cover": "cover.png",
  "tags": ["game", "animation"],
  "date": "2026-06-17"
}
```

If `cover` is provided, it should point to a file inside the uploaded project.

## Runtime Data

Uploaded and generated project data is stored in these ignored directories:

- `data/`
- `uploads/`
- `projects/`
- `.tmp/`

These directories are intentionally not committed to Git.

## Tests

Run the test suite:

```bash
npm test
```

## Repository

GitHub: [armstrongcorner/VibeKids](https://github.com/armstrongcorner/VibeKids)
