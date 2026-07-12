const scoreValue = document.getElementById('score-value') as HTMLSpanElement;
const staminaBarFill = document.getElementById('stamina-bar-fill') as HTMLDivElement;
const distanceValue = document.getElementById('distance-value') as HTMLSpanElement;
const eatenValue = document.getElementById('eaten-value') as HTMLSpanElement;
const bestValue = document.getElementById('best-value') as HTMLSpanElement;
const scorePanel = document.querySelector('#hud-top .hud-panel') as HTMLDivElement;

export function updateScoreDisplay(score: number) {
  scoreValue.textContent = String(score);
}

export function updateStaminaBar(percent: number) {
  staminaBarFill.style.width = `${percent * 100}%`;
}

export function updateStatsDisplay(distance: number, eaten: number, best: number) {
  distanceValue.textContent = `${Math.floor(distance)}m`;
  eatenValue.textContent = String(eaten);
  bestValue.textContent = String(best);
}

export function spawnScorePopup(amount: number) {
  const popup = document.createElement('span');
  popup.className = 'score-popup';
  popup.textContent = `+${amount}`;
  scorePanel.style.position = 'relative';
  scorePanel.appendChild(popup);
  setTimeout(() => popup.remove(), 800);
}