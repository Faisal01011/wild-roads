import * as THREE from 'three';
import {
  createChunk,
  scatterDecorations,
  scatterCollectibles,
  animateCollectibles,
  updateGrassWind,
  CHUNK_SIZE,
} from './chunk';
import type { ChunkAssets, TerrainCollider, CollectibleData } from './chunk';

const LOAD_RADIUS = 1;

export class ChunkManager {
  private scene: THREE.Scene;
  private assets: ChunkAssets;
  private loadedChunks: Map<string, THREE.Mesh> = new Map();
  private loadedDecorations: Map<string, THREE.Group> = new Map();
  private loadedColliders: Map<string, TerrainCollider[]> = new Map();
  private loadedGrass: Map<string, THREE.InstancedMesh[]> = new Map();
  private loadedCollectibleGroups: Map<string, THREE.Group> = new Map();
  private activeCollectibles: Map<string, CollectibleData> = new Map();

  constructor(scene: THREE.Scene, assets: ChunkAssets) {
    this.scene = scene;
    this.assets = assets;
  }

  private key(x: number, z: number) {
    return `${x},${z}`;
  }

  update(playerPosition: THREE.Vector3) {
    const centerX = Math.round(playerPosition.x / CHUNK_SIZE);
    const centerZ = Math.round(playerPosition.z / CHUNK_SIZE);

    const neededKeys = new Set<string>();

    for (let x = centerX - LOAD_RADIUS; x <= centerX + LOAD_RADIUS; x++) {
      for (let z = centerZ - LOAD_RADIUS; z <= centerZ + LOAD_RADIUS; z++) {
        const k = this.key(x, z);
        neededKeys.add(k);

        if (!this.loadedChunks.has(k)) {
          const chunk = createChunk(x, z);
          this.scene.add(chunk);
          this.loadedChunks.set(k, chunk);

          const { group, terrainColliders, grassMeshes } = scatterDecorations(x, z, this.assets);
          this.scene.add(group);
          this.loadedDecorations.set(k, group);
          this.loadedColliders.set(k, terrainColliders);

          grassMeshes.forEach((mesh) => this.scene.add(mesh));
          this.loadedGrass.set(k, grassMeshes);

          const { group: collectibleGroup, collectibles } = scatterCollectibles(x, z);
          this.scene.add(collectibleGroup);
          this.loadedCollectibleGroups.set(k, collectibleGroup);
          for (const c of collectibles) {
            this.activeCollectibles.set(c.id, c);
          }
        }
      }
    }

    for (const [k, mesh] of this.loadedChunks) {
      if (!neededKeys.has(k)) {
        this.unloadChunk(k, mesh);
      }
    }
  }

  private unloadChunk(key: string, mesh: THREE.Mesh) {
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => material.dispose());
    this.loadedChunks.delete(key);

    const decorations = this.loadedDecorations.get(key);
    if (decorations) {
      this.scene.remove(decorations);
      this.loadedDecorations.delete(key);
    }

    this.loadedColliders.delete(key);

    const grassMeshes = this.loadedGrass.get(key);
    if (grassMeshes) {
      // Geometry and materials are shared by the module-level vegetation
      // caches. Removing instances is enough when a streamed chunk unloads.
      grassMeshes.forEach((grass) => this.scene.remove(grass));
      this.loadedGrass.delete(key);
    }

    const collectibleGroup = this.loadedCollectibleGroups.get(key);
    if (collectibleGroup) {
      this.scene.remove(collectibleGroup);
      collectibleGroup.children.forEach((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
          childMaterials.forEach((material) => material.dispose());
        }
      });
      this.loadedCollectibleGroups.delete(key);

      for (const id of Array.from(this.activeCollectibles.keys())) {
        if (id.startsWith(`${key},`)) this.activeCollectibles.delete(id);
      }
    }
  }

  getTerrainColliders(): TerrainCollider[] {
    const all: TerrainCollider[] = [];
    for (const colliders of this.loadedColliders.values()) {
      all.push(...colliders);
    }
    return all;
  }

  isPositionClear(worldX: number, worldZ: number, radius: number): boolean {
    for (const colliders of this.loadedColliders.values()) {
      for (const collider of colliders) {
        if (Math.hypot(worldX - collider.x, worldZ - collider.z) < radius + collider.radius) {
          return false;
        }
      }
    }
    return true;
  }

  updateWind(elapsedTime: number) {
    updateGrassWind(elapsedTime);
    for (const decorations of this.loadedDecorations.values()) {
      for (const instance of decorations.children) {
        if (instance.userData.sway) {
          const { swayPhase, swaySpeed, swayAmount } = instance.userData;
          instance.rotation.z = Math.sin(elapsedTime * swaySpeed + swayPhase) * swayAmount;
          instance.rotation.x = Math.cos(elapsedTime * swaySpeed * 0.7 + swayPhase) * swayAmount * 0.5;
        }
      }
    }
  }

  updateCollectibleAnimations(elapsedTime: number) {
    for (const group of this.loadedCollectibleGroups.values()) {
      animateCollectibles(group, elapsedTime);
    }
  }

  checkCollectibleCollisions(headPosition: THREE.Vector3, pickupRadius: number = 0.9): CollectibleData[] {
    const collected: CollectibleData[] = [];

    for (const [id, collectible] of this.activeCollectibles) {
      const dx = collectible.x - headPosition.x;
      const dz = collectible.z - headPosition.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance < pickupRadius) {
        collected.push(collectible);
        this.activeCollectibles.delete(id);

        collectible.mesh.parent?.remove(collectible.mesh);
        if (collectible.mesh instanceof THREE.Mesh) {
          collectible.mesh.geometry.dispose();
          (collectible.mesh.material as THREE.Material).dispose();
        }
      }
    }

    return collected;
  }

  dispose() {
    for (const [key, mesh] of Array.from(this.loadedChunks.entries())) {
      this.unloadChunk(key, mesh);
    }
    this.activeCollectibles.clear();
  }
}
