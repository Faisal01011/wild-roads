export type QualityPreference = 'auto' | 'low' | 'medium' | 'high';
export type QualityTier = Exclude<QualityPreference, 'auto'>;

export interface QualityProfile {
  tier: QualityTier;
  label: string;
  antialias: boolean;
  pixelRatioCap: number;
  minimumResolutionScale: number;
  targetFps: number;
  shadowMapSize: number;
  shadowUpdateInterval: number;
  shadowDistance: number;
  grassDensity: number;
  grassDetailStart: number;
  grassDetailEnd: number;
  grassFadeStart: number;
  grassFadeEnd: number;
  flowerDensity: number;
  bushDensity: number;
  vegetationShadows: boolean;
  playerShadows: boolean;
  wildlifeLodDistance: number;
  wildlifeAiStride: number;
  wildlifeAnimationStride: number;
  wildlifeShadowDistance: number;
  particleDensity: number;
  skyDensity: number;
  horizonDensity: number;
  environmentUpdateHz: number;
  atmosphereUpdateHz: number;
  threatUpdateHz: number;
  hudUpdateHz: number;
}

export interface QualitySnapshot {
  preference: QualityPreference;
  tier: QualityTier;
  fps: number;
  frameTimeMs: number;
  resolutionScale: number;
  pixelRatio: number;
}

const QUALITY_STORAGE_KEY = 'wildroads_quality';
const QUALITY_PREFERENCES: readonly QualityPreference[] = ['auto', 'low', 'medium', 'high'];
const QUALITY_ORDER: readonly QualityTier[] = ['low', 'medium', 'high'];

const QUALITY_PROFILES: Readonly<Record<QualityTier, QualityProfile>> = {
  low: {
    tier: 'low',
    label: 'Low',
    antialias: false,
    pixelRatioCap: 1,
    minimumResolutionScale: 0.72,
    targetFps: 48,
    shadowMapSize: 512,
    shadowUpdateInterval: 4,
    shadowDistance: 22,
    grassDensity: 0.58,
    grassDetailStart: 14,
    grassDetailEnd: 28,
    grassFadeStart: 36,
    grassFadeEnd: 50,
    flowerDensity: 0.42,
    bushDensity: 0.68,
    vegetationShadows: false,
    playerShadows: false,
    wildlifeLodDistance: 18,
    wildlifeAiStride: 3,
    wildlifeAnimationStride: 4,
    wildlifeShadowDistance: 0,
    particleDensity: 0.42,
    skyDensity: 0.5,
    horizonDensity: 0.62,
    environmentUpdateHz: 10,
    atmosphereUpdateHz: 20,
    threatUpdateHz: 20,
    hudUpdateHz: 8,
  },
  medium: {
    tier: 'medium',
    label: 'Medium',
    antialias: true,
    pixelRatioCap: 1.5,
    minimumResolutionScale: 0.78,
    targetFps: 54,
    shadowMapSize: 768,
    shadowUpdateInterval: 2,
    shadowDistance: 34,
    grassDensity: 0.85,
    grassDetailStart: 20,
    grassDetailEnd: 40,
    grassFadeStart: 48,
    grassFadeEnd: 64,
    flowerDensity: 0.72,
    bushDensity: 0.86,
    vegetationShadows: true,
    playerShadows: true,
    wildlifeLodDistance: 27,
    wildlifeAiStride: 2,
    wildlifeAnimationStride: 2,
    wildlifeShadowDistance: 14,
    particleDensity: 0.74,
    skyDensity: 0.78,
    horizonDensity: 0.84,
    environmentUpdateHz: 15,
    atmosphereUpdateHz: 30,
    threatUpdateHz: 30,
    hudUpdateHz: 10,
  },
  high: {
    tier: 'high',
    label: 'High',
    antialias: true,
    pixelRatioCap: 2,
    minimumResolutionScale: 0.82,
    targetFps: 58,
    shadowMapSize: 1024,
    shadowUpdateInterval: 1,
    shadowDistance: 44,
    grassDensity: 1,
    grassDetailStart: 24,
    grassDetailEnd: 48,
    grassFadeStart: 54,
    grassFadeEnd: 72,
    flowerDensity: 1,
    bushDensity: 1,
    vegetationShadows: true,
    playerShadows: true,
    wildlifeLodDistance: 38,
    wildlifeAiStride: 1,
    wildlifeAnimationStride: 1,
    wildlifeShadowDistance: 20,
    particleDensity: 1,
    skyDensity: 1,
    horizonDensity: 1,
    environmentUpdateHz: 20,
    atmosphereUpdateHz: 60,
    threatUpdateHz: 60,
    hudUpdateHz: 12,
  },
};

