import * as THREE from 'three';
import {
  createChunk,
  scatterDecorations,
  scatterCollectibles,
  animateCollectibles,
  updateGrassWind,
  updateInstancedVegetationSway,
  setGrassQuality,
  CHUNK_SIZE,
} from './chunk';
import type { ChunkAssets, TerrainCollider, CollectibleData } from './chunk';
import type { QualityProfile } from '../utils/quality';

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
  private readonly neededKeys = new Set<string>();
  private readonly colliderCache: TerrainCollider[] = [];
  private readonly collisionResults: CollectibleData[] = [];
  private collidersDirty = true;
  private centerX = Number.NaN;
  private centerZ = Number.NaN;
  private lodX = Number.NaN;
  private lodZ = Number.NaN;
  private quality: QualityProfile;

  constructor(scene: THREE.Scene, assets: ChunkAssets, quality: QualityProfile) {
    this.scene = scene;
    this.assets = assets;
    this.quality = quality;
    setGrassQuality(quality);
  }

  private key(x: number, z: number) {
    return `${x},${z}`;
  }

  update(playerPosition: THREE.Vector3) {
    const centerX = Math.round(playerPosition.x / CHUNK_SIZE);
    const centerZ = Math.round(playerPosition.z / CHUNK_SIZE);
    const lodMoved = !Number.isFinite(this.lodX)
      || Math.hypot(playerPosition.x - this.lodX, playerPosition.z - this.lodZ) >= 4;
    if (lodMoved) {
      this.lodX = playerPosition.x;
      this.lodZ = playerPosition.z;
      this.applyDecorationQuality(playerPosition);
    }
    if (centerX === this.centerX && centerZ === this.centerZ) return;
    this.centerX = centerX;
    this.centerZ = centerZ;

    this.neededKeys.clear();

    for (let x = centerX - LOAD_RADIUS; x <= centerX + LOAD_RADIUS; x++) {
      for (let z = centerZ - LOAD_RADIUS; z <= centerZ + LOAD_RADIUS; z++) {
        const k = this.key(x, z);
        this.neededKeys.add(k);

        if (!this.loadedChunks.has(k)) {
          const chunk = createChunk(x, z);
          this.scene.add(chunk);
          this.loadedChunks.set(k, chunk);

          const { group, terrainColliders, grassMeshes } = scatterDecorations(x, z, this.assets);
          this.scene.add(group);
          this.loadedDecorations.set(k, group);
          this.loadedColliders.set(k, terrainColliders);
          this.collidersDirty = true;

          grassMeshes.forEach((mesh) => this.scene.add(mesh));
          this.loadedGrass.set(k, grassMeshes);
          this.applyGrassQuality(grassMeshes);

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
      if (!this.neededKeys.has(k)) {
        this.unloadChunk(k, mesh);
      }
    }
    this.applyDecorationQuality(playerPosition);
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
      decorations.traverse((child) => {
        if (child instanceof THREE.InstancedMesh) child.dispose();
      });
      this.loadedDecorations.delete(key);
    }

    this.loadedColliders.delete(key);
    this.collidersDirty = true;

    const grassMeshes = this.loadedGrass.get(key);
    if (grassMeshes) {
      // Geometry and materials are shared by the module-level vegetation
      // caches. Dispose only each mesh's per-instance GPU buffers.
      grassMeshes.forEach((grass) => {
        this.scene.remove(grass);
        grass.dispose();
      });
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

      for (const id of this.activeCollectibles.keys()) {
        if (id.startsWith(`${key},`)) this.activeCollectibles.delete(id);
      }
    }
  }

  getTerrainColliders(): TerrainCollider[] {
    if (!this.collidersDirty) return this.colliderCache;
    this.colliderCache.length = 0;
    for (const colliders of this.loadedColliders.values()) this.colliderCache.push(...colliders);
    this.collidersDirty = false;
    return this.colliderCache;
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
        if (instance instanceof THREE.InstancedMesh) {
          updateInstancedVegetationSway(instance, elapsedTime);
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
    this.collisionResults.length = 0;

    for (const [id, collectible] of this.activeCollectibles) {
      const dx = collectible.x - headPosition.x;
      const dz = collectible.z - headPosition.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance < pickupRadius) {
        this.collisionResults.push(collectible);
        this.activeCollectibles.delete(id);

        collectible.mesh.parent?.remove(collectible.mesh);
        if (collectible.mesh instanceof THREE.Mesh) {
          collectible.mesh.geometry.dispose();
          (collectible.mesh.material as THREE.Material).dispose();
        }
      }
    }

    return this.collisionResults;
  }

  setQuality(profile: QualityProfile, playerPosition: THREE.Vector3) {
    this.quality = profile;
    setGrassQuality(profile);
    for (const grassMeshes of this.loadedGrass.values()) this.applyGrassQuality(grassMeshes);
    this.applyDecorationQuality(playerPosition);
  }

  private applyGrassQuality(meshes: THREE.InstancedMesh[]) {
    for (const mesh of meshes) {
      const maximumCount = Number(mesh.userData.maximumCount ?? mesh.instanceMatrix.count);
      const kind = mesh.userData.qualityKind as string | undefined;
      const density = kind === 'flowers' ? this.quality.flowerDensity : this.quality.grassDensity;
      mesh.count = Math.max(kind === 'flowers' ? 1 : 8, Math.round(maximumCount * density));
      mesh.receiveShadow = kind === 'flowers' && this.quality.tier !== 'low';
    }
  }

  private applyDecorationQuality(playerPosition: THREE.Vector3) {
    for (const group of this.loadedDecorations.values()) {
      const distance = Math.hypot(
        group.position.x - playerPosition.x,
        group.position.z - playerPosition.z
      );
      const withinShadowRange = distance <= this.quality.shadowDistance;
      for (const child of group.children) {
        if (!(child instanceof THREE.InstancedMesh)) continue;
        const kind = child.userData.qualityKind as string | undefined;
        const maximumCount = Number(child.userData.maximumCount ?? child.instanceMatrix.count);
        child.count = kind === 'bush'
          ? Math.max(1, Math.round(maximumCount * this.quality.bushDensity))
          : maximumCount;
        child.castShadow =
          this.quality.vegetationShadows
          && withinShadowRange
          && (kind !== 'bush' || this.quality.tier === 'high');
        child.receiveShadow = this.quality.tier !== 'low';
      }
    }
  }

  dispose() {
    for (const [key, mesh] of this.loadedChunks) {
      this.unloadChunk(key, mesh);
    }
    this.activeCollectibles.clear();
  }
}
