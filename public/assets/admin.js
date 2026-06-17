const form = document.querySelector('#upload-form');
const statusElement = document.querySelector('#upload-status');

function setStatus(message, type = '') {
  if (!statusElement) {
    return;
  }

  statusElement.textContent = message;
  statusElement.className = type ? `form-status ${type}` : 'form-status';
}

async function readErrorMessage(response) {
  try {
    const payload = await response.json();
    return typeof payload.error === 'string' && payload.error.trim()
      ? payload.error.trim()
      : 'Upload failed';
  } catch {
    return 'Upload failed';
  }
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const submitButton = form.querySelector('button[type="submit"]');
  const formData = new FormData(form);

  setStatus('Uploading project...');
  submitButton.disabled = true;

  try {
    const response = await fetch('/api/projects', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    const payload = await response.json();
    const slug = payload.project?.slug;

    if (!slug) {
      throw new Error('Upload finished, but the project slug was missing');
    }

    setStatus('Upload complete. Opening project...', 'success');
    window.location.assign(`/runner/${encodeURIComponent(slug)}`);
  } catch (error) {
    setStatus(error.message || 'Upload failed', 'error');
    submitButton.disabled = false;
  }
});
