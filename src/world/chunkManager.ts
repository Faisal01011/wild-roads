import * as THREE from 'three';
import {
  createChunk,
  scatterDecorations,
  scatterCollectibles,
  animateCollectibles,
  CHUNK_SIZE,
} from './chunk';
import type { ChunkAssets, RockCollider, CollectibleData } from './chunk';

const LOAD_RADIUS = 1;

export class ChunkManager {
  private scene: THREE.Scene;
  private assets: ChunkAssets;
  private loadedChunks: Map<string, THREE.Mesh> = new Map();
  private loadedDecorations: Map<string, THREE.Group> = new Map();
  private loadedColliders: Map<string, RockCollider[]> = new Map();
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

          const { group, rockColliders, grassMeshes } = scatterDecorations(x, z, this.assets, chunk);
          this.scene.add(group);
          this.loadedDecorations.set(k, group);
          this.loadedColliders.set(k, rockColliders);

          grassMeshes.forEach((mesh) => this.scene.add(mesh));
          this.loadedGrass.set(k, grassMeshes);

          const { group: collectibleGroup, collectibles } = scatterCollectibles(x, z, chunk);
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
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.loadedChunks.delete(k);

        const decorations = this.loadedDecorations.get(k);
        if (decorations) {
          this.scene.remove(decorations);
          this.loadedDecorations.delete(k);
        }

        this.loadedColliders.delete(k);

        const grassMeshes = this.loadedGrass.get(k);
        if (grassMeshes) {
          // Don't dispose geometry/material here — they're shared across all
          // chunks via the module-level variant cache in chunk.ts
          grassMeshes.forEach((mesh) => this.scene.remove(mesh));
          this.loadedGrass.delete(k);
        }

        const collectibleGroup = this.loadedCollectibleGroups.get(k);
        if (collectibleGroup) {
          this.scene.remove(collectibleGroup);
          collectibleGroup.children.forEach((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              (child.material as THREE.Material).dispose();
            }
          });
          this.loadedCollectibleGroups.delete(k);

          for (const id of Array.from(this.activeCollectibles.keys())) {
            if (id.startsWith(`${k},`)) {
              this.activeCollectibles.delete(id);
            }
          }
        }
      }
    }
  }

  getRockColliders(): RockCollider[] {
    const all: RockCollider[] = [];
    for (const colliders of this.loadedColliders.values()) {
      all.push(...colliders);
    }
    return all;
  }

  updateWind(elapsedTime: number) {
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
}