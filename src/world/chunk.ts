import * as THREE from 'three';
import {
  BIOMES,
  blendBiomeColor,
  blendBiomeNumber,
  chooseBiome,
  createBiomeSample,
  sampleBiome,
  sampleClearing,
  sampleTrail,
} from './biomes';
import type { BiomeId, TrailSample } from './biomes';
import { coordinateRandom, smoothstep } from './procedural';
import { getTerrainHeight, getTerrainSlope, getTerrainSurfaceVariation } from './terrain';

export const CHUNK_SIZE = 50;
const SEGMENTS = 32;

export { getTerrainHeight };

function createGroundDetailTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#d8d8ca';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 3600; i++) {
    const x = coordinateRandom(i, 3, 1.7) * size;
    const y = coordinateRandom(i, 7, 4.9) * size;
    const shade = 0.72 + coordinateRandom(i, 11, 8.1) * 0.22;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(coordinateRandom(i, 13, 10.5) * Math.PI);
    ctx.fillStyle = `rgba(53, 56, 46, ${0.04 + (1 - shade) * 0.14})`;
    const width = 0.5 + coordinateRandom(i, 17, 12.1) * 1.1;
    const height = 1.4 + coordinateRandom(i, 19, 14.7) * 3.4;
    ctx.fillRect(-width * 0.5, -height * 0.5, width, height);
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.repeat.set(11, 11);
  return texture;
}

const groundDetailTexture = createGroundDetailTexture();
const groundLowColor = new THREE.Color();
const groundHighColor = new THREE.Color();
const groundRockColor = new THREE.Color();
const groundTrailColor = new THREE.Color();
const groundScratchColor = new THREE.Color();
const chunkBiomeSample = createBiomeSample();
const chunkTrailSample: TrailSample = { distance: 0, width: 0, influence: 0 };

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
    position.setY(i, getTerrainHeight(worldX, worldZ));
  }

  geometry.computeVertexNormals();
  const normal = geometry.attributes.normal;
  const colors = new Float32Array(position.count * 3);

  for (let i = 0; i < position.count; i++) {
    const worldX = position.getX(i) + worldOffsetX;
    const worldZ = position.getZ(i) + worldOffsetZ;
    const height = position.getY(i);
    const biome = sampleBiome(worldX, worldZ, chunkBiomeSample);
    const surfaceVariation = getTerrainSurfaceVariation(worldX, worldZ);
    const heightBlend = smoothstep(-1.2, 3.8, height);
    const slopeBlend = smoothstep(0.08, 0.42, 1 - normal.getY(i));
    const trailInfluence = sampleTrail(worldX, worldZ, chunkTrailSample).influence;
    const clearingInfluence = sampleClearing(worldX, worldZ);

    blendBiomeColor(biome, 'groundLow', groundLowColor);
    blendBiomeColor(biome, 'groundHigh', groundHighColor);
    blendBiomeColor(biome, 'rock', groundRockColor);
    blendBiomeColor(biome, 'trail', groundTrailColor);

    groundScratchColor
      .copy(groundLowColor)
      .lerp(groundHighColor, 0.22 + surfaceVariation * 0.46 + heightBlend * 0.16)
      .lerp(groundRockColor, slopeBlend * (0.62 + biome.weights.rocky * 0.28))
      .lerp(groundHighColor, clearingInfluence * 0.09)
      .lerp(groundTrailColor, trailInfluence * 0.94);

    colors[i * 3] = groundScratchColor.r;
    colors[i * 3 + 1] = groundScratchColor.g;
    colors[i * 3 + 2] = groundScratchColor.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.MeshStandardMaterial({
    map: groundDetailTexture,
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTerrainAmbientFloor = { value: 0.2 };
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `
      #include <common>
      uniform float uTerrainAmbientFloor;
      `
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `
      #include <emissivemap_fragment>
      totalEmissiveRadiance += pow(max(diffuseColor.rgb, vec3(0.0)), vec3(0.65)) * uTerrainAmbientFloor;
      `
    );
  };
  material.customProgramCacheKey = () => 'wild-roads-biome-terrain-v1';
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(worldOffsetX, 0, worldOffsetZ);
  mesh.receiveShadow = true;

  return mesh;
}

