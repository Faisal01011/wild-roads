import './style.css';
import * as THREE from 'three';
import { injectSpeedInsights } from '@vercel/speed-insights';
import { createScene } from './world/scene';
import { DayNightCycle, getAtmosphereDebugOptions } from './world/lighting';
import { SkyObjects } from './world/sky';
import { HorizonLandmarks } from './world/horizonLandmarks';
import { BIOME_IDS, getBiomeDebugPosition } from './world/biomes';
import type { BiomeId } from './world/biomes';
import { Snake } from './player/snake';
import { CameraFollowRig } from './world/cameraFollow';
import { ChunkManager } from './world/chunkManager';
import { updateGrassTrample } from './world/chunk';
import { AnimalManager } from './entities/animalManager';
import {
  hideGameOver,
  showGameOver,
  showLoadingError,
  spawnScorePopup,
  triggerDamageFeedback,
  updateBuffDisplay,
  updateHealthDisplay,
  updateLoadingProgress,
  updateMenuBestScore,
  updateScoreDisplay,
  updateStaminaBar,
  updateStatsDisplay,
} from './utils/ui';
import { audioManager } from './utils/audio';
import { preloadAssets } from './utils/assetLoader';
import type { GameAssets } from './utils/assetLoader';
import { setupTouchControls } from './utils/touchControls';
import {
  disposeBursts,
  setEffectsReducedMotion,
  spawnEatBurst,
  triggerShake,
  updateBursts,
} from './utils/effects';
import { updateFpsCounter } from './utils/fpsCounter';
import { input } from './utils/input';
import {
  getReducedMotion,
  subscribeMotionPreference,
  toggleReducedMotionPreference,
} from './utils/motionPreference';

// Initialize Vercel Speed Insights
injectSpeedInsights();

const BEST_SCORE_KEY = 'wildroads_best_score';
const MAX_HEALTH = 3;
const DAMAGE_INVULNERABILITY_SECONDS = 1;
const MAX_FRAME_DELTA = 0.05;

function getBiomeDebugStart(): THREE.Vector2 | null {
  const params = new URLSearchParams(window.location.search);
  const biome = params.get('biome');
  if (params.get('debug') !== '1' || !biome || !BIOME_IDS.includes(biome as BiomeId)) {
    return null;
  }
  return getBiomeDebugPosition(biome as BiomeId);
}

function getPlayerDebugOptions() {
  const parameters = new URLSearchParams(window.location.search);
  if (parameters.get('debug') !== '1') {
    return { longSnake: false, forceBoost: false, showHit: false };
  }
  return {
    longSnake: parameters.get('snake') === 'long',
    forceBoost: parameters.get('boost') === '1',
    showHit: parameters.get('hit') === '1',
  };
}

let isPaused = false;
let gameStarted = false;
let menuHideTimer = 0;

interface GameSession {
  pause: () => void;
  resume: () => void;
  setReducedMotion: (reduced: boolean) => void;
  destroy: () => void;
}

let activeSession: GameSession | null = null;

function applyMotionPreference(reduced: boolean) {
  document.body.classList.toggle('reduce-motion', reduced);
  setEffectsReducedMotion(reduced);
  activeSession?.setReducedMotion(reduced);

  const button = document.getElementById('btn-toggle-motion');
  const status = document.getElementById('motion-setting-status');
  button?.setAttribute('aria-pressed', String(reduced));
  if (status) status.textContent = reduced ? 'Reduced' : 'Full';
}

