import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

export const CHUNK_SIZE = 50;
const SEGMENTS = 20;
const HEIGHT_SCALE = 1.5;
const NOISE_FREQUENCY = 0.02;

const noise2D = createNoise2D(() => 0.42);

function createGrassGroundTexture(): THREE.Texture {
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

const groundTexture = createGrassGroundTexture();
const TEXTURE_TILES_PER_CHUNK = 10;

export function createChunk(chunkX: number, chunkZ: number): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, SEGMENTS, SEGMENTS);
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

  const tiledTexture = groundTexture.clone();
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
  grassVariants: THREE.Group[];
}

export interface RockCollider {
  x: number;
  z: number;
  radius: number;
}

export interface ChunkDecorations {
  group: THREE.Group;
  rockColliders: RockCollider[];
  grassMeshes: THREE.InstancedMesh[];
}

const TREES_PER_CHUNK = 4;
const BUSHES_PER_CHUNK = 3;
const ROCKS_PER_CHUNK = 2;
const GRASS_PER_CHUNK = 1500;
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

// ---------- Grass trample shader ----------
// Shared uniform object — one trample position drives every grass material,
// regardless of how many chunks/variants exist, since it's mutated in place.
const trampleUniforms = {
  uTramplePos: { value: new THREE.Vector3(99999, 0, 99999) },
  uTrampleRadius: { value: 2.2 },
  uTrampleStrength: { value: 0.5 },
};

export function updateGrassTrample(worldPosition: THREE.Vector3) {
  trampleUniforms.uTramplePos.value.copy(worldPosition);
}

interface GrassVariant {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  tipHeight: number;
}

const grassVariantCache = new Map<THREE.Group, GrassVariant>();

function getGrassVariant(template: THREE.Group): GrassVariant | null {
  if (grassVariantCache.has(template)) {
    return grassVariantCache.get(template)!;
  }

  const mesh = extractMesh(template);
  if (!mesh) return null;

  mesh.geometry.computeBoundingBox();
  const tipHeight = mesh.geometry.boundingBox ? mesh.geometry.boundingBox.max.y : 1;

  const material = (mesh.material as THREE.MeshStandardMaterial).clone();
  material.color = new THREE.Color(0x4caf50);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTramplePos = trampleUniforms.uTramplePos;
    shader.uniforms.uTrampleRadius = trampleUniforms.uTrampleRadius;
    shader.uniforms.uTrampleStrength = trampleUniforms.uTrampleStrength;
    shader.uniforms.uGrassHeight = { value: tipHeight || 1 };

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `
      #include <common>
      uniform vec3 uTramplePos;
      uniform float uTrampleRadius;
      uniform float uTrampleStrength;
      uniform float uGrassHeight;
      `
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 instanceWorldPos = (instanceMatrix * vec4(transformed, 1.0)).xyz;
        float distToTrample = distance(instanceWorldPos.xz, uTramplePos.xz);
        float bendAmount = smoothstep(uTrampleRadius, 0.0, distToTrample);
        float heightFactor = clamp(transformed.y / max(uGrassHeight, 0.0001), 0.0, 1.0);
        vec2 pushDir = normalize(instanceWorldPos.xz - uTramplePos.xz + 0.0001);
        transformed.xz += pushDir * bendAmount * heightFactor * uTrampleStrength;
        transformed.y -= bendAmount * heightFactor * uTrampleStrength * 0.35;
      #endif
      `
    );
  };
  material.needsUpdate = true;

  const variant: GrassVariant = { geometry: mesh.geometry, material, tipHeight: tipHeight || 1 };
  grassVariantCache.set(template, variant);
  return variant;
}

function createGrassForChunk(
  chunkX: number,
  chunkZ: number,
  grassTemplates: THREE.Group[],
  terrainMesh: THREE.Mesh
): THREE.InstancedMesh[] {
  const worldOffsetX = chunkX * CHUNK_SIZE;
  const worldOffsetZ = chunkZ * CHUNK_SIZE;

  const variants = grassTemplates
    .map((t) => getGrassVariant(t))
    .filter((v): v is GrassVariant => v !== null);
  if (variants.length === 0) return [];

  // Bucket instance transforms per variant first, then build one InstancedMesh per variant
  const buckets: THREE.Matrix4[][] = variants.map(() => []);

  const gridSize = Math.ceil(Math.sqrt(GRASS_PER_CHUNK));
  const cellSize = CHUNK_SIZE / gridSize;

  let index = 0;
  for (let gx = 0; gx < gridSize; gx++) {
    for (let gz = 0; gz < gridSize; gz++) {
      const jitterX = seededRandom(chunkX, chunkZ, 20 + index * 1.7);
      const jitterZ = seededRandom(chunkX, chunkZ, 20 + index * 1.7 + 0.5);
      const rr = seededRandom(chunkX, chunkZ, 20 + index * 1.7 + 0.9);
      const rs = seededRandom(chunkX, chunkZ, 20 + index * 1.7 + 1.3);
      const rv = seededRandom(chunkX, chunkZ, 20 + index * 1.7 + 1.7);
      index++;

      const cellCenterX = -CHUNK_SIZE / 2 + gx * cellSize + cellSize / 2;
      const cellCenterZ = -CHUNK_SIZE / 2 + gz * cellSize + cellSize / 2;
      const localX = cellCenterX + (jitterX - 0.5) * cellSize * 0.45;
      const localZ = cellCenterZ + (jitterZ - 0.5) * cellSize * 0.45;

      const worldX = worldOffsetX + localX;
      const worldZ = worldOffsetZ + localZ;

      const distanceFromOrigin = Math.sqrt(worldX * worldX + worldZ * worldZ);
      if (distanceFromOrigin < SPAWN_CLEAR_RADIUS) continue;

      const variantIndex = Math.floor(rv * variants.length);
      const scale = 0.8 + rs * 0.5;
      const height = sampleHeightOnMesh(terrainMesh, worldX, worldZ);

      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3(worldX, height, worldZ);
      const quaternion = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        rr * Math.PI * 2
      );
      const scaleVec = new THREE.Vector3(scale, scale, scale);

      matrix.compose(position, quaternion, scaleVec);
      buckets[variantIndex].push(matrix);
    }
  }

  const meshes: THREE.InstancedMesh[] = [];

  buckets.forEach((matrices, i) => {
    if (matrices.length === 0) return;
    const variant = variants[i];
    const instanced = new THREE.InstancedMesh(variant.geometry, variant.material, matrices.length);
    instanced.castShadow = false;
    instanced.receiveShadow = true;

    matrices.forEach((m, idx) => instanced.setMatrixAt(idx, m));
    instanced.instanceMatrix.needsUpdate = true;
    meshes.push(instanced);
  });

  return meshes;
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
    child.castShadow = true; // shadows from dozens of trees/bushes/rocks are expensive; keep receiveShadow only
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

  const grassMeshes = createGrassForChunk(chunkX, chunkZ, assets.grassVariants, terrainMesh);

  return { group, rockColliders, grassMeshes };
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