export interface ChunkAssets {
  trees: THREE.Group[];
  bushes: THREE.Group[];
  rocks: THREE.Group[];
  grassVariants: THREE.Group[];
}

export interface TerrainCollider {
  x: number;
  z: number;
  radius: number;
  kind: 'tree' | 'rock';
}

export interface ChunkDecorations {
  group: THREE.Group;
  terrainColliders: TerrainCollider[];
  grassMeshes: THREE.InstancedMesh[];
}

const TREE_CANDIDATES_PER_CHUNK = 14;
const BUSH_CANDIDATES_PER_CHUNK = 12;
const ROCK_CANDIDATES_PER_CHUNK = 10;
const GRASS_GRID_SIZE = 58;
const FLOWER_GRID_SIZE = 7;
const SPAWN_CLEAR_RADIUS = 8;

type DecorationKind = 'tree' | 'bush' | 'rock';

interface ObjectMetrics {
  groundOffset: number;
  radius: number;
}

interface PlacedFootprint {
  x: number;
  z: number;
  radius: number;
}

const metricsCache = new WeakMap<THREE.Object3D, ObjectMetrics>();
const styledTemplateCache = new WeakMap<THREE.Group, Map<string, THREE.Group>>();

function getGroundOffset(object: THREE.Object3D): number {
  return getObjectMetrics(object).groundOffset;
}

function getHorizontalRadius(object: THREE.Object3D): number {
  return getObjectMetrics(object).radius;
}

function getObjectMetrics(object: THREE.Object3D): ObjectMetrics {
  const cached = metricsCache.get(object);
  if (cached) return cached;

  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  const metrics = {
    groundOffset: -box.min.y,
    radius: Math.max(size.x, size.z) / 2,
  };
  metricsCache.set(object, metrics);
  return metrics;
}

function cloneTintedMaterial(material: THREE.Material, tint: THREE.Color, strength: number) {
  const clone = material.clone();
  const colorMaterial = clone as THREE.Material & {
    color?: THREE.Color;
    roughness?: number;
    metalness?: number;
  };

  colorMaterial.color?.lerp(tint, strength);
  if (typeof colorMaterial.roughness === 'number') colorMaterial.roughness = Math.max(0.72, colorMaterial.roughness);
  if (typeof colorMaterial.metalness === 'number') colorMaterial.metalness *= 0.25;
  return clone;
}

function getStyledTemplate(
  template: THREE.Group,
  biomeId: BiomeId,
  kind: DecorationKind
): THREE.Group {
  let variants = styledTemplateCache.get(template);
  if (!variants) {
    variants = new Map();
    styledTemplateCache.set(template, variants);
  }

  const cacheKey = `${biomeId}:${kind}`;
  const cached = variants.get(cacheKey);
  if (cached) return cached;

  const styled = template.clone(true);
  const definition = BIOMES[biomeId];
  const tint = new THREE.Color(
    kind === 'tree' ? definition.canopy : kind === 'bush' ? definition.bush : definition.rock
  );
  const strength =
    kind === 'tree' ? (biomeId === 'autumn' ? 0.72 : 0.5) : kind === 'bush' ? 0.62 : 0.2;

  styled.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materialNames = Array.isArray(child.material)
      ? child.material.map((material) => material.name).join(' ')
      : child.material.name;
    const isWood = /trunk|branch|bark/i.test(`${child.name} ${materialNames}`);
    const materialTint = isWood ? new THREE.Color(0x5d4935) : tint;
    const materialStrength = isWood ? 0.18 : strength;
    child.material = Array.isArray(child.material)
      ? child.material.map((material) => cloneTintedMaterial(material, materialTint, materialStrength))
      : cloneTintedMaterial(child.material, materialTint, materialStrength);
  });

  variants.set(cacheKey, styled);
  return styled;
}

