import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

export const CHUNK_SIZE = 50;
const SEGMENTS = 20; // grid resolution per chunk (higher = smoother but costlier)
const HEIGHT_SCALE = 1.5;
const NOISE_FREQUENCY = 0.02;

// One shared noise function so terrain is continuous across chunk borders
const noise2D = createNoise2D(() => 0.42); // fixed seed for now — consistent world every reload

export function getTerrainHeight(worldX: number, worldZ: number): number {
  return noise2D(worldX * NOISE_FREQUENCY, worldZ * NOISE_FREQUENCY) * HEIGHT_SCALE;
}

export function createChunk(chunkX: number, chunkZ: number): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(
    CHUNK_SIZE,
    CHUNK_SIZE,
    SEGMENTS,
    SEGMENTS
  );
  geometry.rotateX(-Math.PI / 2); // lay flat

  const worldOffsetX = chunkX * CHUNK_SIZE;
  const worldOffsetZ = chunkZ * CHUNK_SIZE;

  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const localX = position.getX(i);
    const localZ = position.getZ(i);

    const worldX = localX + worldOffsetX;
    const worldZ = localZ + worldOffsetZ;

    const height = noise2D(worldX * NOISE_FREQUENCY, worldZ * NOISE_FREQUENCY) * HEIGHT_SCALE;
    position.setY(i, height);
  }

  geometry.computeVertexNormals(); // needed for correct lighting after height changes

  const material = new THREE.MeshStandardMaterial({ color: 0x4caf50 });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(worldOffsetX, 0, worldOffsetZ);
  mesh.receiveShadow = true;

  return mesh;
}