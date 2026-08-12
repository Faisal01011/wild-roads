import type * as THREE from 'three';
import type { QualitySnapshot } from './quality';

const debugEnabled =
  new URLSearchParams(window.location.search).get('debug') === '1' ||
  (() => {
    try {
      return localStorage.getItem('wildroads_debug') === 'true';
    } catch {
      return false;
    }
  })();

let frameCount = 0;
let lastCheck = performance.now();
let currentFps = 0;
let fpsDisplay: HTMLDivElement | null = null;

if (debugEnabled) {
  fpsDisplay = document.createElement('div');
  fpsDisplay.id = 'fps-counter';
  fpsDisplay.textContent = '— FPS';
  fpsDisplay.setAttribute('aria-label', 'Rendering performance');
  document.body.appendChild(fpsDisplay);
}

export function updateFpsCounter(
  quality: QualitySnapshot,
  renderer: THREE.WebGLRenderer
) {
  if (!fpsDisplay) return;

  frameCount += 1;
  const now = performance.now();

  if (now - lastCheck >= 500) {
    currentFps = Math.round((frameCount * 1000) / (now - lastCheck));
    const preference = quality.preference === 'auto'
      ? `AUTO→${quality.tier.toUpperCase()}`
      : quality.tier.toUpperCase();
    const triangles = renderer.info.render.triangles >= 1_000_000
      ? `${(renderer.info.render.triangles / 1_000_000).toFixed(1)}m`
      : `${Math.round(renderer.info.render.triangles / 1000)}k`;
    fpsDisplay.textContent =
      `${currentFps} FPS · ${quality.frameTimeMs.toFixed(1)}ms\n`
      + `${preference} · ${quality.pixelRatio.toFixed(2)}× DPR\n`
      + `${renderer.info.render.calls} calls · ${triangles} tris`;
    fpsDisplay.style.color = currentFps >= 50 ? '#96ad73' : currentFps >= 30 ? '#f2c66d' : '#ed7968';
    frameCount = 0;
    lastCheck = now;
  }
}