function chooseTemplate(
  templates: THREE.Group[],
  biomeId: BiomeId,
  kind: DecorationKind,
  roll: number
): THREE.Group {
  const preferred = kind === 'tree' ? BIOMES[biomeId].preferredTrees : templates.map((_, index) => index);
  const available = preferred.filter((index) => index >= 0 && index < templates.length);
  const indexes = available.length > 0 ? available : templates.map((_, index) => index);
  const index = indexes[Math.min(indexes.length - 1, Math.floor(roll * indexes.length))];
  return getStyledTemplate(templates[index], biomeId, kind);
}

function overlapsFootprint(x: number, z: number, radius: number, placed: PlacedFootprint[]): boolean {
  return placed.some((item) => Math.hypot(x - item.x, z - item.z) < radius + item.radius + 0.35);
}

// ---------- Dense procedural grass ----------
const trampleUniforms = {
  uTime: { value: 0 },
  uTramplePoints: {
    value: Array.from({ length: 6 }, () => new THREE.Vector3(99999, 0, 99999)),
  },
  uTrampleRadius: { value: 1.45 },
  uTrampleStrength: { value: 0.72 },
};

export function updateGrassTrample(worldPosition: THREE.Vector3) {
  const points = trampleUniforms.uTramplePoints.value;
  for (let index = points.length - 1; index > 0; index--) points[index].copy(points[index - 1]);
  points[0].copy(worldPosition);
}

export function updateGrassWind(elapsedTime: number) {
  trampleUniforms.uTime.value = elapsedTime;
}

interface GrassVariant {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  tipHeight: number;
}

let proceduralGrassVariant: GrassVariant | null = null;

