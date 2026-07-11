const scoreValue = document.getElementById('score-value') as HTMLSpanElement;
const staminaBarFill = document.getElementById('stamina-bar-fill') as HTMLDivElement;

export function updateScoreDisplay(score: number) {
  scoreValue.textContent = String(score);
}

export function updateStaminaBar(percent: number) {
  staminaBarFill.style.width = `${percent * 100}%`;
}