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
import type { AnimalState } from './entities/animatedAnimal';
import { WildlifeEffects } from './entities/wildlifeEffects';
import type { WildlifeVariant } from './entities/wildlifeTypes';
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
  setEffectsQuality,
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
import { ThreatIndicatorController } from './utils/threatIndicators';
import {
  getInitialQualityProfile,
  getQualityPreference,
  RuntimeQualityController,
  setQualityPreference,
  subscribeQualityPreference,
} from './utils/quality';
import type { QualityPreference, QualityProfile, QualityTier } from './utils/quality';

// Initialize Vercel Speed Insights
injectSpeedInsights();

const BEST_SCORE_KEY = 'wildroads_best_score';
const MAX_HEALTH = 3;
const DAMAGE_INVULNERABILITY_SECONDS = 1;
const MAX_FRAME_DELTA = 0.05;

const DEER_VARIANTS: readonly WildlifeVariant[] = [
  { name: 'Chestnut', tint: 0x9b5a34, tintStrength: 0.16, scale: 0.96, accent: 0xe7b36f },
  { name: 'Pale fallow', tint: 0xc5a276, tintStrength: 0.2, scale: 1.04, accent: 0xf1cf8a },
  { name: 'Deep umber', tint: 0x533126, tintStrength: 0.18, scale: 1, accent: 0xcf8b5b },
] as const;

const WOLF_VARIANTS: readonly WildlifeVariant[] = [
  { name: 'Slate hunter', tint: 0x53615c, tintStrength: 0.17, scale: 0.97, accent: 0xed955c },
  { name: 'Russet hunter', tint: 0x704432, tintStrength: 0.2, scale: 1.05, accent: 0xf07a58 },
  { name: 'Night hunter', tint: 0x242d2d, tintStrength: 0.24, scale: 1, accent: 0xff725d },
] as const;

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

interface WildlifeDebugOptions {
  deerCount: number;
  wolfCount: number;
  deerOffsets?: readonly THREE.Vector2[];
  wolfOffsets?: readonly THREE.Vector2[];
  deerState?: AnimalState;
  wolfState?: AnimalState;
  lockDeerState: boolean;
  lockWolfState: boolean;
  disableCombatGrace: boolean;
}

function getWildlifeDebugOptions(): WildlifeDebugOptions {
  const parameters = new URLSearchParams(window.location.search);
  if (parameters.get('debug') !== '1') {
    return {
      deerCount: 12,
      wolfCount: 3,
      lockDeerState: false,
      lockWolfState: false,
      disableCombatGrace: false,
    };
  }

  const wildlife = parameters.get('wildlife');
  const combat = parameters.get('combat');
  const combatState: Record<string, AnimalState> = {
    alert: 'alert',
    hunt: 'panic',
    windup: 'windup',
    strike: 'strike',
    attack: 'windup',
  };

  if (combat && combatState[combat]) {
    return {
      deerCount: 0,
      wolfCount: 1,
      wolfOffsets: [new THREE.Vector2(combat === 'attack' ? 0.6 : 2.8, combat === 'attack' ? 2.4 : 6.2)],
      wolfState: combatState[combat],
      lockDeerState: false,
      lockWolfState: combat !== 'attack',
      disableCombatGrace: true,
    };
  }

  if (wildlife === 'herd') {
    return {
      deerCount: 5,
      wolfCount: 0,
      deerOffsets: [
        new THREE.Vector2(-4.2, 7.2),
        new THREE.Vector2(-1.5, 9.4),
        new THREE.Vector2(1.6, 8.3),
        new THREE.Vector2(4.5, 10.2),
        new THREE.Vector2(5.8, 6.6),
      ],
      lockDeerState: false,
      lockWolfState: false,
      disableCombatGrace: false,
    };
  }

  if (wildlife === 'graze') {
    return {
      deerCount: 3,
      wolfCount: 0,
      deerOffsets: [
        new THREE.Vector2(-4.5, 8.5),
        new THREE.Vector2(0.5, 10.8),
        new THREE.Vector2(5.2, 8.1),
      ],
      deerState: 'graze',
      lockDeerState: true,
      lockWolfState: false,
      disableCombatGrace: false,
    };
  }

  return {
    deerCount: 12,
    wolfCount: 3,
    lockDeerState: false,
    lockWolfState: false,
    disableCombatGrace: false,
  };
}

