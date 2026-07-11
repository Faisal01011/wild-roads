import * as THREE from 'three';
import { createChunk, scatterDecorations, CHUNK_SIZE } from './chunk';
import type { ChunkAssets, RockCollider } from './chunk';

const LOAD_RADIUS = 3;

export class ChunkManager {
  private scene: THREE.Scene;
  private assets: ChunkAssets;
  private loadedChunks: Map<string, THREE.Mesh> = new Map();
  private loadedDecorations: Map<string, THREE.Group> = new Map();
  private loadedColliders: Map<string, RockCollider[]> = new Map();

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

          const { group, rockColliders } = scatterDecorations(x, z, this.assets);
          this.scene.add(group);
          this.loadedDecorations.set(k, group);
          this.loadedColliders.set(k, rockColliders);
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
}