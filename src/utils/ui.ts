const scoreValue = document.getElementById('score-value') as HTMLSpanElement;
const scorePanel = document.querySelector('.score-card') as HTMLElement;
const staminaMeter = document.getElementById('stamina-meter') as HTMLDivElement;
const staminaValue = document.getElementById('stamina-value') as HTMLSpanElement;
const distanceValue = document.getElementById('distance-value') as HTMLSpanElement;
const eatenValue = document.getElementById('eaten-value') as HTMLSpanElement;
const bestValue = document.getElementById('best-value') as HTMLSpanElement;
const menuBestValue = document.getElementById('menu-best-value') as HTMLSpanElement;
const healthPips = document.getElementById('health-pips') as HTMLDivElement;
const healthCard = document.querySelector('.health-card') as HTMLElement;
const damageVignette = document.getElementById('damage-vignette') as HTMLDivElement;
const buffIndicator = document.getElementById('buff-indicator') as HTMLDivElement;

let scoreAnimationTimer = 0;
let damageAnimationTimer = 0;
let lastBuffState = '';

export interface GameOverStats {
  score: number;
  best: number;
  elapsedSeconds: number;
  distance: number;
  eaten: number;
  newBest: boolean;
}

export interface LoadingProgress {
  loaded: number;
  total: number;
  label: string;
}

export function updateScoreDisplay(score: number) {
  const hasChanged = scoreValue.textContent !== String(score);
  scoreValue.textContent = String(score);

  if (!hasChanged) return;

  window.clearTimeout(scoreAnimationTimer);
  scorePanel.classList.remove('score-changed');
  void scorePanel.offsetWidth;
  scorePanel.classList.add('score-changed');
  scoreAnimationTimer = window.setTimeout(() => scorePanel.classList.remove('score-changed'), 360);
}

export function updateStaminaBar(percent: number) {
  const clamped = Math.min(1, Math.max(0, percent));
  const percentage = Math.round(clamped * 100);
  staminaMeter.style.setProperty('--stamina-angle', `${clamped * 360}deg`);
  staminaValue.textContent = String(percentage);
  staminaMeter.setAttribute('aria-valuenow', String(percentage));
  staminaMeter.setAttribute('aria-valuetext', `${percentage} percent boost remaining`);
}

export function updateHealthDisplay(health: number, maxHealth: number) {
  healthPips.replaceChildren();

  for (let i = 0; i < maxHealth; i++) {
    const pip = document.createElement('span');
    pip.className = `health-pip${i >= health ? ' lost' : ''}`;
    pip.setAttribute('aria-hidden', 'true');
    healthPips.appendChild(pip);
  }

  healthPips.setAttribute('aria-label', `${health} of ${maxHealth} vitality remaining`);
}

export function triggerDamageFeedback() {
  window.clearTimeout(damageAnimationTimer);
  damageVignette.classList.remove('is-active');
  healthCard.classList.remove('is-hit');
  void damageVignette.offsetWidth;
  damageVignette.classList.add('is-active');
  healthCard.classList.add('is-hit');

  damageAnimationTimer = window.setTimeout(() => {
    damageVignette.classList.remove('is-active');
    healthCard.classList.remove('is-hit');
  }, 600);
}

export function showGameOver(stats: GameOverStats) {
  const minutes = Math.floor(stats.elapsedSeconds / 60);
  const seconds = Math.floor(stats.elapsedSeconds % 60).toString().padStart(2, '0');
  const overlay = document.getElementById('game-over');
  const newRecordBadge = document.getElementById('new-record-badge') as HTMLElement;

  (document.getElementById('final-score') as HTMLElement).textContent = String(stats.score);
  (document.getElementById('final-best') as HTMLElement).textContent = String(stats.best);
  (document.getElementById('final-time') as HTMLElement).textContent = `${minutes}:${seconds}`;
  (document.getElementById('final-distance') as HTMLElement).textContent = `${Math.floor(stats.distance)}m`;
  (document.getElementById('final-eaten') as HTMLElement).textContent = String(stats.eaten);
  newRecordBadge.hidden = !stats.newBest;

  updateMenuBestScore(stats.best);
  document.body.classList.add('game-over-active');
  const gameHud = document.getElementById('game-hud');
  if (gameHud) {
    gameHud.inert = true;
    gameHud.setAttribute('aria-hidden', 'true');
  }
  if (overlay) overlay.inert = false;
  overlay?.classList.remove('overlay-hidden');
  overlay?.setAttribute('aria-hidden', 'false');
  window.setTimeout(() => document.getElementById('btn-play-again')?.focus(), 80);
}