function showMenu(mode: 'start' | 'pause') {
  const menu = document.getElementById('main-menu');
  const btnPlay = document.getElementById('btn-play');
  const btnResume = document.getElementById('btn-resume');
  const panelMain = document.getElementById('menu-panel-main');
  const panelOptions = document.getElementById('menu-panel-options');
  const menuKicker = document.getElementById('menu-kicker');
  const menuHeading = document.getElementById('menu-heading');
  const menuDescription = document.getElementById('menu-description');
  const menuPanelLabel = document.getElementById('menu-panel-label');
  window.clearTimeout(menuHideTimer);

  if (menu) {
    menu.style.display = 'grid';
    menu.inert = false;
    void menu.offsetWidth;
    menu.classList.remove('hidden');
    menu.setAttribute('aria-hidden', 'false');
  }

  panelMain?.classList.remove('menu-panel-hidden');
  panelOptions?.classList.add('menu-panel-hidden');
  const gameHud = document.getElementById('game-hud');
  if (gameHud) {
    gameHud.inert = true;
    gameHud.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.add('menu-open');
  document.body.classList.toggle('menu-is-pause', mode === 'pause');

  if (mode === 'pause') {
    btnPlay?.classList.add('menu-button-hidden');
    btnResume?.classList.remove('menu-button-hidden');
    if (menuKicker) menuKicker.textContent = 'A quiet moment';
    if (menuHeading) menuHeading.textContent = 'Trail paused.';
    if (menuDescription) {
      menuDescription.textContent = 'The wilderness will wait. Return when you are ready to keep moving.';
    }
    if (menuPanelLabel) menuPanelLabel.textContent = 'Pause menu';
  } else {
    btnPlay?.classList.remove('menu-button-hidden');
    btnResume?.classList.add('menu-button-hidden');
    if (menuKicker) menuKicker.textContent = 'The trail is calling';
    if (menuHeading) menuHeading.textContent = 'Enter the untamed.';
    if (menuDescription) {
      menuDescription.textContent =
        'Follow the winding trail, hunt through the undergrowth, and grow strong enough to outlast what hunts you.';
    }
    if (menuPanelLabel) menuPanelLabel.textContent = 'Begin a new run';
  }

  window.setTimeout(() => (mode === 'pause' ? btnResume : btnPlay)?.focus(), 80);
}

function hideMenu() {
  const menu = document.getElementById('main-menu');
  menu?.classList.add('hidden');
  menu?.setAttribute('aria-hidden', 'true');
  if (menu) menu.inert = true;
  const gameHud = document.getElementById('game-hud');
  if (gameHud && gameStarted) {
    gameHud.inert = false;
    gameHud.setAttribute('aria-hidden', 'false');
  }
  document.body.classList.remove('menu-open', 'menu-is-pause');
  menuHideTimer = window.setTimeout(() => {
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
  const btnToggleMotion = document.getElementById('btn-toggle-motion');
  const btnPause = document.getElementById('btn-pause');
  const menuPanelLabel = document.getElementById('menu-panel-label');
  const soundSettingStatus = document.getElementById('sound-setting-status');

  const updateSoundSetting = () => {
    const muted = audioManager.isMuted();
    btnToggleSound?.setAttribute('aria-pressed', String(muted));
    if (soundSettingStatus) soundSettingStatus.textContent = muted ? 'Muted' : 'On';
  };

  const pauseGame = () => {
    if (!gameStarted || isPaused) return;
    isPaused = true;
    activeSession?.pause();
    showMenu('pause');
  };

  const resumeGame = () => {
    if (!gameStarted || !isPaused) return;
    isPaused = false;
    hideMenu();
    onResume();
  };

  btnOptions?.addEventListener('click', () => {
    panelMain?.classList.add('menu-panel-hidden');
    panelOptions?.classList.remove('menu-panel-hidden');
    if (menuPanelLabel) menuPanelLabel.textContent = 'Settings';
    window.setTimeout(() => btnToggleSound?.focus(), 50);
  });

  btnBack?.addEventListener('click', () => {
    panelOptions?.classList.add('menu-panel-hidden');
    panelMain?.classList.remove('menu-panel-hidden');
    if (menuPanelLabel) menuPanelLabel.textContent = isPaused ? 'Pause menu' : 'Begin a new run';
    window.setTimeout(() => btnOptions?.focus(), 50);
  });

  btnToggleSound?.addEventListener('click', () => {
    audioManager.toggleMute();
    updateSoundSetting();
  });

  btnToggleMotion?.addEventListener('click', () => {
    toggleReducedMotionPreference();
  });

  btnPlay?.addEventListener('click', () => {
    audioManager.startAmbient();
    hideMenu();
    onPlay();
  });

  btnResume?.addEventListener('click', resumeGame);
  btnPause?.addEventListener('click', pauseGame);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && gameStarted) {
      if (isPaused) {
        resumeGame();
      } else {
        pauseGame();
      }
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;

    const gameOver = document.getElementById('game-over');
    const mainMenu = document.getElementById('main-menu');
    const activeDialog = gameOver && !gameOver.classList.contains('overlay-hidden') ? gameOver : mainMenu;

    if (!activeDialog || activeDialog.inert || activeDialog.classList.contains('hidden')) return;

    const focusable = Array.from(
      activeDialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')
    ).filter((element) => element.getClientRects().length > 0);

    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey && (activeElement === first || !activeDialog.contains(activeElement))) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && (activeElement === last || !activeDialog.contains(activeElement))) {
      event.preventDefault();
      first?.focus();
    }
  });

  updateSoundSetting();
}

