import * as THREE from 'three';
import { blendBiomeColor, createBiomeSample, sampleBiome } from './biomes';
import { createSeededRandom } from './procedural';
import type { QualityProfile } from '../utils/quality';

const MOUNTAIN_COUNT = 18;
const HILL_COUNT = 14;
const FOREST_COUNT = 52;

const random = createSeededRandom(0x686f7269);

function createMountainInstances(material: THREE.Material): THREE.InstancedMesh {
  const geometry = new THREE.ConeGeometry(1, 1, 5, 1);
  geometry.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(geometry, material, MOUNTAIN_COUNT);
  const dummy = new THREE.Object3D();

  for (let index = 0; index < mesh.count; index++) {
    const angle = (index / mesh.count) * Math.PI * 2 + (random() - 0.5) * 0.18;
    const distance = 118 + random() * 38;
    const width = 12 + random() * 17;
    const height = 16 + random() * 25;
    dummy.position.set(Math.cos(angle) * distance, -13 - random() * 5, Math.sin(angle) * distance);
    dummy.rotation.y = random() * Math.PI;
    dummy.scale.set(width, height, width * (0.72 + random() * 0.42));
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }

  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = -620;
  return mesh;
}

function createHillInstances(material: THREE.Material): THREE.InstancedMesh {
  const geometry = new THREE.SphereGeometry(1, 12, 6);
  const mesh = new THREE.InstancedMesh(geometry, material, HILL_COUNT);
  const dummy = new THREE.Object3D();

  for (let index = 0; index < mesh.count; index++) {
    const angle = (index / mesh.count) * Math.PI * 2 + (random() - 0.5) * 0.24;
    const distance = 96 + random() * 27;
    dummy.position.set(Math.cos(angle) * distance, -10 - random() * 2, Math.sin(angle) * distance);
    dummy.rotation.y = random() * Math.PI;
    dummy.scale.set(22 + random() * 17, 8 + random() * 5, 18 + random() * 15);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }

  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = -610;
  return mesh;
}

function createForestInstances(material: THREE.Material): THREE.InstancedMesh {
  const geometry = new THREE.ConeGeometry(0.72, 2.8, 5, 1);
  geometry.translate(0, 1.4, 0);
  const mesh = new THREE.InstancedMesh(geometry, material, FOREST_COUNT);
  const dummy = new THREE.Object3D();

  for (let index = 0; index < mesh.count; index++) {
    const angle = (index / mesh.count) * Math.PI * 2 + (random() - 0.5) * 0.1;
    const distance = 80 + random() * 14;
    const scale = 1.8 + random() * 2.7;
    dummy.position.set(Math.cos(angle) * distance, -4.5 - random() * 1.4, Math.sin(angle) * distance);
    dummy.rotation.y = random() * Math.PI;
    dummy.scale.set(scale * (0.82 + random() * 0.32), scale, scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }

  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = -600;
  return mesh;
}

function createSilhouetteMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0x34483f,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    fog: true,
    toneMapped: true,
  });
}

export class HorizonLandmarks {
  private readonly scene: THREE.Scene;
  private readonly group = new THREE.Group();
  private readonly mountainMaterial = createSilhouetteMaterial();
  private readonly hillMaterial = createSilhouetteMaterial();
  private readonly forestMaterial = createSilhouetteMaterial();
  private readonly mountains: THREE.InstancedMesh;
  private readonly hills: THREE.InstancedMesh;
  private readonly forest: THREE.InstancedMesh;
  private readonly color = new THREE.Color();
  private readonly biomeSample = createBiomeSample();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group.name = 'biome-horizon-landmarks';
    this.mountains = createMountainInstances(this.mountainMaterial);
    this.hills = createHillInstances(this.hillMaterial);
    this.forest = createForestInstances(this.forestMaterial);
    this.group.add(this.mountains, this.hills, this.forest);
    scene.add(this.group);
  }

  update(playerPosition: THREE.Vector3) {
    this.group.position.set(playerPosition.x, playerPosition.y, playerPosition.z);
    const biome = sampleBiome(playerPosition.x, playerPosition.z, this.biomeSample);

    blendBiomeColor(biome, 'horizon', this.color);
    this.mountainMaterial.color.copy(this.color).multiplyScalar(0.68);
    this.hillMaterial.color.copy(this.color).multiplyScalar(0.82);
    blendBiomeColor(biome, 'canopy', this.forestMaterial.color).multiplyScalar(0.72);

    this.mountainMaterial.opacity = 0.34 + biome.weights.rocky * 0.5 + biome.weights.moonlit * 0.12;
    this.hillMaterial.opacity = 0.58 + biome.weights.meadow * 0.2;
    this.forestMaterial.opacity =
      0.38 + (biome.weights.pine + biome.weights.autumn + biome.weights.moonlit) * 0.4;
  }

  setQuality(profile: QualityProfile) {
    this.mountains.count = Math.max(9, Math.round(MOUNTAIN_COUNT * profile.horizonDensity));
    this.hills.count = Math.max(7, Math.round(HILL_COUNT * profile.horizonDensity));
    this.forest.count = Math.max(22, Math.round(FOREST_COUNT * profile.horizonDensity));
  }

  dispose() {
    this.scene.remove(this.group);
    this.mountains.geometry.dispose();
    this.hills.geometry.dispose();
    this.forest.geometry.dispose();
    this.mountainMaterial.dispose();
    this.hillMaterial.dispose();
    this.forestMaterial.dispose();
  }
}