function getProceduralGrassVariant(): GrassVariant {
  if (proceduralGrassVariant) return proceduralGrassVariant;

  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const segments = 4;
  const bladeWidth = 0.085;

  // Two crossed ribbons keep blades full from the chase camera without the
  // cost of cylindrical geometry.
  for (let ribbon = 0; ribbon < 2; ribbon++) {
    const angle = ribbon * Math.PI * 0.5;
    const sideX = Math.cos(angle) * bladeWidth;
    const sideZ = Math.sin(angle) * bladeWidth;
    const vertexOffset = positions.length / 3;
    for (let segment = 0; segment <= segments; segment++) {
      const t = segment / segments;
      const taper = 1 - Math.pow(t, 1.7);
      positions.push(-sideX * taper, t, -sideZ * taper, sideX * taper, t, sideZ * taper);
      uvs.push(0, t, 1, t);
      if (segment < segments) {
        const row = vertexOffset + segment * 2;
        indices.push(row, row + 1, row + 2, row + 1, row + 3, row + 2);
      }
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const tipHeight = 1;
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
    alphaTest: 0.18,
  });
  material.color = new THREE.Color(0xffffff);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = trampleUniforms.uTime;
    shader.uniforms.uTramplePoints = trampleUniforms.uTramplePoints;
    shader.uniforms.uTrampleRadius = trampleUniforms.uTrampleRadius;
    shader.uniforms.uTrampleStrength = trampleUniforms.uTrampleStrength;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `
      #include <common>
      uniform float uTime;
      uniform vec3 uTramplePoints[6];
      uniform float uTrampleRadius;
      uniform float uTrampleStrength;
      `
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 rootWorld = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float heightFactor = clamp(transformed.y, 0.0, 1.0);
        float gust = sin(rootWorld.x * 0.19 + uTime * 1.7) * 0.55
          + sin(rootWorld.z * 0.11 - uTime * 1.08) * 0.3
          + sin((rootWorld.x + rootWorld.z) * 0.045 + uTime * 0.62) * 0.15;
        transformed.x += gust * heightFactor * heightFactor * 0.24;
        transformed.z += gust * heightFactor * heightFactor * 0.08;

        float bendAmount = 0.0;
        vec2 pushDir = vec2(0.0);
        for (int i = 0; i < 6; i++) {
          vec2 delta = rootWorld.xz - uTramplePoints[i].xz;
          float distanceToTrail = length(delta);
          float trail = smoothstep(uTrampleRadius, 0.0, distanceToTrail) * (1.0 - float(i) * 0.11);
          if (trail > bendAmount) {
            bendAmount = trail;
            pushDir = normalize(delta + vec2(0.0001));
          }
        }
        transformed.xz += pushDir * bendAmount * heightFactor * uTrampleStrength;
        transformed.y *= 1.0 - bendAmount * 0.58 * heightFactor;
      #endif
      `
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <alphatest_fragment>',
      `
      #include <alphatest_fragment>
      float grassDistanceFade = 1.0 - smoothstep(34.0, 52.0, length(vViewPosition));
      float grassDither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      if (grassDither > grassDistanceFade) discard;
      `
    );
  };
  material.customProgramCacheKey = () => 'wild-roads-procedural-grass-v2';
  material.needsUpdate = true;

  proceduralGrassVariant = { geometry, material, tipHeight };
  return proceduralGrassVariant;
}

function createGrassForChunk(
  chunkX: number,
  chunkZ: number,
  _grassTemplates: THREE.Group[],
  placedFootprints: PlacedFootprint[]
): THREE.InstancedMesh[] {
  const worldOffsetX = chunkX * CHUNK_SIZE;
  const worldOffsetZ = chunkZ * CHUNK_SIZE;

  const variants = [getProceduralGrassVariant()];

  const matrixBuckets: THREE.Matrix4[][] = variants.map(() => []);
  const colorBuckets: THREE.Color[][] = variants.map(() => []);
  const cellSize = CHUNK_SIZE / GRASS_GRID_SIZE;
  const color = new THREE.Color();

  let index = 0;
  for (let gx = 0; gx < GRASS_GRID_SIZE; gx++) {
    for (let gz = 0; gz < GRASS_GRID_SIZE; gz++) {
      const jitterX = coordinateRandom(chunkX, chunkZ, 20 + index * 1.7);
      const jitterZ = coordinateRandom(chunkX, chunkZ, 20 + index * 1.7 + 0.5);
      const rotationRoll = coordinateRandom(chunkX, chunkZ, 20 + index * 1.7 + 0.9);
      const scaleRoll = coordinateRandom(chunkX, chunkZ, 20 + index * 1.7 + 1.3);
      const variantRoll = coordinateRandom(chunkX, chunkZ, 20 + index * 1.7 + 1.7);
      const densityRoll = coordinateRandom(chunkX, chunkZ, 20 + index * 1.7 + 2.1);
      index++;

      const cellCenterX = -CHUNK_SIZE / 2 + gx * cellSize + cellSize / 2;
      const cellCenterZ = -CHUNK_SIZE / 2 + gz * cellSize + cellSize / 2;
      const localX = cellCenterX + (jitterX - 0.5) * cellSize * 0.45;
      const localZ = cellCenterZ + (jitterZ - 0.5) * cellSize * 0.45;

      const worldX = worldOffsetX + localX;
      const worldZ = worldOffsetZ + localZ;

      const distanceFromOrigin = Math.sqrt(worldX * worldX + worldZ * worldZ);
      if (distanceFromOrigin < SPAWN_CLEAR_RADIUS) continue;

      const biome = sampleBiome(worldX, worldZ, chunkBiomeSample);
      const trailInfluence = sampleTrail(worldX, worldZ, chunkTrailSample).influence;
      const clearingInfluence = sampleClearing(worldX, worldZ);
      const slope = getTerrainSlope(worldX, worldZ);
      const grassDensity =
        blendBiomeNumber(biome, 'grassDensity') *
        (1 - trailInfluence * 0.96) *
        (1 - clearingInfluence * 0.48) *
        (1 - smoothstep(0.38, 0.95, slope));

      if (densityRoll > grassDensity) continue;
      if (overlapsFootprint(worldX, worldZ, 0.18, placedFootprints)) continue;

      const grassBiome = chooseBiome(biome, variantRoll);
      const variantIndex = 0;
      const biomeScale = grassBiome === 'meadow' ? 0.92 : grassBiome === 'rocky' ? 0.58 : 0.78;
      const scale = (0.62 + scaleRoll * 0.62) * biomeScale;
      const height = getTerrainHeight(worldX, worldZ);

      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3(worldX, height, worldZ);
      const quaternion = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        rotationRoll * Math.PI * 2
      );
      const scaleVec = new THREE.Vector3(scale, scale, scale);

      matrix.compose(position, quaternion, scaleVec);
      matrixBuckets[variantIndex].push(matrix);
      blendBiomeColor(biome, 'grass', color);
      color.offsetHSL((variantRoll - 0.5) * 0.025, 0, (scaleRoll - 0.5) * 0.08);
      colorBuckets[variantIndex].push(color.clone());
    }
  }

  const meshes: THREE.InstancedMesh[] = [];

  matrixBuckets.forEach((matrices, i) => {
    if (matrices.length === 0) return;
    const variant = variants[i];
    const instanced = new THREE.InstancedMesh(variant.geometry, variant.material, matrices.length);
    instanced.name = `biome-grass-${chunkX}-${chunkZ}-${i}`;
    instanced.castShadow = false;
    instanced.receiveShadow = true;
    instanced.frustumCulled = true;

    matrices.forEach((matrix, instanceIndex) => {
      instanced.setMatrixAt(instanceIndex, matrix);
      instanced.setColorAt(instanceIndex, colorBuckets[i][instanceIndex]);
    });
    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
    meshes.push(instanced);
  });

  return meshes;
}

const flowerStemGeometry = new THREE.CylinderGeometry(0.012, 0.018, 0.3, 4);
const flowerHeadGeometry = new THREE.OctahedronGeometry(0.07, 0);
const flowerStemMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 });
const flowerHeadMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.76 });

function createFlowersForChunk(
  chunkX: number,
  chunkZ: number,
  placedFootprints: PlacedFootprint[]
): THREE.InstancedMesh[] {
  const worldOffsetX = chunkX * CHUNK_SIZE;
  const worldOffsetZ = chunkZ * CHUNK_SIZE;
  const cellSize = CHUNK_SIZE / FLOWER_GRID_SIZE;
  const stemMatrices: THREE.Matrix4[] = [];
  const headMatrices: THREE.Matrix4[] = [];
  const stemColors: THREE.Color[] = [];
  const headColors: THREE.Color[] = [];
  const stemColor = new THREE.Color();
  const headColor = new THREE.Color();

  let index = 0;
  for (let gridX = 0; gridX < FLOWER_GRID_SIZE; gridX++) {
    for (let gridZ = 0; gridZ < FLOWER_GRID_SIZE; gridZ++) {
      const jitterX = coordinateRandom(chunkX, chunkZ, 610 + index * 2.3);
      const jitterZ = coordinateRandom(chunkX, chunkZ, 610 + index * 2.3 + 0.4);
      const densityRoll = coordinateRandom(chunkX, chunkZ, 610 + index * 2.3 + 0.8);
      const scaleRoll = coordinateRandom(chunkX, chunkZ, 610 + index * 2.3 + 1.2);
      index++;

      const localX = -CHUNK_SIZE / 2 + (gridX + 0.2 + jitterX * 0.6) * cellSize;
      const localZ = -CHUNK_SIZE / 2 + (gridZ + 0.2 + jitterZ * 0.6) * cellSize;
      const worldX = worldOffsetX + localX;
      const worldZ = worldOffsetZ + localZ;
      if (Math.hypot(worldX, worldZ) < SPAWN_CLEAR_RADIUS) continue;

      const biome = sampleBiome(worldX, worldZ, chunkBiomeSample);
      const clearing = sampleClearing(worldX, worldZ);
      const trail = sampleTrail(worldX, worldZ, chunkTrailSample).influence;
      const slope = getTerrainSlope(worldX, worldZ);
      const density =
        blendBiomeNumber(biome, 'flowerDensity') *
        (0.42 + clearing * 0.48) *
        (1 - trail * 0.88) *
        (1 - smoothstep(0.32, 0.72, slope));
      if (densityRoll > density) continue;
      if (overlapsFootprint(worldX, worldZ, 0.12, placedFootprints)) continue;

      const scale = 0.78 + scaleRoll * 0.55;
      const height = getTerrainHeight(worldX, worldZ);
      const stemMatrix = new THREE.Matrix4().compose(
        new THREE.Vector3(worldX, height + 0.15 * scale, worldZ),
        new THREE.Quaternion(),
        new THREE.Vector3(scale, scale, scale)
      );
      const headMatrix = new THREE.Matrix4().compose(
        new THREE.Vector3(worldX, height + 0.31 * scale, worldZ),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), scaleRoll * Math.PI),
        new THREE.Vector3(scale, scale, scale)
      );

      blendBiomeColor(biome, 'grass', stemColor).multiplyScalar(0.72);
      blendBiomeColor(biome, 'flower', headColor).offsetHSL((scaleRoll - 0.5) * 0.04, 0, 0.04);
      stemMatrices.push(stemMatrix);
      headMatrices.push(headMatrix);
      stemColors.push(stemColor.clone());
      headColors.push(headColor.clone());
    }
  }

  if (stemMatrices.length === 0) return [];

  const stems = new THREE.InstancedMesh(flowerStemGeometry, flowerStemMaterial, stemMatrices.length);
  const heads = new THREE.InstancedMesh(flowerHeadGeometry, flowerHeadMaterial, headMatrices.length);
  stems.name = `wildflower-stems-${chunkX}-${chunkZ}`;
  heads.name = `wildflower-heads-${chunkX}-${chunkZ}`;
  stems.receiveShadow = true;
  heads.receiveShadow = true;

  stemMatrices.forEach((matrix, instanceIndex) => {
    stems.setMatrixAt(instanceIndex, matrix);
    stems.setColorAt(instanceIndex, stemColors[instanceIndex]);
    heads.setMatrixAt(instanceIndex, headMatrices[instanceIndex]);
    heads.setColorAt(instanceIndex, headColors[instanceIndex]);
  });
  stems.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  if (stems.instanceColor) stems.instanceColor.needsUpdate = true;
  if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
  return [stems, heads];
}

export function scatterDecorations(
  chunkX: number,
  chunkZ: number,
  assets: ChunkAssets
): ChunkDecorations {
  const group = new THREE.Group();
  const terrainColliders: TerrainCollider[] = [];
  const placedFootprints: PlacedFootprint[] = [];
  const worldOffsetX = chunkX * CHUNK_SIZE;
  const worldOffsetZ = chunkZ * CHUNK_SIZE;

  const placeItems = (
    candidateCount: number,
    templates: THREE.Group[],
    salt: number,
    scaleRange: [number, number],
    kind: DecorationKind,
    swayAmount: number = 0
  ) => {
    const densityKey =
      kind === 'tree' ? 'treeDensity' : kind === 'bush' ? 'bushDensity' : 'rockDensity';

    for (let i = 0; i < candidateCount; i++) {
      const rx = coordinateRandom(chunkX, chunkZ, salt + i * 2.1);
      const rz = coordinateRandom(chunkX, chunkZ, salt + i * 2.1 + 0.5);
      const scaleRoll = coordinateRandom(chunkX, chunkZ, salt + i * 2.1 + 0.9);
      const rotationRoll = coordinateRandom(chunkX, chunkZ, salt + i * 2.1 + 1.3);
      const variantRoll = coordinateRandom(chunkX, chunkZ, salt + i * 2.1 + 1.7);
      const densityRoll = coordinateRandom(chunkX, chunkZ, salt + i * 2.1 + 1.93);

      const localX = (rx - 0.5) * CHUNK_SIZE;
      const localZ = (rz - 0.5) * CHUNK_SIZE;
      const worldX = worldOffsetX + localX;
      const worldZ = worldOffsetZ + localZ;
      const edgeDistance = CHUNK_SIZE * 0.5 - Math.max(Math.abs(localX), Math.abs(localZ));
      const edgeClearance = kind === 'tree' ? 2.8 : kind === 'rock' ? 1.8 : 1.2;

      const distanceFromOrigin = Math.sqrt(worldX * worldX + worldZ * worldZ);
      if (distanceFromOrigin < SPAWN_CLEAR_RADIUS || edgeDistance < edgeClearance) continue;

      const biome = sampleBiome(worldX, worldZ, chunkBiomeSample);
      const clearing = sampleClearing(worldX, worldZ);
      const trail = sampleTrail(worldX, worldZ, chunkTrailSample).influence;
      const slope = getTerrainSlope(worldX, worldZ);
      const clearingReduction = kind === 'tree' ? 0.84 : kind === 'bush' ? 0.58 : 0.32;
      const baseAcceptance = kind === 'rock' ? 0.7 : 0.78;
      const density =
        blendBiomeNumber(biome, densityKey) *
        (1 - clearing * clearingReduction) *
        (1 - trail * (kind === 'rock' ? 0.88 : 0.98)) *
        baseAcceptance;
      const slopeLimit = kind === 'tree' ? 0.48 : kind === 'bush' ? 0.68 : 1.45;

      if (densityRoll > density || slope > slopeLimit) continue;

      const biomeId = chooseBiome(biome, variantRoll);
      const template = chooseTemplate(templates, biomeId, kind, variantRoll);
      const groundOffset = getGroundOffset(template);
      const baseRadius = getHorizontalRadius(template);
      const instance = template.clone(true);
      const variation = scaleRange[0] + scaleRoll * (scaleRange[1] - scaleRange[0]);
      const footprintRadius = Math.max(0.38, baseRadius * variation * (kind === 'bush' ? 0.48 : 0.7));
      if (overlapsFootprint(worldX, worldZ, footprintRadius, placedFootprints)) continue;

      instance.scale.multiplyScalar(variation);

      const height = getTerrainHeight(worldX, worldZ);
      instance.position.set(localX, height + groundOffset * variation, localZ);
      instance.rotation.y = rotationRoll * Math.PI * 2;

      if (swayAmount > 0) {
        instance.userData.sway = true;
        instance.userData.swayPhase = rotationRoll * Math.PI * 2;
        instance.userData.swaySpeed = 0.4 + scaleRoll * 0.4;
        instance.userData.swayAmount = swayAmount;
      }

      instance.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      group.add(instance);
      placedFootprints.push({ x: worldX, z: worldZ, radius: footprintRadius });

      if (kind === 'tree' || kind === 'rock') {
        terrainColliders.push({
          x: worldX,
          z: worldZ,
          radius: footprintRadius,
          kind,
        });
      }
    }
  };

  placeItems(TREE_CANDIDATES_PER_CHUNK, assets.trees, 1, [0.78, 1.26], 'tree', 0.018);
  placeItems(ROCK_CANDIDATES_PER_CHUNK, assets.rocks, 4, [0.62, 1.24], 'rock');
  placeItems(BUSH_CANDIDATES_PER_CHUNK, assets.bushes, 2, [0.7, 1.12], 'bush', 0.035);

  group.position.set(worldOffsetX, 0, worldOffsetZ);

  const grassMeshes = [
    ...createGrassForChunk(chunkX, chunkZ, assets.grassVariants, placedFootprints),
    ...createFlowersForChunk(chunkX, chunkZ, placedFootprints),
  ];

  return { group, terrainColliders, grassMeshes };
}

export function resolveTerrainCollisions(
  position: THREE.Vector3,
  colliders: TerrainCollider[],
  bufferRadius: number
) {
  for (const collider of colliders) {
    const dx = position.x - collider.x;
    const dz = position.z - collider.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    const minDistance = collider.radius + bufferRadius;

    if (distance < minDistance && distance > 0.0001) {
      const pushOutFactor = minDistance / distance;
      position.x = collider.x + dx * pushOutFactor;
      position.z = collider.z + dz * pushOutFactor;
    }
  }
}

// ---------- Collectibles / power-ups ----------

export type CollectibleType = 'speed' | 'stamina' | 'score';

export interface CollectibleData {
  id: string;
  type: CollectibleType;
  x: number;
  z: number;
  mesh: THREE.Object3D;
}

export interface ChunkCollectibles {
  group: THREE.Group;
  collectibles: CollectibleData[];
}

const COLLECTIBLES_PER_CHUNK = 1;
const COLLECTIBLE_SPAWN_CHANCE = 0.6;
const COLLECTIBLE_FLOAT_HEIGHT = 0.8;

const COLLECTIBLE_COLORS: Record<CollectibleType, number> = {
  speed: 0xffcc33,
  stamina: 0x33ccff,
  score: 0xff44aa,
};

function createCollectibleMesh(type: CollectibleType): THREE.Object3D {
  let geometry: THREE.BufferGeometry;

  switch (type) {
    case 'speed':
      geometry = new THREE.ConeGeometry(0.3, 0.7, 4);
      break;
    case 'stamina':
      geometry = new THREE.SphereGeometry(0.35, 12, 12);
      break;
    case 'score':
      geometry = new THREE.OctahedronGeometry(0.4);
      break;
  }

  const material = new THREE.MeshStandardMaterial({
    color: COLLECTIBLE_COLORS[type],
    emissive: COLLECTIBLE_COLORS[type],
    emissiveIntensity: 0.6,
    roughness: 0.3,
    metalness: 0.2,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.userData.spinSpeed = 1.2 + Math.random() * 0.6;
  mesh.userData.bobPhase = Math.random() * Math.PI * 2;
  mesh.userData.collectibleType = type;

  return mesh;
}

export function scatterCollectibles(
  chunkX: number,
  chunkZ: number
): ChunkCollectibles {
  const group = new THREE.Group();
  const collectibles: CollectibleData[] = [];
  const worldOffsetX = chunkX * CHUNK_SIZE;
  const worldOffsetZ = chunkZ * CHUNK_SIZE;

  for (let i = 0; i < COLLECTIBLES_PER_CHUNK; i++) {
    const rSpawn = coordinateRandom(chunkX, chunkZ, 300 + i * 3.3);
    if (rSpawn > COLLECTIBLE_SPAWN_CHANCE) continue;

    const rx = coordinateRandom(chunkX, chunkZ, 300 + i * 3.3 + 0.7);
    const rz = coordinateRandom(chunkX, chunkZ, 300 + i * 3.3 + 1.1);
    const rt = coordinateRandom(chunkX, chunkZ, 300 + i * 3.3 + 1.5);

    const localX = (rx - 0.5) * CHUNK_SIZE;
    const localZ = (rz - 0.5) * CHUNK_SIZE;
    const worldX = worldOffsetX + localX;
    const worldZ = worldOffsetZ + localZ;

    const distanceFromOrigin = Math.sqrt(worldX * worldX + worldZ * worldZ);
    if (distanceFromOrigin < SPAWN_CLEAR_RADIUS) continue;

    const types: CollectibleType[] = ['speed', 'stamina', 'score'];
    const type = types[Math.floor(rt * types.length)];

    const height = getTerrainHeight(worldX, worldZ);
    const mesh = createCollectibleMesh(type);
    mesh.position.set(localX, height + COLLECTIBLE_FLOAT_HEIGHT, localZ);

    group.add(mesh);

    collectibles.push({
      id: `${chunkX},${chunkZ},${i}`,
      type,
      x: worldX,
      z: worldZ,
      mesh,
    });
  }

  group.position.set(worldOffsetX, 0, worldOffsetZ);

  return { group, collectibles };
}

export function animateCollectibles(group: THREE.Group, elapsedTime: number) {
  for (const child of group.children) {
    child.rotation.y = elapsedTime * child.userData.spinSpeed;
    child.position.y =
      (child.userData.baseY ?? (child.userData.baseY = child.position.y)) +
      Math.sin(elapsedTime * 2 + child.userData.bobPhase) * 0.15;
  }
}
