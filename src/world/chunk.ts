import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

export const CHUNK_SIZE = 50;
const SEGMENTS = 20;
const HEIGHT_SCALE = 1.5;
const NOISE_FREQUENCY = 0.02;

const noise2D = createNoise2D(() => 0.42);

export function createChunk(chunkX: number, chunkZ: number): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(
    CHUNK_SIZE,
    CHUNK_SIZE,
    SEGMENTS,
    SEGMENTS
  );
  geometry.rotateX(-Math.PI / 2);

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

  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({ color: 0x4caf50 });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(worldOffsetX, 0, worldOffsetZ);
  mesh.receiveShadow = true;

  return mesh;
}

// Used only for the snake/player's own height — a smooth approximation, not tied
// to a specific chunk mesh (since the player can be anywhere across chunk borders).
export function getTerrainHeight(worldX: number, worldZ: number): number {
  return noise2D(worldX * NOISE_FREQUENCY, worldZ * NOISE_FREQUENCY) * HEIGHT_SCALE;
}

// Used for decorations — raycasts straight down onto the ACTUAL rendered chunk mesh,
// guaranteeing an exact match with what's visible on screen, no approximation involved.
const raycaster = new THREE.Raycaster();
raycaster.far = 2000;
const rayOrigin = new THREE.Vector3();
const rayDirection = new THREE.Vector3(0, -1, 0);

function sampleHeightOnMesh(mesh: THREE.Mesh, worldX: number, worldZ: number): number {
  rayOrigin.set(worldX, 1000, worldZ);
  raycaster.set(rayOrigin, rayDirection);
  const intersections = raycaster.intersectObject(mesh, false);
  if (intersections.length > 0) {
    return intersections[0].point.y;
  }
  return getTerrainHeight(worldX, worldZ); // fallback, should rarely trigger
}

export interface ChunkAssets {
  tree: THREE.Group;
  bush: THREE.Group;
  grass: THREE.Group;
  rock: THREE.Group;
}

export interface RockCollider {
  x: number;
  z: number;
  radius: number;
}

export interface ChunkDecorations {
  group: THREE.Group;
  rockColliders: RockCollider[];
}

const TREES_PER_CHUNK = 4;
const BUSHES_PER_CHUNK = 3;
const ROCKS_PER_CHUNK = 2;
const GRASS_PER_CHUNK = 500;
const GRASS_BASE_SCALE = 1.4;
const SPAWN_CLEAR_RADIUS = 8;

