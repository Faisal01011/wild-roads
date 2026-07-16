import './style.css';
import * as THREE from 'three';
import { injectSpeedInsights } from '@vercel/speed-insights';
import { createScene } from './world/scene';
import { DayNightCycle } from './world/lighting';
import { SkyObjects } from './world/sky';
import { Snake } from './player/snake';
import { updateCameraFollow } from './world/cameraFollow';
import { ChunkManager } from './world/chunkManager';
import { updateGrassTrample } from './world/chunk';
import { AnimalManager } from './entities/animalManager';
import { updateScoreDisplay, updateStaminaBar, updateStatsDisplay, spawnScorePopup } from './utils/ui';
import { audioManager } from './utils/audio';
import { preloadAssets } from './utils/assetLoader';
import type { GameAssets } from './utils/assetLoader';
import { setupTouchControls } from './utils/touchControls';
import { triggerShake, spawnEatBurst, updateBursts } from './utils/effects';
import { updateFpsCounter } from './utils/fpsCounter';

// Initialize Vercel Speed Insights
injectSpeedInsights();

const BEST_SCORE_KEY = 'wildroads_best_score';

let isPaused = false;
let gameStarted = false;

function showMenu(mode: 'start' | 'pause') {
  const menu = document.getElementById('main-menu');
  const btnPlay = document.getElementById('btn-play');
  const btnResume = document.getElementById('btn-resume');

  if (menu) {
    menu.style.display = 'flex';
    void menu.offsetWidth;
    menu.classList.remove('hidden');
  }

  if (mode === 'pause') {
    btnPlay?.classList.add('menu-btn-hidden');
    btnResume?.classList.remove('menu-btn-hidden');
  } else {
    btnPlay?.classList.remove('menu-btn-hidden');
    btnResume?.classList.add('menu-btn-hidden');
  }
}

function hideMenu() {
  const menu = document.getElementById('main-menu');
  menu?.classList.add('hidden');
  setTimeout(() => {
    if (menu) menu.style.display = 'none';
  }, 500);
}

function setupMainMenu(onPlay: () => void, onResume: () => void) {
  const panelMain = document.getElementById('menu-panel-main');
  const panelOptions = document.getElementById('menu-panel-options');
  const btnPlay = document.getElementById('btn-play');
  const btnResume = document.getElementById('btn-resume');
  const btnOptions = document.getElementById('btn-options');
  const btnBack = document.getElementById('btn-back');
  const btnToggleSound = document.getElementById('btn-toggle-sound');

  btnOptions?.addEventListener('click', () => {
    panelMain?.classList.add('menu-panel-hidden');
    panelOptions?.classList.remove('menu-panel-hidden');
  });

  btnBack?.addEventListener('click', () => {
    panelOptions?.classList.add('menu-panel-hidden');
    panelMain?.classList.remove('menu-panel-hidden');
  });

  btnToggleSound?.addEventListener('click', () => {
    const muted = audioManager.toggleMute();
    if (btnToggleSound) {
      btnToggleSound.textContent = muted ? 'Sound: Off' : 'Sound: On';
    }
  });

  btnPlay?.addEventListener('click', () => {
    audioManager.startAmbient();
    hideMenu();
    onPlay();
  });

  btnResume?.addEventListener('click', () => {
    isPaused = false;
    hideMenu();
    onResume();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && gameStarted) {
      if (isPaused) {
        isPaused = false;
        hideMenu();
        onResume();
      } else {
        isPaused = true;
        showMenu('pause');
      }
    }
  });
}

async function start() {
  const assets = await preloadAssets();

  const loadingScreen = document.getElementById('loading-screen');
  loadingScreen?.classList.add('hidden');
  setTimeout(() => {
    if (loadingScreen) loadingScreen.style.display = 'none';
  }, 700);

  setupMainMenu(
    () => beginGame(assets),
    () => {}
  );
}

function beginGame(assets: GameAssets) {
  gameStarted = true;

  const { scene, camera, renderer } = createScene();
  renderer.shadowMap.enabled = true;

  const dayNightCycle = new DayNightCycle(scene);
  const skyObjects = new SkyObjects(scene);

  const snake = new Snake();
  snake.addToScene(scene);
  setupTouchControls();

  const chunkManager = new ChunkManager(scene, assets);

  const deerManager = new AnimalManager(scene, {
    modelPath: '/models/Deer/Deer.gltf',
    scaleCorrection: 0.42,
    count: 12,
    spawnRadius: 20,
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

  const wolfManager = new AnimalManager(scene, {
    modelPath: '/models/Wolf/Wolf.gltf',
    scaleCorrection: 0.41,
    count: 3,
    spawnRadius: 50,
    despawnRadius: 65,
    eatDistance: 0, // unused for predators
    points: 0, // unused for predators
    wanderSpeed: 0.9,
    fleeSpeed: 5.5,
    fleeTriggerRadius: 9,
    groundOffset: 0.25,
    wanderAnimationPattern: /^walk$/i,
    fleeAnimationPattern: /^gallop$/i,      // chase animation
    attackAnimationPattern: /^attack$/i,    // bite animation, played on catch
    isPredator: true,
    catchDistance: 1.3,
    attackCooldownSeconds: 2.5,
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

    if (isPaused) {
      renderer.render(scene, camera);
      return;
    }

    const delta = clock.getDelta();
    elapsedTime += delta;

    updateFpsCounter();

    dayNightCycle.update(delta);
    skyObjects.update(delta, dayNightCycle.sunAngle, dayNightCycle.sunHeightFactor, snake.head.position);

    const rockColliders = chunkManager.getRockColliders();
    snake.update(delta, rockColliders);
    updateCameraFollow(camera, snake, delta);
    chunkManager.update(snake.head.position);

    if (Math.floor(elapsedTime * 20) !== Math.floor((elapsedTime - delta) * 20)) {
      chunkManager.updateWind(elapsedTime);
    }

    updateGrassTrample(snake.head.position);

    distanceTraveled += previousHeadPosition.distanceTo(snake.head.position);
    previousHeadPosition.copy(snake.head.position);

    const deerResult = deerManager.update(delta, snake.head.position);
    const wolfResult = wolfManager.update(delta, snake.head.position);

    if (deerResult.eatenPoints > 0) {
      for (let i = 0; i < deerResult.eatenPoints; i++) {
        snake.grow(scene);
      }

      score += deerResult.eatenPoints;
      animalsEaten += 1;

      updateScoreDisplay(score);
      spawnScorePopup(deerResult.eatenPoints);
      audioManager.playEat();
      triggerShake(0.15);
      spawnEatBurst(scene, snake.head.position);

      if (score > bestScore) {
        bestScore = score;
        localStorage.setItem(BEST_SCORE_KEY, String(bestScore));
      }
    }

    if (wolfResult.attacks > 0) {
      snake.shrink(scene, wolfResult.attacks);
      score = Math.max(0, score - wolfResult.attacks);

      updateScoreDisplay(score);
      spawnScorePopup(-wolfResult.attacks);
      triggerShake(0.35);
    }

    updateBursts(scene, delta);
    updateStaminaBar(snake.staminaPercent);
    updateStatsDisplay(distanceTraveled, animalsEaten, bestScore);

    renderer.render(scene, camera);
  }

  animate();
}

start();