async function start() {
  document.getElementById('btn-retry-load')?.addEventListener('click', () => window.location.reload());
  updateMenuBestScore(Number(localStorage.getItem(BEST_SCORE_KEY) ?? 0));
  subscribeMotionPreference(applyMotionPreference);
  applyMotionPreference(getReducedMotion());
  setupTouchControls();

  const assets = await preloadAssets(updateLoadingProgress);

  setupMainMenu(
    () => {
      activeSession?.destroy();
      activeSession = beginGame(assets);
    },
    () => activeSession?.resume()
  );

  showMenu('start');

  const loadingScreen = document.getElementById('loading-screen');
  loadingScreen?.setAttribute('aria-busy', 'false');
  loadingScreen?.classList.add('hidden');
  window.setTimeout(() => {
    if (loadingScreen) loadingScreen.style.display = 'none';
  }, 850);

  document.getElementById('btn-play-again')?.addEventListener('click', () => {
    hideGameOver();
    activeSession?.destroy();
    activeSession = beginGame(assets);
  });

  document.getElementById('btn-return-menu')?.addEventListener('click', () => {
    hideGameOver();
    activeSession?.destroy();
    activeSession = null;
    gameStarted = false;
    isPaused = false;
    document.body.classList.remove('game-active');
    showMenu('start');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameStarted && !isPaused) {
      isPaused = true;
      activeSession?.pause();
      showMenu('pause');
    }
  });
}