export function hideGameOver() {
  const overlay = document.getElementById('game-over');
  document.body.classList.remove('game-over-active');
  if (overlay) overlay.inert = true;
  overlay?.classList.add('overlay-hidden');
  overlay?.setAttribute('aria-hidden', 'true');
}

export function updateStatsDisplay(distance: number, eaten: number, best: number) {
  distanceValue.textContent = `${Math.floor(distance)}m`;
  eatenValue.textContent = String(eaten);
  bestValue.textContent = String(best);
  updateMenuBestScore(best);
}

export function updateMenuBestScore(best: number) {
  menuBestValue.textContent = String(best);
}

export function spawnScorePopup(amount: number) {
  const popup = document.createElement('span');
  popup.className = `score-popup${amount < 0 ? ' score-popup-negative' : ''}`;
  popup.textContent = amount > 0 ? `+${amount}` : `${amount}`;
  popup.setAttribute('aria-hidden', 'true');
  scorePanel.appendChild(popup);
  window.setTimeout(() => popup.remove(), 850);
}

function createBuffToken(kind: 'speed' | 'score', label: string, seconds: number) {
  const token = document.createElement('div');
  token.className = `buff-token buff-token-${kind}`;

  const icon = document.createElement('span');
  icon.className = 'buff-token-icon';
  icon.textContent = kind === 'speed' ? '»' : '2×';
  icon.setAttribute('aria-hidden', 'true');

  const copy = document.createElement('span');
  copy.className = 'buff-token-copy';

  const name = document.createElement('span');
  name.textContent = label;

  const time = document.createElement('span');
  time.className = 'buff-token-time';
  time.textContent = `${seconds.toFixed(1)}s`;

  copy.append(name, time);
  token.append(icon, copy);
  return token;
}

function syncBuffToken(kind: 'speed' | 'score', label: string, seconds: number) {
  let token = buffIndicator.querySelector<HTMLElement>(`.buff-token-${kind}`);

  if (seconds <= 0) {
    token?.remove();
    return;
  }

  if (!token) {
    token = createBuffToken(kind, label, seconds);
    if (kind === 'speed') {
      buffIndicator.prepend(token);
    } else {
      buffIndicator.append(token);
    }
  }

  const time = token.querySelector<HTMLElement>('.buff-token-time');
  if (time) time.textContent = `${seconds.toFixed(1)}s`;
}

export function updateBuffDisplay(speedSecondsLeft: number, multiplierSecondsLeft: number) {
  const buffState = `${Math.max(0, speedSecondsLeft).toFixed(1)}:${Math.max(0, multiplierSecondsLeft).toFixed(1)}`;
  if (buffState === lastBuffState) return;
  lastBuffState = buffState;

  syncBuffToken('speed', 'Trail rush', speedSecondsLeft);
  syncBuffToken('score', 'Double score', multiplierSecondsLeft);
}

export function updateLoadingProgress({ loaded, total, label }: LoadingProgress) {
  const progress = total > 0 ? Math.min(1, loaded / total) : 0;
  const percentage = Math.round(progress * 100);
  const progressElement = document.getElementById('loading-progress') as HTMLElement;
  const progressFill = document.getElementById('loading-progress-fill') as HTMLElement;

  progressFill.style.width = `${percentage}%`;
  progressElement.setAttribute('aria-valuenow', String(percentage));
  (document.getElementById('loading-percentage') as HTMLElement).textContent = `${percentage}%`;
  (document.getElementById('loading-detail') as HTMLElement).textContent = label;

  const status =
    percentage < 25
      ? 'Reading the trail'
      : percentage < 55
        ? 'Growing the forest'
        : percentage < 85
          ? 'Waking the wilderness'
          : 'Opening the wild';

  (document.getElementById('loading-status') as HTMLElement).textContent = status;
}

export function showLoadingError() {
  const loadingScreen = document.getElementById('loading-screen');
  loadingScreen?.classList.add('has-error');
  loadingScreen?.setAttribute('aria-busy', 'false');
  (document.getElementById('loading-status') as HTMLElement).textContent = 'Trail blocked';
  (document.getElementById('loading-detail') as HTMLElement).textContent =
    'Some wilderness assets could not be loaded. Check your connection and try again.';
}