function seededRandom(x: number, z: number, salt: number): number {
  const value = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function getGroundOffset(object: THREE.Object3D): number {
  const box = new THREE.Box3().setFromObject(object);
  return -box.min.y;
}

function getHorizontalRadius(object: THREE.Object3D): number {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  return Math.max(size.x, size.z) / 2;
}

function extractMesh(group: THREE.Group): THREE.Mesh | null {
  group.updateMatrixWorld(true);

  let found: THREE.Mesh | null = null;
  let worldMatrix: THREE.Matrix4 | null = null;

  group.traverse((child) => {
    if (!found && child instanceof THREE.Mesh) {
      found = child;
      worldMatrix = child.matrixWorld.clone();
    }
  });

  if (!found || !worldMatrix) return null;

  const bakedGeometry = (found as THREE.Mesh).geometry.clone();
  bakedGeometry.applyMatrix4(worldMatrix);

  return new THREE.Mesh(bakedGeometry, (found as THREE.Mesh).material);
}

export function scatterDecorations(
  chunkX: number,
  chunkZ: number,
  assets: ChunkAssets,
  terrainMesh: THREE.Mesh
): ChunkDecorations {
  terrainMesh.updateMatrixWorld(true);
  const group = new THREE.Group();
  const rockColliders: RockCollider[] = [];
  const worldOffsetX = chunkX * CHUNK_SIZE;
  const worldOffsetZ = chunkZ * CHUNK_SIZE;

  const rockBaseRadius = getHorizontalRadius(assets.rock);

  const placeItems = (
    count: number,
    template: THREE.Group,
    salt: number,
    scaleRange: [number, number],
    isRock: boolean
  ) => {
    const groundOffset = getGroundOffset(template);

    for (let i = 0; i < count; i++) {
      const rx = seededRandom(chunkX, chunkZ, salt + i * 2.1);
      const rz = seededRandom(chunkX, chunkZ, salt + i * 2.1 + 0.5);
      const rs = seededRandom(chunkX, chunkZ, salt + i * 2.1 + 0.9);
      const rr = seededRandom(chunkX, chunkZ, salt + i * 2.1 + 1.3);

      const localX = (rx - 0.5) * CHUNK_SIZE;
      const localZ = (rz - 0.5) * CHUNK_SIZE;
      const worldX = worldOffsetX + localX;
      const worldZ = worldOffsetZ + localZ;

      const distanceFromOrigin = Math.sqrt(worldX * worldX + worldZ * worldZ);
      if (distanceFromOrigin < SPAWN_CLEAR_RADIUS) continue;

      const instance = template.clone(true);
      const variation = scaleRange[0] + rs * (scaleRange[1] - scaleRange[0]);

      instance.scale.multiplyScalar(variation);

      const height = sampleHeightOnMesh(terrainMesh, worldX, worldZ);
      instance.position.set(localX, height + groundOffset * variation, localZ);
      instance.rotation.y = rr * Math.PI * 2;

      instance.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      group.add(instance);

      if (isRock) {
        rockColliders.push({
          x: worldX,
          z: worldZ,
          radius: rockBaseRadius * variation * 0.7,
        });
      }
    }
  };

  placeItems(TREES_PER_CHUNK, assets.tree, 1, [0.8, 1.3], false);
  placeItems(BUSHES_PER_CHUNK, assets.bush, 2, [0.7, 1.1], false);
  placeItems(ROCKS_PER_CHUNK, assets.rock, 4, [0.6, 1.2], true);

  const grassInstances = createGrassInstances(chunkX, chunkZ, assets.grass, terrainMesh);
  if (grassInstances) group.add(grassInstances);

  group.position.set(worldOffsetX, 0, worldOffsetZ);
  return { group, rockColliders };
}

function createGrassInstances(
  chunkX: number,
  chunkZ: number,
  grassTemplate: THREE.Group,
  terrainMesh: THREE.Mesh
): THREE.InstancedMesh | null {
  const mesh = extractMesh(grassTemplate);
  if (!mesh) return null;

  const gridSize = Math.ceil(Math.sqrt(GRASS_PER_CHUNK));
  const cellSize = CHUNK_SIZE / gridSize;
  const totalInstances = gridSize * gridSize;

  const instanced = new THREE.InstancedMesh(mesh.geometry, mesh.material, totalInstances);
  instanced.castShadow = false;
  instanced.receiveShadow = true;

  const baseGroundOffset = getGroundOffset(mesh);
  const worldOffsetX = chunkX * CHUNK_SIZE;
  const worldOffsetZ = chunkZ * CHUNK_SIZE;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scaleVec = new THREE.Vector3();
  const upVector = new THREE.Vector3(0, 1, 0);

  let index = 0;
  for (let gx = 0; gx < gridSize; gx++) {
    for (let gz = 0; gz < gridSize; gz++) {
      const jitterX = seededRandom(chunkX, chunkZ, 10 + index * 1.7);
      const jitterZ = seededRandom(chunkX, chunkZ, 10 + index * 1.7 + 0.5);
      const rr = seededRandom(chunkX, chunkZ, 10 + index * 1.7 + 0.9);
      const rs = seededRandom(chunkX, chunkZ, 10 + index * 1.7 + 1.3);

      const cellCenterX = -CHUNK_SIZE / 2 + gx * cellSize + cellSize / 2;
      const cellCenterZ = -CHUNK_SIZE / 2 + gz * cellSize + cellSize / 2;
      const localX = cellCenterX + (jitterX - 0.5) * cellSize * 0.6;
      const localZ = cellCenterZ + (jitterZ - 0.5) * cellSize * 0.6;

      const worldX = worldOffsetX + localX;
      const worldZ = worldOffsetZ + localZ;
      const scale = GRASS_BASE_SCALE * (0.7 + rs * 0.6);

      const height = sampleHeightOnMesh(terrainMesh, worldX, worldZ);
      position.set(localX, height + baseGroundOffset * scale, localZ);
      quaternion.setFromAxisAngle(upVector, rr * Math.PI * 2);
      scaleVec.setScalar(scale);

      matrix.compose(position, quaternion, scaleVec);
      instanced.setMatrixAt(index, matrix);
      index++;
    }
  }

  instanced.instanceMatrix.needsUpdate = true;
  return instanced;
}

export function resolveRockCollisions(
  position: THREE.Vector3,
  colliders: RockCollider[],
  bufferRadius: number
) {
  for (const rock of colliders) {
    const dx = position.x - rock.x;
    const dz = position.z - rock.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    const minDistance = rock.radius + bufferRadius;

    if (distance < minDistance && distance > 0.0001) {
      const pushOutFactor = minDistance / distance;
      position.x = rock.x + dx * pushOutFactor;
      position.z = rock.z + dz * pushOutFactor;
    }
  }
}