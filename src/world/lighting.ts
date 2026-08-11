import * as THREE from 'three';

interface AtmosphereKeyframe {
  time: number;
  zenith: number;
  horizon: number;
  ground: number;
  fog: number;
  sun: number;
  cloud: number;
  skyLight: number;
  groundLight: number;
  sunIntensity: number;
  moonIntensity: number;
  hemisphereIntensity: number;
  exposure: number;
  fogDensity: number;
  starOpacity: number;
  cloudOpacity: number;
  hazeStrength: number;
}

// The final keyframe mirrors dawn so interpolation remains seamless when the
// normalized clock wraps from 1 back to 0.
const ATMOSPHERE_KEYFRAMES: AtmosphereKeyframe[] = [
  {
    time: 0,
    zenith: 0x486b88,
    horizon: 0xf0aa73,
    ground: 0x26392f,
    fog: 0x91a394,
    sun: 0xffd19b,
    cloud: 0xffddbb,
    skyLight: 0x9fc0cf,
    groundLight: 0x4a4635,
    sunIntensity: 1.25,
    moonIntensity: 0.08,
    hemisphereIntensity: 0.82,
    exposure: 1.08,
    fogDensity: 0.012,
    starOpacity: 0.12,
    cloudOpacity: 0.5,
    hazeStrength: 0.42,
  },
  {
    time: 0.12,
    zenith: 0x6098b7,
    horizon: 0xe8c292,
    ground: 0x3d5b47,
    fog: 0xabc0b1,
    sun: 0xffe3b2,
    cloud: 0xf3e4cf,
    skyLight: 0xc2dfeb,
    groundLight: 0x536148,
    sunIntensity: 2.2,
    moonIntensity: 0,
    hemisphereIntensity: 1.05,
    exposure: 1.04,
    fogDensity: 0.0095,
    starOpacity: 0,
    cloudOpacity: 0.52,
    hazeStrength: 0.3,
  },
  {
    time: 0.25,
    zenith: 0x4384b2,
    horizon: 0xc4d9df,
    ground: 0x4a6a4d,
    fog: 0xb0c7bd,
    sun: 0xfff2d2,
    cloud: 0xf5f4ec,
    skyLight: 0xc8e6f2,
    groundLight: 0x58634a,
    sunIntensity: 2.65,
    moonIntensity: 0,
    hemisphereIntensity: 1.12,
    exposure: 1,
    fogDensity: 0.0085,
    starOpacity: 0,
    cloudOpacity: 0.48,
    hazeStrength: 0.22,
  },
  {
    time: 0.4,
    zenith: 0x527d9c,
    horizon: 0xd5b887,
    ground: 0x405b43,
    fog: 0xa9b6a3,
    sun: 0xffd59d,
    cloud: 0xf1d9bd,
    skyLight: 0xb8d0d8,
    groundLight: 0x5b5842,
    sunIntensity: 2,
    moonIntensity: 0,
    hemisphereIntensity: 0.98,
    exposure: 1.02,
    fogDensity: 0.0095,
    starOpacity: 0,
    cloudOpacity: 0.5,
    hazeStrength: 0.3,
  },
  {
    time: 0.5,
    zenith: 0x405673,
    horizon: 0xd97852,
    ground: 0x28362d,
    fog: 0x7c8a7c,
    sun: 0xffad72,
    cloud: 0xe6ad8d,
    skyLight: 0x879fb2,
    groundLight: 0x4b4038,
    sunIntensity: 1.15,
    moonIntensity: 0.08,
    hemisphereIntensity: 0.76,
    exposure: 1.08,
    fogDensity: 0.0125,
    starOpacity: 0.16,
    cloudOpacity: 0.42,
    hazeStrength: 0.48,
  },
  {
    time: 0.59,
    zenith: 0x253958,
    horizon: 0x756875,
    ground: 0x172721,
    fog: 0x4f6063,
    sun: 0xe98d67,
    cloud: 0x8d8792,
    skyLight: 0x607593,
    groundLight: 0x2a3a34,
    sunIntensity: 0.04,
    moonIntensity: 0.38,
    hemisphereIntensity: 0.62,
    exposure: 1.08,
    fogDensity: 0.0115,
    starOpacity: 0.65,
    cloudOpacity: 0.28,
    hazeStrength: 0.36,
  },
  {
    time: 0.75,
    zenith: 0x0b1933,
    horizon: 0x2b3c52,
    ground: 0x0e1d1c,
    fog: 0x283b3f,
    sun: 0x7890b0,
    cloud: 0x66758b,
    skyLight: 0x4d6385,
    groundLight: 0x243431,
    sunIntensity: 0,
    moonIntensity: 0.72,
    hemisphereIntensity: 0.58,
    exposure: 1.12,
    fogDensity: 0.0105,
    starOpacity: 0.92,
    cloudOpacity: 0.22,
    hazeStrength: 0.25,
  },
  {
    time: 0.91,
    zenith: 0x1b2f50,
    horizon: 0x536070,
    ground: 0x152621,
    fog: 0x40545a,
    sun: 0xa8b5c7,
    cloud: 0x75808f,
    skyLight: 0x617797,
    groundLight: 0x2d3d36,
    sunIntensity: 0,
    moonIntensity: 0.42,
    hemisphereIntensity: 0.62,
    exposure: 1.1,
    fogDensity: 0.0115,
    starOpacity: 0.68,
    cloudOpacity: 0.26,
    hazeStrength: 0.34,
  },
  {
    time: 1,
    zenith: 0x486b88,
    horizon: 0xf0aa73,
    ground: 0x26392f,
    fog: 0x91a394,
    sun: 0xffd19b,
    cloud: 0xffddbb,
    skyLight: 0x9fc0cf,
    groundLight: 0x4a4635,
    sunIntensity: 1.25,
    moonIntensity: 0.08,
    hemisphereIntensity: 0.82,
    exposure: 1.08,
    fogDensity: 0.012,
    starOpacity: 0.12,
    cloudOpacity: 0.5,
    hazeStrength: 0.42,
  },
];

