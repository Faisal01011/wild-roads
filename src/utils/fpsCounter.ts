let frameCount = 0;
let lastCheck = performance.now();
let currentFps = 0;

const fpsDisplay = document.createElement('div');
fpsDisplay.id = 'fps-counter';
fpsDisplay.style.cssText = `
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.6);
  color: #0f0;
  font-family: monospace;
  font-size: 14px;
  padding: 4px 10px;
  border-radius: 4px;
  z-index: 50;
  pointer-events: none;
`;
document.body.appendChild(fpsDisplay);

export function updateFpsCounter() {
  frameCount++;
  const now = performance.now();
  if (now - lastCheck >= 500) {
    currentFps = Math.round((frameCount * 1000) / (now - lastCheck));
    fpsDisplay.textContent = `${currentFps} FPS`;
    fpsDisplay.style.color = currentFps >= 50 ? '#4caf50' : currentFps >= 30 ? '#ffb300' : '#f44336';
    frameCount = 0;
    lastCheck = now;
  }
}