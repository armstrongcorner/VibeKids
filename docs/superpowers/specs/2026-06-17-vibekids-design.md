# Vibe Kids Local Gallery Design

## Goal

Build a local website for uploading, displaying, and running children's vibe coding projects. The site is meant for kids and friends to browse together on the local network, with a simple owner-only upload workflow in the first version.

## Confirmed Direction

- Audience: kids and their friends browsing a playful project gallery.
- Upload format: `.zip` project package containing an `index.html`.
- Display format: card-based gallery.
- Project launch: each uploaded project can be opened and run directly in the website.
- Upload permissions: first version assumes only the owner uses `/admin`; no authentication yet.
- Metadata: prefer `manifest.json` from the zip when present, with manual form fields as fallback.
- Deployment: local Caddy reverse proxy in front of a Node/Express application service.
- Visual direction: Bright Studio, with a light, playful, polished look.

## Architecture

The first version uses a lightweight Node/Express app. Caddy provides the local entry point and proxies requests to the Node service.

The app has three responsibilities:

1. Serve the gallery UI and static frontend assets.
2. Accept zip uploads, validate and extract them, and update the project index.
3. Serve extracted projects so each one can run from its own URL inside an iframe.

Planned top-level structure:

```text
public/
  index.html
  admin.html
  assets/
server/
  app.js
  upload.js
  projects.js
data/
  projects.json
uploads/
  <slug>.zip
projects/
  <slug>/
    index.html
Caddyfile
package.json
```

`data/`, `uploads/`, and `projects/` are runtime data directories and should not be committed.

## Pages And Flows

### Gallery

The home page opens directly into the project gallery. It should not be a marketing page. The page shows a compact header, the site name, a small `/admin` entry, and a responsive grid of project cards.

Each card shows:

- Cover image or a generated/default visual.
- Project title.
- Short description.
- Date and optional tags.
- A clear action to open the project.

The Bright Studio visual language uses light backgrounds, crisp borders, strong but balanced accent colors, and card layouts that feel playful without becoming childish.

### Project Runner

Opening a card navigates to a project runner page. The page keeps a small site header with a back link and embeds the extracted project `index.html` in a large iframe.

If the project cannot load, the runner shows a friendly error state explaining that the project package may be missing `index.html` or required assets.

### Admin Upload

The first version exposes `/admin` without authentication, under the assumption that the app is running in a trusted local environment.

The admin page supports:

- Selecting a `.zip` file.
- Entering or confirming title, description, date, tags, and optional cover.
- Uploading the project.
- Redirecting to the new project or gallery after success.

If the zip includes `manifest.json`, the app uses it to prefill or save metadata. Manual form values override missing manifest fields.

## Project Package Format

The minimum supported package is a `.zip` containing an `index.html`. The app accepts either:

- `index.html` at the zip root.
- A single top-level folder containing `index.html`.

Optional `manifest.json` may be placed beside `index.html`.

Supported manifest fields:

```json
{
  "title": "Project title",
  "description": "Short project description",
  "cover": "cover.png",
  "tags": ["game", "animation"],
  "date": "2026-06-17"
}
```

## Data Model

`data/projects.json` stores the gallery index as an array of records.

```json
{
  "id": "generated-id",
  "slug": "project-slug",
  "title": "Project title",
  "description": "Short project description",
  "cover": "/projects/project-slug/cover.png",
  "tags": ["game"],
  "createdAt": "2026-06-17T00:00:00.000Z",
  "entryPath": "/projects/project-slug/index.html",
  "originalZip": "/uploads/project-slug.zip"
}
```

The implementation should write this file atomically so a failed upload does not corrupt the index.

## Upload Handling

Upload processing should:

1. Accept only `.zip` files.
2. Enforce a reasonable file size limit.
3. Generate a unique slug.
4. Save the original zip in `uploads/`.
5. Extract into a temporary directory.
6. Reject zip entries that attempt path traversal.
7. Locate `index.html` at the root or inside a single top-level folder.
8. Read optional `manifest.json`.
9. Move the validated project into `projects/<slug>/`.
10. Update `data/projects.json`.

Failed uploads should return a clear error and clean up temporary files.

## Running Projects

Projects are served from `/projects/<slug>/...`. The runner page embeds the entry file in an iframe.

The iframe should use a basic sandbox configuration. Since the target environment is a trusted local family gallery, the first version does not need heavyweight isolation, but project code should not directly control the parent page.

## Error Handling

The app should handle:

- Empty gallery state.
- Uploading a non-zip file.
- Zip packages with no `index.html`.
- Invalid `manifest.json`.
- Duplicate or conflicting project slugs.
- Missing project files after upload.
- Corrupt or unreadable `projects.json`.

Errors should be written in plain, friendly language.

## Testing Strategy

Automated tests should cover:

- Valid zip upload with root `index.html`.
- Valid zip upload with one top-level folder.
- Zip upload with `manifest.json`.
- Rejection when `index.html` is missing.
- Rejection of path traversal entries.
- Project index persistence.

Manual browser verification should cover:

- Uploading a sample project.
- Seeing the new card on the gallery page.
- Opening the project and confirming it runs in the iframe.
- Refreshing the app and confirming the project remains listed.

## Future Enhancements

These are intentionally out of scope for the first version:

- Password protection for `/admin`.
- Delete/edit project management.
- Docker Compose packaging.
- Automatic screenshot generation for covers.
- Support for source projects that need `npm install` and build steps.
- Public internet deployment.