type QualityPreferenceListener = (preference: QualityPreference) => void;
const preferenceListeners = new Set<QualityPreferenceListener>();

function isQualityPreference(value: string | null): value is QualityPreference {
  return Boolean(value && QUALITY_PREFERENCES.includes(value as QualityPreference));
}

function getDebugPreference(): QualityPreference | null {
  const parameters = new URLSearchParams(window.location.search);
  if (parameters.get('debug') !== '1') return null;
  const preference = parameters.get('quality');
  return isQualityPreference(preference) ? preference : null;
}

function getDebugAutoTier(): QualityTier | null {
  const parameters = new URLSearchParams(window.location.search);
  if (parameters.get('debug') !== '1') return null;
  const tier = parameters.get('qualityTier');
  return tier === 'low' || tier === 'medium' || tier === 'high' ? tier : null;
}

export function getQualityProfile(tier: QualityTier): QualityProfile {
  return QUALITY_PROFILES[tier];
}

export function getQualityPreference(): QualityPreference {
  const debugPreference = getDebugPreference();
  if (debugPreference) return debugPreference;

  try {
    const stored = localStorage.getItem(QUALITY_STORAGE_KEY);
    return isQualityPreference(stored) ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

export function setQualityPreference(preference: QualityPreference) {
  try {
    localStorage.setItem(QUALITY_STORAGE_KEY, preference);
  } catch {
    // Storage can be unavailable in privacy modes. The current session still
    // receives the preference through the listener below.
  }
  for (const listener of preferenceListeners) listener(preference);
}

export function subscribeQualityPreference(listener: QualityPreferenceListener) {
  preferenceListeners.add(listener);
  return () => preferenceListeners.delete(listener);
}

export function detectInitialQualityTier(): QualityTier {
  const debugTier = getDebugAutoTier();
  if (debugTier) return debugTier;

  const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
  const memory = navigatorWithMemory.deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    window.matchMedia('(pointer: coarse)').matches ||
    window.innerWidth < 768;

  if (mobile || memory <= 4 || cores <= 4) return 'low';
  return 'medium';
}

export function getInitialQualityProfile(preference = getQualityPreference()): QualityProfile {
  return getQualityProfile(preference === 'auto' ? detectInitialQualityTier() : preference);
}

interface RuntimeQualityControllerOptions {
  setPixelRatio: (pixelRatio: number) => void;
  onProfileChange: (profile: QualityProfile) => void;
}

/**
 * Owns adaptive resolution and Auto-preset tier changes. It deliberately uses
 * sustained windows and a cooldown so one loading hitch cannot make the world
 * visibly oscillate between quality levels.
 */
export class RuntimeQualityController {
  private preference: QualityPreference;
  private profile: QualityProfile;
  private readonly setPixelRatio: (pixelRatio: number) => void;
  private readonly onProfileChange: (profile: QualityProfile) => void;
  private frameTimeMs = 1000 / 60;
  private resolutionScale = 1;
  private appliedPixelRatio = 0;
  private sampleAccumulator = 0;
  private slowSeconds = 0;
  private fastSeconds = 0;
  private tierCooldown = 0;
  private readonly handleResize = () => this.applyResolution(true);

  constructor(preference: QualityPreference, options: RuntimeQualityControllerOptions) {
    this.preference = preference;
    this.profile = getInitialQualityProfile(preference);
    this.setPixelRatio = options.setPixelRatio;
    this.onProfileChange = options.onProfileChange;
    window.addEventListener('resize', this.handleResize);
    this.applyResolution(true);
    this.onProfileChange(this.profile);
  }

  get currentProfile(): QualityProfile {
    return this.profile;
  }

  setPreference(preference: QualityPreference) {
    if (preference === this.preference) return;
    this.preference = preference;
    this.resolutionScale = 1;
    this.slowSeconds = 0;
    this.fastSeconds = 0;
    this.tierCooldown = 4;
    const tier = preference === 'auto' ? detectInitialQualityTier() : preference;
    this.applyTier(tier, true);
  }

  update(rawDelta: number) {
    if (!Number.isFinite(rawDelta) || rawDelta <= 0 || rawDelta > 0.25) return;

    const frameTime = rawDelta * 1000;
    const blend = 1 - Math.exp(-rawDelta * 3.2);
    this.frameTimeMs += (frameTime - this.frameTimeMs) * blend;
    this.sampleAccumulator += rawDelta;
    this.tierCooldown = Math.max(0, this.tierCooldown - rawDelta);

    if (this.preference !== 'auto' || this.sampleAccumulator < 0.5) return;
    const sampleDuration = this.sampleAccumulator;
    this.sampleAccumulator = 0;

    const fps = 1000 / Math.max(1, this.frameTimeMs);
    const target = this.profile.targetFps;
    if (fps < target - 4) {
      this.resolutionScale = Math.max(
        this.profile.minimumResolutionScale,
        this.resolutionScale - 0.055
      );
      this.fastSeconds = 0;
    } else if (fps > target + 3) {
      this.resolutionScale = Math.min(1, this.resolutionScale + 0.025);
    }
    this.applyResolution();

    const atResolutionFloor =
      this.resolutionScale <= this.profile.minimumResolutionScale + 0.015;
    if (fps < target - 7 && atResolutionFloor) {
      this.slowSeconds += sampleDuration;
    } else {
      this.slowSeconds = Math.max(0, this.slowSeconds - sampleDuration * 1.5);
    }

    if (fps > 58 && this.resolutionScale >= 0.98) {
      this.fastSeconds += sampleDuration;
    } else {
      this.fastSeconds = Math.max(0, this.fastSeconds - sampleDuration);
    }

    if (this.tierCooldown > 0) return;
    const tierIndex = QUALITY_ORDER.indexOf(this.profile.tier);
    if (this.slowSeconds >= 3.5 && tierIndex > 0) {
      this.applyTier(QUALITY_ORDER[tierIndex - 1], false);
    } else if (this.fastSeconds >= 12 && tierIndex < QUALITY_ORDER.length - 1) {
      this.applyTier(QUALITY_ORDER[tierIndex + 1], false);
    }
  }

  getSnapshot(): QualitySnapshot {
    return {
      preference: this.preference,
      tier: this.profile.tier,
      fps: 1000 / Math.max(1, this.frameTimeMs),
      frameTimeMs: this.frameTimeMs,
      resolutionScale: this.resolutionScale,
      pixelRatio: this.appliedPixelRatio,
    };
  }

  dispose() {
    window.removeEventListener('resize', this.handleResize);
  }

  private applyTier(tier: QualityTier, force: boolean) {
    if (!force && tier === this.profile.tier) return;
    this.profile = getQualityProfile(tier);
    this.resolutionScale = Math.max(this.profile.minimumResolutionScale, 0.9);
    if (this.preference !== 'auto') this.resolutionScale = 1;
    this.slowSeconds = 0;
    this.fastSeconds = 0;
    this.tierCooldown = 7;
    this.applyResolution(true);
    this.onProfileChange(this.profile);
  }

  private applyResolution(force = false) {
    const deviceRatio = Math.max(0.75, window.devicePixelRatio || 1);
    const nextPixelRatio = Math.max(
      0.68,
      Math.min(deviceRatio, this.profile.pixelRatioCap) * this.resolutionScale
    );
    if (!force && Math.abs(nextPixelRatio - this.appliedPixelRatio) < 0.045) return;
    this.appliedPixelRatio = nextPixelRatio;
    this.setPixelRatio(nextPixelRatio);
  }
}
