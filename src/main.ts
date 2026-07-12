import './style.css';
import * as THREE from 'three';
import { createScene } from './world/scene';
import { DayNightCycle } from './world/lighting';
import { Snake } from './player/snake';
import { updateCameraFollow } from './world/cameraFollow';
import { ChunkManager } from './world/chunkManager';
import { RabbitManager } from './entities/rabbitManager';
import { BirdManager } from './entities/birdManager';
import { updateScoreDisplay, updateStaminaBar, updateStatsDisplay, spawnScorePopup } from './utils/ui';
import { audioManager } from './utils/audio';
import { preloadAssets } from './utils/assetLoader';
import { setupTouchControls } from './utils/touchControls';
import { triggerShake, spawnEatBurst, updateBursts } from './utils/effects';

const RABBIT_POINTS = 1;
const BIRD_POINTS = 2;
const BEST_SCORE_KEY = 'wildroads_best_score';

async function start() {
  const assets = await preloadAssets();

  document.getElementById('loading-screen')?.classList.add('hidden');

  const { scene, camera, renderer } = createScene();
  renderer.shadowMap.enabled = true;

  const dayNightCycle = new DayNightCycle(scene);

  const snake = new Snake();
  snake.addToScene(scene);
  setupTouchControls();

  const chunkManager = new ChunkManager(scene, assets);
  const rabbitManager = new RabbitManager(scene, assets.rabbit);
  const birdManager = new BirdManager(scene, assets.gull);

  let score = 0;
  let animalsEaten = 0;
  let distanceTraveled = 0;
  let bestScore = Number(localStorage.getItem(BEST_SCORE_KEY) ?? 0);

  updateScoreDisplay(score);
  updateStatsDisplay(distanceTraveled, animalsEaten, bestScore);

  const clock = new THREE.Clock();
  let elapsedTime = 0;
  let previousHeadPosition = snake.head.position.clone();

  function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    elapsedTime += delta;

    dayNightCycle.update(delta);
    const rockColliders = chunkManager.getRockColliders();
    snake.update(delta, rockColliders);
    updateCameraFollow(camera, snake, delta);
    chunkManager.update(snake.head.position);
    chunkManager.updateWind(elapsedTime);

    distanceTraveled += previousHeadPosition.distanceTo(snake.head.position);
    previousHeadPosition.copy(snake.head.position);

    const eatenRabbits = rabbitManager.update(delta, snake.head.position);
    const eatenBirds = birdManager.update(delta, snake.head.position);

    if (eatenRabbits > 0 || eatenBirds > 0) {
      const pointsEarned = eatenRabbits * RABBIT_POINTS + eatenBirds * BIRD_POINTS;

      for (let i = 0; i < pointsEarned; i++) {
        snake.grow(scene);
      }

      score += pointsEarned;
      animalsEaten += eatenRabbits + eatenBirds;

      updateScoreDisplay(score);
      spawnScorePopup(pointsEarned);
      audioManager.playEat();
      triggerShake(0.12);
      spawnEatBurst(scene, snake.head.position);

      if (score > bestScore) {
        bestScore = score;
        localStorage.setItem(BEST_SCORE_KEY, String(bestScore));
      }
    }

    updateBursts(scene, delta);
    updateStaminaBar(snake.staminaPercent);
    updateStatsDisplay(distanceTraveled, animalsEaten, bestScore);

    renderer.render(scene, camera);
  }

  animate();
}

start();