export interface AtmosphereFrame {
  time: number;
  sunAngle: number;
  sunHeight: number;
  sunDirection: THREE.Vector3;
  moonDirection: THREE.Vector3;
  zenithColor: THREE.Color;
  horizonColor: THREE.Color;
  groundColor: THREE.Color;
  fogColor: THREE.Color;
  sunColor: THREE.Color;
  cloudColor: THREE.Color;
  starOpacity: number;
  cloudOpacity: number;
  hazeStrength: number;
  sunVisibility: number;
  moonVisibility: number;
}

export interface DayNightCycleOptions {
  initialTime?: number;
  freezeTime?: boolean;
  cycleDuration?: number;
}

const ORIGIN = new THREE.Vector3();
const COLOR_SCRATCH = new THREE.Color();

function smoothstep(min: number, max: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
}

function normalizeTime(time: number): number {
  return ((time % 1) + 1) % 1;
}

function interpolateNumber(from: number, to: number, amount: number): number {
  return THREE.MathUtils.lerp(from, to, amount);
}

function interpolateColor(
  target: THREE.Color,
  from: number,
  to: number,
  amount: number
) {
  target.setHex(from).lerp(COLOR_SCRATCH.setHex(to), amount);
}

function findKeyframePair(time: number): [AtmosphereKeyframe, AtmosphereKeyframe, number] {
  for (let index = 0; index < ATMOSPHERE_KEYFRAMES.length - 1; index++) {
    const from = ATMOSPHERE_KEYFRAMES[index];
    const to = ATMOSPHERE_KEYFRAMES[index + 1];
    if (time >= from.time && time <= to.time) {
      const linearAmount = (time - from.time) / (to.time - from.time);
      return [from, to, smoothstep(0, 1, linearAmount)];
    }
  }

  return [ATMOSPHERE_KEYFRAMES[0], ATMOSPHERE_KEYFRAMES[1], 0];
}

function debugTimeFromName(value: string | null): number | undefined {
  if (!value) return undefined;

  const namedTimes: Record<string, number> = {
    dawn: 0,
    morning: 0.12,
    noon: 0.25,
    sunset: 0.49,
    dusk: 0.55,
    night: 0.75,
  };

  if (value.toLowerCase() in namedTimes) return namedTimes[value.toLowerCase()];

  const numericTime = Number(value);
  return Number.isFinite(numericTime) ? normalizeTime(numericTime) : undefined;
}

export function getAtmosphereDebugOptions(): DayNightCycleOptions {
  const parameters = new URLSearchParams(window.location.search);
  if (parameters.get('debug') !== '1') return {};

  const debugTime = debugTimeFromName(parameters.get('time'));
  if (debugTime === undefined) return {};

  return { initialTime: debugTime, freezeTime: true };
}

export class DayNightCycle {
  private readonly scene: THREE.Scene;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly sun: THREE.DirectionalLight;
  private readonly moon: THREE.DirectionalLight;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly cycleDuration: number;
  private readonly freezeTime: boolean;
  private time: number;

  private readonly frame: AtmosphereFrame = {
    time: 0,
    sunAngle: 0,
    sunHeight: 0,
    sunDirection: new THREE.Vector3(),
    moonDirection: new THREE.Vector3(),
    zenithColor: new THREE.Color(),
    horizonColor: new THREE.Color(),
    groundColor: new THREE.Color(),
    fogColor: new THREE.Color(),
    sunColor: new THREE.Color(),
    cloudColor: new THREE.Color(),
    starOpacity: 0,
    cloudOpacity: 0,
    hazeStrength: 0,
    sunVisibility: 0,
    moonVisibility: 0,
  };

