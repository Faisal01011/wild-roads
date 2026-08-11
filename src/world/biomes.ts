import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { coordinateRandom, createSeededRandom, smoothstep } from './procedural';

export const BIOME_IDS = ['pine', 'meadow', 'rocky', 'autumn', 'moonlit'] as const;
export type BiomeId = (typeof BIOME_IDS)[number];

type BiomeColorKey =
  | 'groundLow'
  | 'groundHigh'
  | 'rock'
  | 'trail'
  | 'grass'
  | 'canopy'
  | 'bush'
  | 'flower'
  | 'horizon';

type BiomeNumberKey =
  | 'relief'
  | 'treeDensity'
  | 'bushDensity'
  | 'rockDensity'
  | 'grassDensity'
  | 'flowerDensity';

export interface BiomeDefinition {
  id: BiomeId;
  label: string;
  groundLow: number;
  groundHigh: number;
  rock: number;
  trail: number;
  grass: number;
  canopy: number;
  bush: number;
  flower: number;
  horizon: number;
  relief: number;
  treeDensity: number;
  bushDensity: number;
  rockDensity: number;
  grassDensity: number;
  flowerDensity: number;
  preferredTrees: readonly number[];
  preferredGrass: readonly number[];
}

export const BIOMES: Record<BiomeId, BiomeDefinition> = {
  pine: {
    id: 'pine',
    label: 'Pine Forest',
    groundLow: 0x243d32,
    groundHigh: 0x4c6847,
    rock: 0x4e5a55,
    trail: 0x70583f,
    grass: 0x396747,
    canopy: 0x244b37,
    bush: 0x436c4a,
    flower: 0xc8d7c0,
    horizon: 0x263f38,
    relief: 1.05,
    treeDensity: 0.95,
    bushDensity: 0.78,
    rockDensity: 0.34,
    grassDensity: 0.74,
    flowerDensity: 0.16,
    preferredTrees: [4, 0],
    preferredGrass: [1, 2],
  },
  meadow: {
    id: 'meadow',
    label: 'Golden Meadow',
    groundLow: 0x657442,
    groundHigh: 0xa39254,
    rock: 0x766d59,
    trail: 0x8d6744,
    grass: 0x8ca85c,
    canopy: 0x687a43,
    bush: 0x71874d,
    flower: 0xf2c66d,
    horizon: 0x67704b,
    relief: 0.62,
    treeDensity: 0.24,
    bushDensity: 0.42,
    rockDensity: 0.16,
    grassDensity: 1,
    flowerDensity: 0.92,
    preferredTrees: [1, 3],
    preferredGrass: [0, 1],
  },
  rocky: {
    id: 'rocky',
    label: 'Rocky Highland',
    groundLow: 0x555d52,
    groundHigh: 0x7c7d6b,
    rock: 0x6c706d,
    trail: 0x796857,
    grass: 0x687456,
    canopy: 0x46564a,
    bush: 0x59634e,
    flower: 0xd6d1b5,
    horizon: 0x545b5c,
    relief: 1.72,
    treeDensity: 0.18,
    bushDensity: 0.24,
    rockDensity: 1,
    grassDensity: 0.34,
    flowerDensity: 0.08,
    preferredTrees: [4, 0],
    preferredGrass: [2],
  },
  autumn: {
    id: 'autumn',
    label: 'Autumn Woodland',
    groundLow: 0x5b4a31,
    groundHigh: 0x8c7040,
    rock: 0x665c52,
    trail: 0x795338,
    grass: 0x7c7c45,
    canopy: 0xa56035,
    bush: 0x8a683b,
    flower: 0xdd9a4e,
    horizon: 0x684a39,
    relief: 1.02,
    treeDensity: 0.82,
    bushDensity: 0.68,
    rockDensity: 0.3,
    grassDensity: 0.64,
    flowerDensity: 0.5,
    preferredTrees: [2, 3],
    preferredGrass: [0, 2],
  },
  moonlit: {
    id: 'moonlit',
    label: 'Moonlit Valley',
    groundLow: 0x293a49,
    groundHigh: 0x405861,
    rock: 0x485566,
    trail: 0x50505a,
    grass: 0x4c6966,
    canopy: 0x304e54,
    bush: 0x3d605c,
    flower: 0x91cbd0,
    horizon: 0x344b5d,
    relief: 1.22,
    treeDensity: 0.7,
    bushDensity: 0.54,
    rockDensity: 0.52,
    grassDensity: 0.6,
    flowerDensity: 0.64,
    preferredTrees: [4, 2],
    preferredGrass: [1, 2],
  },
};

