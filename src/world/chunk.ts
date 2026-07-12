import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

export const CHUNK_SIZE = 50;
const SEGMENTS = 20;
const HEIGHT_SCALE = 1.5;
const NOISE_FREQUENCY = 0.02;

const noise2D = createNoise2D(() => 0.42);

function createGrassTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#4caf50';
  ctx.fillRect(0, 0, size, size);

  const bladeCount = 2500;
  for (let i = 0; i < bladeCount; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const shadeRoll = Math.random();
    const color =
      shadeRoll < 0.35 ? '#3d8b40' : shadeRoll < 0.7 ? '#5cbf5f' : '#4caf50';

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.random() * Math.PI);
    ctx.fillStyle = color;
    const width = 1 + Math.random() * 1.5;
    const height = 3 + Math.random() * 5;
    ctx.fillRect(-width / 2, -height / 2, width, height);
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

const grassTexture = createGrassTexture();
const TEXTURE_TILES_PER_CHUNK = 10;

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

  const tiledTexture = grassTexture.clone();
  tiledTexture.needsUpdate = true;
  tiledTexture.repeat.set(TEXTURE_TILES_PER_CHUNK, TEXTURE_TILES_PER_CHUNK);

  const material = new THREE.MeshStandardMaterial({ map: tiledTexture });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(worldOffsetX, 0, worldOffsetZ);
  mesh.receiveShadow = true;

  return mesh;
}

export function getTerrainHeight(worldX: number, worldZ: number): number {
  return noise2D(worldX * NOISE_FREQUENCY, worldZ * NOISE_FREQUENCY) * HEIGHT_SCALE;
}

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
  return getTerrainHeight(worldX, worldZ);
}

export interface ChunkAssets {
  trees: THREE.Group[];
  bushes: THREE.Group[];
  rocks: THREE.Group[];
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


  const placeItems = (
  count: number,
  templates: THREE.Group[],
  salt: number,
  scaleRange: [number, number],
  isRock: boolean,
  swayAmount: number = 0
) => {
  for (let i = 0; i < count; i++) {
    const rx = seededRandom(chunkX, chunkZ, salt + i * 2.1);
    const rz = seededRandom(chunkX, chunkZ, salt + i * 2.1 + 0.5);
    const rs = seededRandom(chunkX, chunkZ, salt + i * 2.1 + 0.9);
    const rr = seededRandom(chunkX, chunkZ, salt + i * 2.1 + 1.3);
    const rv = seededRandom(chunkX, chunkZ, salt + i * 2.1 + 1.7);

    const variantIndex = Math.floor(rv * templates.length);
    const template = templates[variantIndex];
    const groundOffset = getGroundOffset(template);
    const rockBaseRadius = isRock ? getHorizontalRadius(template) : 0;

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

      if (swayAmount > 0) {
        instance.userData.sway = true;
        instance.userData.swayPhase = rr * Math.PI * 2;
        instance.userData.swaySpeed = 0.4 + rs * 0.4;
        instance.userData.swayAmount = swayAmount;
      }

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

  placeItems(TREES_PER_CHUNK, assets.trees, 1, [0.8, 1.3], false, 0.025);
  placeItems(BUSHES_PER_CHUNK, assets.bushes, 2, [0.7, 1.1], false, 0.04);
  placeItems(ROCKS_PER_CHUNK, assets.rocks, 4, [0.6, 1.2], true);

  group.position.set(worldOffsetX, 0, worldOffsetZ);
  return { group, rockColliders };
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