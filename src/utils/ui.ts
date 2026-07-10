const scoreDisplay = document.getElementById('score-display') as HTMLDivElement;
const staminaBarFill = document.getElementById('stamina-bar-fill') as HTMLDivElement;

export function updateScoreDisplay(score: number) {
  scoreDisplay.textContent = `Score: ${score}`;
}

export function updateStaminaBar(percent: number) {
  staminaBarFill.style.width = `${percent * 100}%`;
}