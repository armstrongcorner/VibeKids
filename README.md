# Vibe Kids Studio

Local gallery for uploading and running kids' vibe coding projects.

## Requirements

- Node.js
- Caddy

## Run Locally

Install dependencies:

```bash
npm install
```

Start the Node app:

```bash
npm start
```

In another terminal, start Caddy from this project directory:

```bash
caddy run
```

Open:

- Gallery: http://vibekids.localhost
- Upload page: http://vibekids.localhost/admin.html

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

Runtime project data is stored in `data/`, `uploads/`, and `projects/`.
