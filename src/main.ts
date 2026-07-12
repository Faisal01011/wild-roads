import './style.css';
import * as THREE from 'three';
import { createScene } from './world/scene';
import { DayNightCycle } from './world/lighting';
import { Snake } from './player/snake';
import { updateCameraFollow } from './world/cameraFollow';
import { ChunkManager } from './world/chunkManager';
import { AnimalManager } from './entities/animalManager';
import { updateScoreDisplay, updateStaminaBar, updateStatsDisplay, spawnScorePopup } from './utils/ui';
import { audioManager } from './utils/audio';
import { preloadAssets } from './utils/assetLoader';
import { setupTouchControls } from './utils/touchControls';
import { triggerShake, spawnEatBurst, updateBursts } from './utils/effects';

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

  const deerManager = new AnimalManager(scene, {
  modelPath: '/models/Deer/Deer.gltf',
  scaleCorrection: 0.42,
  count: 6,
  spawnRadius: 40,
  despawnRadius: 60,
  eatDistance: 1.5,
  points: 1,
  wanderSpeed: 1.0,
  fleeSpeed: 4.5,
  fleeTriggerRadius: 7,
  groundOffset: 0.3,
  wanderAnimationPattern: /^walk$/i,
  fleeAnimationPattern: /^gallop$/i,
});

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

    const pointsEarned = deerManager.update(delta, snake.head.position);

    if (pointsEarned > 0) {
      for (let i = 0; i < pointsEarned; i++) {
        snake.grow(scene);
      }

      score += pointsEarned;
      animalsEaten += 1;

      updateScoreDisplay(score);
      spawnScorePopup(pointsEarned);
      audioManager.playEat();
      triggerShake(0.15);
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