let isPaused = false;
let gameStarted = false;
let menuHideTimer = 0;

interface GameSession {
  pause: () => void;
  resume: () => void;
  setReducedMotion: (reduced: boolean) => void;
  setQualityPreference: (preference: QualityPreference) => void;
  destroy: () => void;
}

let activeSession: GameSession | null = null;
let effectiveQualityTier: QualityTier = getInitialQualityProfile().tier;

function updateQualitySettingDisplay(
  preference = getQualityPreference(),
  tier = effectiveQualityTier
) {
  document.querySelectorAll<HTMLButtonElement>('[data-quality-preset]').forEach((button) => {
    const selected = button.dataset.qualityPreset === preference;
    button.setAttribute('aria-checked', String(selected));
    button.classList.toggle('is-selected', selected);
    button.tabIndex = selected ? 0 : -1;
  });

  const status = document.getElementById('quality-setting-status');
  if (status) {
    const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
    status.textContent = preference === 'auto' ? `Auto · ${tierLabel}` : tierLabel;
  }
  document.body.dataset.quality = tier;
}

function applyQualityPreference(preference: QualityPreference) {
  if (activeSession) {
    activeSession.setQualityPreference(preference);
  } else {
    effectiveQualityTier = getInitialQualityProfile(preference).tier;
  }
  updateQualitySettingDisplay(preference, effectiveQualityTier);
}

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
  const qualityButtons = document.querySelectorAll<HTMLButtonElement>('[data-quality-preset]');

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
    updateQualitySettingDisplay();
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

  qualityButtons.forEach((button, index) => {
    button.addEventListener('click', () => {
      const preference = button.dataset.qualityPreset as QualityPreference | undefined;
      if (preference) setQualityPreference(preference);
    });
    button.addEventListener('keydown', (event) => {
      const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
      if (direction === 0) return;
      event.preventDefault();
      const nextIndex = (index + direction + qualityButtons.length) % qualityButtons.length;
      const nextButton = qualityButtons[nextIndex];
      const preference = nextButton?.dataset.qualityPreset as QualityPreference | undefined;
      nextButton?.focus();
      if (preference) setQualityPreference(preference);
    });
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
  updateQualitySettingDisplay();
}

async function start() {
  document.getElementById('btn-retry-load')?.addEventListener('click', () => window.location.reload());
  updateMenuBestScore(Number(localStorage.getItem(BEST_SCORE_KEY) ?? 0));
  subscribeMotionPreference(applyMotionPreference);
  subscribeQualityPreference(applyQualityPreference);
  applyMotionPreference(getReducedMotion());
  applyQualityPreference(getQualityPreference());
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

  const qualityPreference = getQualityPreference();
  const initialQuality = getInitialQualityProfile(qualityPreference);
  const {
    scene,
    camera,
    renderer,
    setPixelRatio,
    dispose: disposeScene,
  } = createScene(initialQuality);

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

  const chunkManager = new ChunkManager(scene, assets, initialQuality);
  chunkManager.update(snake.head.position);
  const cameraRig = new CameraFollowRig(camera, reducedMotion);
  cameraRig.snapToSnake(snake, chunkManager.getTerrainColliders());
  const wildlifeEffects = new WildlifeEffects(scene, reducedMotion);
  wildlifeEffects.setQuality(initialQuality);
  const threatIndicators = new ThreatIndicatorController();
  const wildlifeDebugOptions = getWildlifeDebugOptions();

  const deerManager = new AnimalManager(scene, {
    species: 'deer',
    modelPath: '/models/Deer/Deer.glb',
    scaleCorrection: 0.42,
    count: wildlifeDebugOptions.deerCount,
    spawnRadius: 20,
    despawnRadius: 60,
    eatDistance: 1.5,
    points: 1,
    variants: DEER_VARIANTS,
    wanderSpeed: 1.0,
    fleeSpeed: 4.5,
    fleeTriggerRadius: 7,
    groundOffset: 0.3,
    wanderAnimationPattern: /^walk$/i,
    fleeAnimationPattern: /^gallop$/i,
    spawnClearRadius: 1.1,
    spawnExclusionRadius: 5.5,
    debugSpawnOffsets: wildlifeDebugOptions.deerOffsets,
    debugState: wildlifeDebugOptions.deerState,
    debugLockState: wildlifeDebugOptions.lockDeerState,
    isSpawnPositionClear: (position, radius) =>
      chunkManager.isPositionClear(position.x, position.z, radius),
  }, wildlifeEffects, reducedMotion, initialQuality);

  const wolfManager = new AnimalManager(scene, {
    species: 'wolf',
    modelPath: '/models/Wolf/Wolf.glb',
    scaleCorrection: 0.41,
    count: wildlifeDebugOptions.wolfCount,
    spawnRadius: 50,
    despawnRadius: 65,
    eatDistance: 0, // unused for predators
    points: 0, // unused for predators
    variants: WOLF_VARIANTS,
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
    attackWindupSeconds: 0.48,
    attackStrikeSeconds: 0.42,
    attackRecoverySeconds: 0.58,
    spawnClearRadius: 1.2,
    spawnExclusionRadius: 16,
    combatGraceSeconds: wildlifeDebugOptions.disableCombatGrace ? 0 : 5,
    debugSpawnOffsets: wildlifeDebugOptions.wolfOffsets,
    debugState: wildlifeDebugOptions.wolfState,
    debugLockState: wildlifeDebugOptions.lockWolfState,
    isSpawnPositionClear: (position, radius) =>
      chunkManager.isPositionClear(position.x, position.z, radius),
  }, wildlifeEffects, reducedMotion, initialQuality);

  let currentQuality = initialQuality;
  let selectedQualityPreference = qualityPreference;
  const applyRuntimeQuality = (profile: QualityProfile) => {
    currentQuality = profile;
    effectiveQualityTier = profile.tier;
    dayNightCycle.setQuality(profile);
    skyObjects.setQuality(profile);
    horizonLandmarks.setQuality(profile);
    chunkManager.setQuality(profile, snake.head.position);
    snake.setQuality(profile);
    deerManager.setQuality(profile);
    wolfManager.setQuality(profile);
    wildlifeEffects.setQuality(profile);
    setEffectsQuality(profile);
    updateQualitySettingDisplay(selectedQualityPreference, profile.tier);
  };
  const qualityController = new RuntimeQualityController(qualityPreference, {
    setPixelRatio,
    onProfileChange: applyRuntimeQuality,
  });

  let score = 0;
  let health = MAX_HEALTH;
  let damageInvulnerabilityTimer = playerDebugOptions.showHit ? 8 : 0;
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
  threatIndicators.updateGuard(damageInvulnerabilityTimer, DAMAGE_INVULNERABILITY_SECONDS);

  const clock = new THREE.Clock();
  let elapsedTime = 0;
  let previousHeadPosition = snake.head.position.clone();
  let animationFrameId = 0;
  let destroyed = false;
  let ended = false;
  let atmosphereAccumulator = 0;
  let environmentAccumulator = 0;
  let threatAccumulator = 1;
  let hudAccumulator = 1;

  const finishRun = () => {
    ended = true;
    gameStarted = false;
    input.reset();
    updateBuffDisplay(0, 0);
    threatIndicators.reset();
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

    const rawDelta = clock.getDelta();
    const delta = Math.min(rawDelta, MAX_FRAME_DELTA);
    elapsedTime += delta;
    qualityController.update(rawDelta);

    atmosphereAccumulator += delta;
    const atmosphereInterval = 1 / currentQuality.atmosphereUpdateHz;
    if (atmosphereAccumulator >= atmosphereInterval) {
      const atmosphereDelta = atmosphereAccumulator;
      atmosphereAccumulator = 0;
      const atmosphere = dayNightCycle.update(atmosphereDelta, snake.head.position);
      skyObjects.update(atmosphereDelta, atmosphere, snake.head.position);
      horizonLandmarks.update(snake.head.position);
    }

    chunkManager.update(snake.head.position);
    const terrainColliders = chunkManager.getTerrainColliders();
    snake.update(delta, terrainColliders);
    cameraRig.update(snake, delta, terrainColliders);

    environmentAccumulator += delta;
    if (environmentAccumulator >= 1 / currentQuality.environmentUpdateHz) {
      environmentAccumulator = 0;
      chunkManager.updateWind(elapsedTime);
      chunkManager.updateCollectibleAnimations(elapsedTime);
    }

    updateGrassTrample(snake.head.position);

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

    distanceTraveled += previousHeadPosition.distanceTo(snake.head.position);
    previousHeadPosition.copy(snake.head.position);

    const deerResult = deerManager.update(delta, snake.head.position);
    const wolfResult = wolfManager.update(delta, snake.head.position);
    wildlifeEffects.update(delta);
    threatAccumulator += delta;
    if (threatAccumulator >= 1 / currentQuality.threatUpdateHz) {
      threatAccumulator = 0;
      threatIndicators.update(wolfResult.threats, camera);
    }

    damageInvulnerabilityTimer = Math.max(0, damageInvulnerabilityTimer - delta);

    if (deerResult.eaten.length > 0) {
      let earnedPoints = 0;
      for (const eaten of deerResult.eaten) {
        earnedPoints += eaten.points;
        for (let point = 0; point < eaten.points; point++) snake.grow(scene);
        spawnEatBurst(scene, eaten.position);
      }

      score += earnedPoints * scoreMultiplier;
      animalsEaten += deerResult.eaten.length;

      updateScoreDisplay(score);
      spawnScorePopup(earnedPoints * scoreMultiplier);
      audioManager.playEat();
      triggerShake(0.15);

      if (score > bestScore) {
        bestScore = score;
        achievedNewBest = true;
        localStorage.setItem(BEST_SCORE_KEY, String(bestScore));
      }
    }

    if (wolfResult.attacks.length > 0 && damageInvulnerabilityTimer <= 0) {
      const attacker = wolfResult.attacks[0];
      const damage = 1;
      health = Math.max(0, health - damage);
      damageInvulnerabilityTimer = DAMAGE_INVULNERABILITY_SECONDS;
      snake.triggerHit(DAMAGE_INVULNERABILITY_SECONDS);
      snake.shrink(scene, damage);
      score = Math.max(0, score - damage);

      updateScoreDisplay(score);
      updateHealthDisplay(health, MAX_HEALTH);
      triggerDamageFeedback();
      threatIndicators.flashImpact(attacker.position, camera);
      threatIndicators.updateGuard(
        damageInvulnerabilityTimer,
        DAMAGE_INVULNERABILITY_SECONDS
      );
      spawnScorePopup(-damage);
      triggerShake(0.35);

      if (health === 0) {
        renderer.render(scene, camera);
        finishRun();
        return;
      }
    }

    updateBursts(delta);
    hudAccumulator += delta;
    if (hudAccumulator >= 1 / currentQuality.hudUpdateHz) {
      hudAccumulator = 0;
      updateBuffDisplay(snake.speedBoostSecondsRemaining, scoreMultiplierTimer);
      updateStaminaBar(snake.staminaPercent);
      updateStatsDisplay(distanceTraveled, animalsEaten, bestScore);
      threatIndicators.updateGuard(
        damageInvulnerabilityTimer,
        DAMAGE_INVULNERABILITY_SECONDS
      );
    }

    renderer.render(scene, camera);
    updateFpsCounter(qualityController.getSnapshot(), renderer);
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
      deerManager.setReducedMotion(reduced);
      wolfManager.setReducedMotion(reduced);
      wildlifeEffects.setReducedMotion(reduced);
    },
    setQualityPreference(preference: QualityPreference) {
      if (destroyed) return;
      selectedQualityPreference = preference;
      qualityController.setPreference(preference);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(animationFrameId);
      qualityController.dispose();
      deerManager.dispose();
      wolfManager.dispose();
      wildlifeEffects.dispose();
      threatIndicators.reset();
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
