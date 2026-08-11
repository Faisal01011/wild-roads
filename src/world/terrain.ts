import { createNoise2D } from 'simplex-noise';
import { blendBiomeNumber, createBiomeSample, sampleBiome, sampleTrail } from './biomes';
import type { TrailSample } from './biomes';
import { createSeededRandom, lerp, smoothstep } from './procedural';

const broadNoise = createNoise2D(createSeededRandom(0x62726f61));
const detailNoise = createNoise2D(createSeededRandom(0x64657461));
const warpNoiseX = createNoise2D(createSeededRandom(0x77617278));
const warpNoiseZ = createNoise2D(createSeededRandom(0x7761727a));
const ridgeNoise = createNoise2D(createSeededRandom(0x72696467));
const surfaceNoise = createNoise2D(createSeededRandom(0x73757266));
const terrainBiomeSample = createBiomeSample();
const terrainTrailSample: TrailSample = { distance: 0, width: 0, influence: 0 };

function fbm(
  noise: ReturnType<typeof createNoise2D>,
  x: number,
  z: number,
  octaves: number
): number {
  let value = 0;
  let amplitude = 0.55;
  let frequency = 1;
  let amplitudeSum = 0;

  for (let octave = 0; octave < octaves; octave++) {
    value += noise(x * frequency, z * frequency) * amplitude;
    amplitudeSum += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }

  return value / amplitudeSum;
}

export function getTerrainHeight(worldX: number, worldZ: number): number {
  const biome = sampleBiome(worldX, worldZ, terrainBiomeSample);
  const relief = blendBiomeNumber(biome, 'relief');
  const rockyWeight = biome.weights.rocky;

  const warpX = warpNoiseX(worldX * 0.006, worldZ * 0.006) * 22;
  const warpZ = warpNoiseZ(worldX * 0.006, worldZ * 0.006) * 22;
  const warpedX = worldX + warpX;
  const warpedZ = worldZ + warpZ;

  const broad = fbm(broadNoise, warpedX * 0.0052, warpedZ * 0.0052, 5);
  const detail = fbm(detailNoise, warpedX * 0.018, warpedZ * 0.018, 4);
  const ridge = 1 - Math.abs(ridgeNoise(warpedX * 0.0085, warpedZ * 0.0085));
  const ridgeShape = Math.pow(ridge, 3) * rockyWeight * 3.1;

  let height = broad * 2.25 * relief + detail * 0.92 * relief + ridgeShape;

  const trail = sampleTrail(worldX, worldZ, terrainTrailSample);
  const trailGrade = broad * 1.05 * Math.min(relief, 1.15);
  height = lerp(height, trailGrade, trail.influence * 0.72);

  const originBlend = smoothstep(10, 46, Math.hypot(worldX, worldZ));
  height = lerp(height * 0.34, height, originBlend);

  return height;
}

export function getTerrainSlope(worldX: number, worldZ: number): number {
  const sampleDistance = 0.75;
  const dx =
    (getTerrainHeight(worldX + sampleDistance, worldZ) -
      getTerrainHeight(worldX - sampleDistance, worldZ)) /
    (sampleDistance * 2);
  const dz =
    (getTerrainHeight(worldX, worldZ + sampleDistance) -
      getTerrainHeight(worldX, worldZ - sampleDistance)) /
    (sampleDistance * 2);
  return Math.hypot(dx, dz);
}

export function getTerrainSurfaceVariation(worldX: number, worldZ: number): number {
  return (fbm(surfaceNoise, worldX * 0.055, worldZ * 0.055, 3) + 1) * 0.5;
}
