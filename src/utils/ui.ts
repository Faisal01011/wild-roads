const scoreDisplay = document.getElementById('score-display') as HTMLDivElement;

export function updateScoreDisplay(score: number) {
  scoreDisplay.textContent = `Score: ${score}`;
}