  constructor(
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    options: DayNightCycleOptions = {}
  ) {
    this.scene = scene;
    this.renderer = renderer;
    this.time = normalizeTime(options.initialTime ?? 0.16);
    this.freezeTime = options.freezeTime ?? false;
    this.cycleDuration = options.cycleDuration ?? 120;

    this.hemisphere = new THREE.HemisphereLight(0xc8e6f2, 0x58634a, 1);
    scene.add(this.hemisphere);

    this.sun = new THREE.DirectionalLight(0xfff2d2, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 2;
    this.sun.shadow.camera.far = 180;
    this.sun.shadow.camera.left = -42;
    this.sun.shadow.camera.right = 42;
    this.sun.shadow.camera.top = 42;
    this.sun.shadow.camera.bottom = -42;
    this.sun.shadow.bias = -0.00015;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 2;
    scene.add(this.sun, this.sun.target);

    // A cool, shadow-free moon fill keeps animals and the trail legible at
    // night without doubling the cost of the main shadow map.
    this.moon = new THREE.DirectionalLight(0x9cb8dd, 0.5);
    this.moon.castShadow = false;
    scene.add(this.moon, this.moon.target);

    this.applyTimeOfDay(ORIGIN);
  }

  update(delta: number, playerPosition: THREE.Vector3): AtmosphereFrame {
    if (!this.freezeTime) {
      this.time = normalizeTime(this.time + delta / this.cycleDuration);
    }

    this.applyTimeOfDay(playerPosition);
    return this.frame;
  }

  get currentFrame(): AtmosphereFrame {
    return this.frame;
  }

  private applyTimeOfDay(playerPosition: THREE.Vector3) {
    const [from, to, amount] = findKeyframePair(this.time);
    const angle = this.time * Math.PI * 2;
    const sunHeight = Math.sin(angle);

    this.frame.time = this.time;
    this.frame.sunAngle = angle;
    this.frame.sunHeight = sunHeight;
    this.frame.sunDirection.set(Math.cos(angle), sunHeight, -0.32).normalize();
    this.frame.moonDirection.copy(this.frame.sunDirection).multiplyScalar(-1);
    interpolateColor(this.frame.zenithColor, from.zenith, to.zenith, amount);
    interpolateColor(this.frame.horizonColor, from.horizon, to.horizon, amount);
    interpolateColor(this.frame.groundColor, from.ground, to.ground, amount);
    interpolateColor(this.frame.fogColor, from.fog, to.fog, amount);
    interpolateColor(this.frame.sunColor, from.sun, to.sun, amount);
    interpolateColor(this.frame.cloudColor, from.cloud, to.cloud, amount);
    this.frame.starOpacity = interpolateNumber(from.starOpacity, to.starOpacity, amount);
    this.frame.cloudOpacity = interpolateNumber(from.cloudOpacity, to.cloudOpacity, amount);
    this.frame.hazeStrength = interpolateNumber(from.hazeStrength, to.hazeStrength, amount);
    this.frame.sunVisibility = smoothstep(-0.08, 0.04, sunHeight);
    this.frame.moonVisibility = smoothstep(-0.06, 0.08, -sunHeight);

    const sunIntensity = interpolateNumber(from.sunIntensity, to.sunIntensity, amount);
    const moonIntensity = interpolateNumber(from.moonIntensity, to.moonIntensity, amount);
    const hemisphereIntensity = interpolateNumber(from.hemisphereIntensity, to.hemisphereIntensity, amount);

    this.sun.color.copy(this.frame.sunColor);
    this.sun.intensity = sunIntensity;
    this.sun.visible = sunIntensity > 0.001;
    this.sun.position.copy(playerPosition).addScaledVector(this.frame.sunDirection, 85);
    this.sun.target.position.set(playerPosition.x, playerPosition.y, playerPosition.z);
    this.sun.target.updateMatrixWorld();

    this.moon.intensity = moonIntensity;
    this.moon.visible = moonIntensity > 0.001;
    this.moon.position.copy(playerPosition).addScaledVector(this.frame.moonDirection, 70);
    this.moon.target.position.set(playerPosition.x, playerPosition.y, playerPosition.z);
    this.moon.target.updateMatrixWorld();

    interpolateColor(this.hemisphere.color, from.skyLight, to.skyLight, amount);
    interpolateColor(this.hemisphere.groundColor, from.groundLight, to.groundLight, amount);
    this.hemisphere.intensity = hemisphereIntensity;

    this.renderer.toneMappingExposure = interpolateNumber(from.exposure, to.exposure, amount);

    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(this.frame.fogColor);
      this.scene.fog.density = interpolateNumber(from.fogDensity, to.fogDensity, amount);
    }

    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.copy(this.frame.horizonColor);
    }
  }

  dispose() {
    this.scene.remove(
      this.sun,
      this.sun.target,
      this.moon,
      this.moon.target,
      this.hemisphere
    );
    this.sun.shadow.map?.dispose();
  }
}
