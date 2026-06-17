const page = document.body.dataset.page;

function createElement(tagName, options = {}) {
  const element = document.createElement(tagName);

  if (options.className) {
    element.className = options.className;
  }

  if (options.text !== undefined) {
    element.textContent = options.text;
  }

  return element;
}

function normalizeText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function safeInitial(title) {
  return normalizeText(title, 'P').slice(0, 1).toUpperCase();
}

function showState(container, title, message) {
  container.replaceChildren();

  const panel = createElement('article', { className: 'state-panel' });
  panel.append(
    createElement('h2', { text: title }),
    createElement('p', { text: message })
  );
  container.append(panel);
}

async function fetchProjects() {
  const response = await fetch('/api/projects');

  if (!response.ok) {
    throw new Error('Could not load projects');
  }

  const payload = await response.json();
  return Array.isArray(payload.projects) ? payload.projects : [];
}

function renderProjectCard(project) {
  const title = normalizeText(project.title, 'Untitled project');
  const description = normalizeText(project.description, 'A fresh project from the studio.');
  const slug = normalizeText(project.slug);
  const card = createElement('article', { className: 'project-card' });

  if (normalizeText(project.cover)) {
    const image = createElement('img', { className: 'project-cover' });
    image.src = project.cover;
    image.alt = `${title} cover`;
    image.loading = 'lazy';
    card.append(image);
  } else {
    card.append(createElement('div', { className: 'project-initial', text: safeInitial(title) }));
  }

  const body = createElement('div', { className: 'project-body' });
  body.append(
    createElement('h2', { text: title }),
    createElement('p', { text: description })
  );

  const tags = Array.isArray(project.tags) ? project.tags.filter((tag) => normalizeText(tag)) : [];
  if (tags.length > 0) {
    const tagList = createElement('div', { className: 'tag-list' });
    for (const tag of tags) {
      tagList.append(createElement('span', { className: 'tag', text: normalizeText(tag) }));
    }
    body.append(tagList);
  }

  const link = createElement('a', { className: 'project-link', text: 'Open project' });
  link.href = slug ? `/runner/${encodeURIComponent(slug)}` : '/';
  body.append(link);
  card.append(body);

  return card;
}

async function initGallery() {
  const gallery = document.querySelector('#gallery');
  if (!gallery) {
    return;
  }

  showState(gallery, 'Loading projects', 'Gathering the latest studio work.');

  try {
    const projects = await fetchProjects();

    if (projects.length === 0) {
      showState(gallery, 'No projects yet', 'Upload a zip from the studio page to start the gallery.');
      return;
    }

    gallery.replaceChildren(...projects.map(renderProjectCard));
  } catch {
    showState(gallery, 'Gallery is taking a breather', 'Refresh the page or try again after the server is running.');
  }
}

function slugFromPath() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'runner') {
    return '';
  }

  try {
    return decodeURIComponent(parts.slice(1).join('/'));
  } catch {
    return '';
  }
}

async function initRunner() {
  const titleElement = document.querySelector('#runner-title');
  const frame = document.querySelector('#project-frame');

  if (!titleElement || !frame) {
    return;
  }

  const slug = slugFromPath();

  if (!slug) {
    titleElement.textContent = 'Project not found';
    frame.removeAttribute('src');
    return;
  }

  try {
    const projects = await fetchProjects();
    const project = projects.find((item) => item.slug === slug);

    if (!project || !normalizeText(project.entryPath)) {
      titleElement.textContent = 'Project not found';
      frame.removeAttribute('src');
      return;
    }

    titleElement.textContent = normalizeText(project.title, 'Untitled project');
    frame.src = project.entryPath;
  } catch {
    titleElement.textContent = 'Could not load this project';
    frame.removeAttribute('src');
  }
}

if (page === 'gallery') {
  initGallery();
}

if (page === 'runner') {
  initRunner();
}
