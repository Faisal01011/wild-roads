const debugEnabled =
  new URLSearchParams(window.location.search).get('debug') === '1' ||
  localStorage.getItem('wildroads_debug') === 'true';

let frameCount = 0;
let lastCheck = performance.now();
let currentFps = 0;
let fpsDisplay: HTMLDivElement | null = null;

if (debugEnabled) {
  fpsDisplay = document.createElement('div');
  fpsDisplay.id = 'fps-counter';
  fpsDisplay.textContent = '— FPS';
  fpsDisplay.setAttribute('aria-label', 'Frames per second');
  document.body.appendChild(fpsDisplay);
}

export function updateFpsCounter() {
  if (!fpsDisplay) return;

  frameCount += 1;
  const now = performance.now();

  if (now - lastCheck >= 500) {
    currentFps = Math.round((frameCount * 1000) / (now - lastCheck));
    fpsDisplay.textContent = `${currentFps} FPS`;
    fpsDisplay.style.color = currentFps >= 50 ? '#96ad73' : currentFps >= 30 ? '#f2c66d' : '#ed7968';
    frameCount = 0;
    lastCheck = now;
  }
}
