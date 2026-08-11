const scoreValue = document.getElementById('score-value') as HTMLSpanElement;
const staminaBarFill = document.getElementById('stamina-bar-fill') as HTMLDivElement;
const distanceValue = document.getElementById('distance-value') as HTMLSpanElement;
const eatenValue = document.getElementById('eaten-value') as HTMLSpanElement;
const bestValue = document.getElementById('best-value') as HTMLSpanElement;
const scorePanel = document.querySelector('#hud-top .hud-panel') as HTMLDivElement;
const healthPips = document.getElementById('health-pips') as HTMLDivElement;

export function updateScoreDisplay(score: number) {
  scoreValue.textContent = String(score);
}

export function updateStaminaBar(percent: number) {
  staminaBarFill.style.width = `${percent * 100}%`;
}

export function updateHealthDisplay(health: number, maxHealth: number) {
  healthPips.replaceChildren();
  for (let i = 0; i < maxHealth; i++) {
    const pip = document.createElement('span');
    pip.className = `health-pip${i >= health ? ' lost' : ''}`;
    healthPips.appendChild(pip);
  }
  healthPips.setAttribute('aria-label', `${health} of ${maxHealth} health remaining`);
}

export function showGameOver(score: number, best: number, elapsedSeconds: number) {
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = Math.floor(elapsedSeconds % 60).toString().padStart(2, '0');
  (document.getElementById('final-score') as HTMLElement).textContent = String(score);
  (document.getElementById('final-best') as HTMLElement).textContent = String(best);
  (document.getElementById('final-time') as HTMLElement).textContent = `${minutes}:${seconds}`;
  document.getElementById('game-over')?.classList.remove('overlay-hidden');
}

export function hideGameOver() {
  document.getElementById('game-over')?.classList.add('overlay-hidden');
}

export function updateStatsDisplay(distance: number, eaten: number, best: number) {
  distanceValue.textContent = `${Math.floor(distance)}m`;
  eatenValue.textContent = String(eaten);
  bestValue.textContent = String(best);
}

export function spawnScorePopup(amount: number) {
  const popup = document.createElement('span');
  popup.className = 'score-popup' + (amount < 0 ? ' score-popup-negative' : '');
  popup.textContent = amount > 0 ? `+${amount}` : `${amount}`;
  scorePanel.appendChild(popup);
  setTimeout(() => popup.remove(), 800);
}