export interface BiomeSample {
  weights: Record<BiomeId, number>;
  dominant: BiomeId;
  dominance: number;
}

export interface TrailSample {
  distance: number;
  width: number;
  influence: number;
}

const BIOME_CELL_SIZE = 170;
const BIOME_BLEND_RADIUS = BIOME_CELL_SIZE * 0.63;
const trailNoise = createNoise2D(createSeededRandom(0x74726169));
const clearingNoise = createNoise2D(createSeededRandom(0x636c6561));
const TRAIL_ROTATION_COS = 0.8192;
const TRAIL_ROTATION_SIN = 0.5736;
const TRAIL_ORIGIN_OFFSET = trailNoise(0, 0.17) * 4.5;
const blendScratchColor = new THREE.Color();

function emptyWeights(): Record<BiomeId, number> {
  return { pine: 0, meadow: 0, rocky: 0, autumn: 0, moonlit: 0 };
}

function getCellBiome(cellX: number, cellZ: number): BiomeId {
  if (cellX === 0 && cellZ === 0) return 'meadow';
  const roll = coordinateRandom(cellX, cellZ, 91.73);
  return BIOME_IDS[Math.min(BIOME_IDS.length - 1, Math.floor(roll * BIOME_IDS.length))];
}

function getBiomeAnchorX(cellX: number, cellZ: number): number {
  const jitter = (coordinateRandom(cellX, cellZ, 17.4) - 0.5) * BIOME_CELL_SIZE * 0.56;
  return (cellX + 0.5) * BIOME_CELL_SIZE + jitter;
}

function getBiomeAnchorZ(cellX: number, cellZ: number): number {
  const jitter = (coordinateRandom(cellX, cellZ, 42.9) - 0.5) * BIOME_CELL_SIZE * 0.56;
  return (cellZ + 0.5) * BIOME_CELL_SIZE + jitter;
}

export function createBiomeSample(): BiomeSample {
  return { weights: emptyWeights(), dominant: 'meadow', dominance: 1 };
}

export function sampleBiome(
  worldX: number,
  worldZ: number,
  target: BiomeSample = createBiomeSample()
): BiomeSample {
  const weights = target.weights;
  for (const id of BIOME_IDS) weights[id] = 0;
  const centerCellX = Math.floor(worldX / BIOME_CELL_SIZE);
  const centerCellZ = Math.floor(worldZ / BIOME_CELL_SIZE);

  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      const cellX = centerCellX + offsetX;
      const cellZ = centerCellZ + offsetZ;
      const anchorX = getBiomeAnchorX(cellX, cellZ);
      const anchorZ = getBiomeAnchorZ(cellX, cellZ);
      const distance = Math.hypot(worldX - anchorX, worldZ - anchorZ);
      const normalizedDistance = distance / BIOME_BLEND_RADIUS;
      const influence = Math.exp(-Math.pow(normalizedDistance, 4));
      weights[getCellBiome(cellX, cellZ)] += influence;
    }
  }

  // Every run opens in a recognizable, uncluttered meadow before the broader
  // world map takes over. The smooth radial blend avoids a visible biome ring.
  const originDistance = Math.hypot(worldX, worldZ);
  weights.meadow += (1 - smoothstep(26, 72, originDistance)) * 2.8;

  let total = 0;
  for (const id of BIOME_IDS) total += weights[id];
  if (total <= 0.000001) weights.meadow = total = 1;

  let dominant: BiomeId = 'meadow';
  let dominance = 0;
  for (const id of BIOME_IDS) {
    weights[id] /= total;
    if (weights[id] > dominance) {
      dominant = id;
      dominance = weights[id];
    }
  }

  target.dominant = dominant;
  target.dominance = dominance;
  return target;
}