function beginGame(assets: GameAssets): GameSession {
  gameStarted = true;
  isPaused = false;
  hideGameOver();
  document.body.classList.add('game-active');
  const gameHud = document.getElementById('game-hud');
  if (gameHud) {
    gameHud.inert = false;
    gameHud.setAttribute('aria-hidden', 'false');
  }
  input.reset();

  const { scene, camera, renderer, dispose: disposeScene } = createScene();

  const dayNightCycle = new DayNightCycle(scene, renderer, getAtmosphereDebugOptions());
  const skyObjects = new SkyObjects(scene);
  const horizonLandmarks = new HorizonLandmarks(scene);

  const reducedMotion = getReducedMotion();
  const snake = new Snake({ reducedMotion });
  const biomeDebugStart = getBiomeDebugStart();
  if (biomeDebugStart) snake.setStartPosition(biomeDebugStart.x, biomeDebugStart.y);
  snake.addToScene(scene);
  const playerDebugOptions = getPlayerDebugOptions();
  if (playerDebugOptions.longSnake) {
    while (snake.length < 16) snake.grow(scene);
    snake.setStartPosition(snake.head.position.x, snake.head.position.z);
  }
  if (playerDebugOptions.forceBoost) input.setVirtualBoost(true);
  if (playerDebugOptions.showHit) snake.triggerHit(8);
  skyObjects.update(0, dayNightCycle.currentFrame, snake.head.position);
  horizonLandmarks.update(snake.head.position);
  setupTouchControls();

  const chunkManager = new ChunkManager(scene, assets);
  chunkManager.update(snake.head.position);
  const cameraRig = new CameraFollowRig(camera, reducedMotion);
  cameraRig.snapToSnake(snake, chunkManager.getTerrainColliders());

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
    spawnClearRadius: 1.1,
    isSpawnPositionClear: (position, radius) =>
      chunkManager.isPositionClear(position.x, position.z, radius),
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
    fleeAnimationPattern: /^gallop$/i,
    attackAnimationPattern: /^attack$/i,
    isPredator: true,
    catchDistance: 1.3,
    attackCooldownSeconds: 2.5,
    spawnClearRadius: 1.2,
    isSpawnPositionClear: (position, radius) =>
      chunkManager.isPositionClear(position.x, position.z, radius),
  });
  let score = 0;
  let health = MAX_HEALTH;
  let damageInvulnerabilityTimer = 0;
  let animalsEaten = 0;
  let distanceTraveled = 0;
  let bestScore = Number(localStorage.getItem(BEST_SCORE_KEY) ?? 0);
  let achievedNewBest = false;

  let scoreMultiplier = 1;
  let scoreMultiplierTimer = 0;

  updateScoreDisplay(score);
  updateHealthDisplay(health, MAX_HEALTH);
  updateStaminaBar(1);
  updateStatsDisplay(distanceTraveled, animalsEaten, bestScore);

  const clock = new THREE.Clock();
  let elapsedTime = 0;
  let previousHeadPosition = snake.head.position.clone();
  let animationFrameId = 0;
  let destroyed = false;
  let ended = false;

  const finishRun = () => {
    ended = true;
    gameStarted = false;
    input.reset();
    updateBuffDisplay(0, 0);
    showGameOver({
      score,
      best: bestScore,
      elapsedSeconds: elapsedTime,
      distance: distanceTraveled,
      eaten: animalsEaten,
      newBest: achievedNewBest,
    });
  };

  function animate() {
    if (destroyed || ended) return;
    animationFrameId = requestAnimationFrame(animate);

    if (isPaused) {
      renderer.render(scene, camera);
      return;
    }

    const delta = Math.min(clock.getDelta(), MAX_FRAME_DELTA);
    elapsedTime += delta;

    updateFpsCounter();

    const atmosphere = dayNightCycle.update(delta, snake.head.position);
    skyObjects.update(delta, atmosphere, snake.head.position);
    horizonLandmarks.update(snake.head.position);

    chunkManager.update(snake.head.position);
    const terrainColliders = chunkManager.getTerrainColliders();
    snake.update(delta, terrainColliders);
    cameraRig.update(snake, delta, terrainColliders);

    if (Math.floor(elapsedTime * 20) !== Math.floor((elapsedTime - delta) * 20)) {
      chunkManager.updateWind(elapsedTime);
    }

    updateGrassTrample(snake.head.position);
    chunkManager.updateCollectibleAnimations(elapsedTime);

    const collected = chunkManager.checkCollectibleCollisions(snake.head.position);
    for (const item of collected) {
      if (item.type === 'speed') {
        snake.applySpeedBoost(5, 1.6);
      } else if (item.type === 'stamina') {
        snake.refillStamina(50);
      } else if (item.type === 'score') {
        scoreMultiplier = 2;
        scoreMultiplierTimer = 10;
      }
      triggerShake(0.1);
      audioManager.playEat();
    }

    if (scoreMultiplierTimer > 0) {
      scoreMultiplierTimer = Math.max(0, scoreMultiplierTimer - delta);
      if (scoreMultiplierTimer <= 0) {
        scoreMultiplier = 1;
      }
    }

    updateBuffDisplay(snake.speedBoostSecondsRemaining, scoreMultiplierTimer);

    distanceTraveled += previousHeadPosition.distanceTo(snake.head.position);
    previousHeadPosition.copy(snake.head.position);

    const deerResult = deerManager.update(delta, snake.head.position);
    const wolfResult = wolfManager.update(delta, snake.head.position);

    damageInvulnerabilityTimer = Math.max(0, damageInvulnerabilityTimer - delta);

    if (deerResult.eatenPoints > 0) {
      for (let i = 0; i < deerResult.eatenPoints; i++) {
        snake.grow(scene);
      }

      score += deerResult.eatenPoints * scoreMultiplier;
      animalsEaten += 1;

      updateScoreDisplay(score);
      spawnScorePopup(deerResult.eatenPoints * scoreMultiplier);
      audioManager.playEat();
      triggerShake(0.15);
      spawnEatBurst(scene, snake.head.position);

      if (score > bestScore) {
        bestScore = score;
        achievedNewBest = true;
        localStorage.setItem(BEST_SCORE_KEY, String(bestScore));
      }
    }

    if (wolfResult.attacks > 0 && damageInvulnerabilityTimer <= 0) {
      const damage = 1;
      health = Math.max(0, health - damage);
      damageInvulnerabilityTimer = DAMAGE_INVULNERABILITY_SECONDS;
      snake.triggerHit(DAMAGE_INVULNERABILITY_SECONDS);
      snake.shrink(scene, damage);
      score = Math.max(0, score - damage);

      updateScoreDisplay(score);
      updateHealthDisplay(health, MAX_HEALTH);
      triggerDamageFeedback();
      spawnScorePopup(-damage);
      triggerShake(0.35);

      if (health === 0) {
        renderer.render(scene, camera);
        finishRun();
        return;
      }
    }

    updateBursts(scene, delta);
    updateStaminaBar(snake.staminaPercent);
    updateStatsDisplay(distanceTraveled, animalsEaten, bestScore);

    renderer.render(scene, camera);
  }

  animate();

  return {
    pause() {
      if (destroyed || ended) return;
      input.reset();
      clock.stop();
    },
    resume() {
      if (destroyed || ended) return;
      clock.start();
    },
    setReducedMotion(reduced: boolean) {
      if (destroyed) return;
      snake.setReducedMotion(reduced);
      cameraRig.setReducedMotion(reduced);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(animationFrameId);
      deerManager.dispose();
      wolfManager.dispose();
      chunkManager.dispose();
      horizonLandmarks.dispose();
      skyObjects.dispose();
      dayNightCycle.dispose();
      disposeBursts(scene);
      snake.dispose(scene);
      input.reset();
      updateBuffDisplay(0, 0);
      disposeScene();
    },
  };
}

void start().catch((error) => {
  console.error('Wild Roads failed to initialize:', error);
  showLoadingError();
});
