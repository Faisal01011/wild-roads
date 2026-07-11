import { input } from './input';

function bindHoldButton(elementId: string, onPress: (pressed: boolean) => void) {
  const el = document.getElementById(elementId);
  if (!el) return;

  // pointerdown/up covers both touch and mouse in one set of listeners
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    onPress(true);
  });

  const release = () => onPress(false);
  el.addEventListener('pointerup', release);
  el.addEventListener('pointerleave', release);
  el.addEventListener('pointercancel', release);
}

export function setupTouchControls() {
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  if (isTouchDevice) {
    document.body.classList.add('is-touch-device');
    document.getElementById('touch-controls')?.classList.add('active');
  }

  bindHoldButton('btn-left', (pressed) => input.setVirtualLeft(pressed));
  bindHoldButton('btn-right', (pressed) => input.setVirtualRight(pressed));
  bindHoldButton('btn-boost', (pressed) => input.setVirtualBoost(pressed));
}