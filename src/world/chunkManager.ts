import * as THREE from 'three';
import { createChunk, CHUNK_SIZE } from './chunk';

const LOAD_RADIUS = 3; // chunks in each direction around the player

export class ChunkManager {
  private scene: THREE.Scene;
  private loadedChunks: Map<string, THREE.Mesh> = new Map();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  private key(x: number, z: number) {
    return `${x},${z}`;
  }

  update(playerPosition: THREE.Vector3) {
    const centerX = Math.round(playerPosition.x / CHUNK_SIZE);
    const centerZ = Math.round(playerPosition.z / CHUNK_SIZE);

    const neededKeys = new Set<string>();

    // Load chunks in radius
    for (let x = centerX - LOAD_RADIUS; x <= centerX + LOAD_RADIUS; x++) {
      for (let z = centerZ - LOAD_RADIUS; z <= centerZ + LOAD_RADIUS; z++) {
        const k = this.key(x, z);
        neededKeys.add(k);

        if (!this.loadedChunks.has(k)) {
          const chunk = createChunk(x, z);
          this.scene.add(chunk);
          this.loadedChunks.set(k, chunk);
        }
      }
    }

    // Unload chunks no longer needed
    for (const [k, mesh] of this.loadedChunks) {
      if (!neededKeys.has(k)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.loadedChunks.delete(k);
      }
    }
  }
}