export function blendBiomeNumber(sample: BiomeSample, key: BiomeNumberKey): number {
  let value = 0;
  for (const id of BIOME_IDS) value += BIOMES[id][key] * sample.weights[id];
  return value;
}

export function blendBiomeColor(
  sample: BiomeSample,
  key: BiomeColorKey,
  target = new THREE.Color()
): THREE.Color {
  target.setRGB(0, 0, 0);
  for (const id of BIOME_IDS) {
    blendScratchColor.setHex(BIOMES[id][key]);
    target.r += blendScratchColor.r * sample.weights[id];
    target.g += blendScratchColor.g * sample.weights[id];
    target.b += blendScratchColor.b * sample.weights[id];
  }
  return target;
}

export function chooseBiome(sample: BiomeSample, roll: number): BiomeId {
  let cursor = 0;
  for (const id of BIOME_IDS) {
    cursor += sample.weights[id];
    if (roll <= cursor) return id;
  }
  return sample.dominant;
}

export function sampleTrail(
  worldX: number,
  worldZ: number,
  target: TrailSample = { distance: 0, width: 0, influence: 0 }
): TrailSample {
  const along = worldX * TRAIL_ROTATION_COS + worldZ * TRAIL_ROTATION_SIN;
  const across = -worldX * TRAIL_ROTATION_SIN + worldZ * TRAIL_ROTATION_COS;
  const noiseOffset = trailNoise(along * 0.0042, 0.17) * 4.5 - TRAIL_ORIGIN_OFFSET;
  const center =
    Math.sin(along * 0.025) * 4.2 +
    Math.sin(along * 0.0085) * 7.4 +
    noiseOffset;
  const primaryWidth = 1.65 + (trailNoise(along * 0.012 + 8.4, 2.7) + 1) * 0.42;
  const primaryDistance = wrappedDistance(across - center, 128);
  const primaryInfluence = 1 - smoothstep(primaryWidth, primaryWidth + 2.4, primaryDistance);

  const crossAlong = worldX * 0.4226 - worldZ * 0.9063;
  const crossAcross = worldX * 0.9063 + worldZ * 0.4226;
  const crossCenter =
    31 +
    Math.sin(crossAlong * 0.018 + 1.4) * 6 +
    trailNoise(crossAlong * 0.0036 + 14.2, -3.1) * 5;
  const crossWidth = 1.35 + (trailNoise(crossAlong * 0.01, 6.1) + 1) * 0.34;
  const crossDistance = wrappedDistance(crossAcross - crossCenter, 265);
  const crossInfluence = 1 - smoothstep(crossWidth, crossWidth + 2.2, crossDistance);

  if (crossInfluence > primaryInfluence) {
    target.distance = crossDistance;
    target.width = crossWidth;
    target.influence = crossInfluence;
  } else {
    target.distance = primaryDistance;
    target.width = primaryWidth;
    target.influence = primaryInfluence;
  }
  return target;
}

function wrappedDistance(value: number, spacing: number): number {
  const wrapped = ((value + spacing * 0.5) % spacing + spacing) % spacing - spacing * 0.5;
  return Math.abs(wrapped);
}

export function sampleClearing(worldX: number, worldZ: number): number {
  const organic = smoothstep(0.34, 0.78, clearingNoise(worldX * 0.013, worldZ * 0.013));
  const originClearing = 1 - smoothstep(24, 58, Math.hypot(worldX, worldZ));
  return Math.max(organic, originClearing);
}

export function getBiomeDebugPosition(id: BiomeId): THREE.Vector2 {
  if (id === 'meadow') return new THREE.Vector2(0, 0);

  let bestPosition = new THREE.Vector2(0, 0);
  let bestWeight = -1;
  for (let cellX = -6; cellX <= 6; cellX++) {
    for (let cellZ = -6; cellZ <= 6; cellZ++) {
      const anchorX = getBiomeAnchorX(cellX, cellZ);
      const anchorZ = getBiomeAnchorZ(cellX, cellZ);
      const weight = sampleBiome(anchorX, anchorZ).weights[id];
      if (weight > bestWeight) {
        bestWeight = weight;
        bestPosition.set(anchorX, anchorZ);
      }
    }
  }
  return bestPosition.clone();
}
