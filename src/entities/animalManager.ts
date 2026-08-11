import * as THREE from 'three';
import { AnimatedAnimal } from './animatedAnimal';
import type { AnimalConfig, AnimalState } from './animatedAnimal';
import { WildlifeEffects } from './wildlifeEffects';
import type {
  WildlifeAttackEvent,
  WildlifeEatEvent,
  WildlifeThreat,
  WildlifeVariant,
} from './wildlifeTypes';
import { loadModel, getModelAnimations } from '../utils/assetLoader';

export interface SpeciesConfig extends AnimalConfig {
  modelPath: string;
  scaleCorrection: number;
  count: number;
  spawnRadius: number;
  despawnRadius: number;
  eatDistance: number;
  points: number;
  variants: readonly WildlifeVariant[];
  spawnClearRadius?: number;
  spawnExclusionRadius?: number;
  combatGraceSeconds?: number;
  isSpawnPositionClear?: (position: THREE.Vector3, radius: number) => boolean;
  debugSpawnOffsets?: readonly THREE.Vector2[];
  debugState?: AnimalState;
  debugLockState?: boolean;
}

export interface AnimalManagerResult {
  eaten: WildlifeEatEvent[];
  attacks: WildlifeAttackEvent[];
  threats: WildlifeThreat[];
}

let nextAnimalId = 1;

export class AnimalManager {
  private readonly scene: THREE.Scene;
  private readonly animals: AnimatedAnimal[] = [];
  private readonly config: SpeciesConfig;
  private readonly effects: WildlifeEffects;
  private loading = false;
  private disposed = false;
  private spawnSequence = 0;
  private combatGraceRemaining: number;
  private reducedMotion: boolean;

  constructor(
    scene: THREE.Scene,
    config: SpeciesConfig,
    effects: WildlifeEffects,
    reducedMotion: boolean
  ) {
    this.scene = scene;
    this.config = config;
    this.effects = effects;
    this.reducedMotion = reducedMotion;
    this.combatGraceRemaining = config.combatGraceSeconds ?? 0;
  }

  setReducedMotion(reduced: boolean) {
    this.reducedMotion = reduced;
    for (const animal of this.animals) animal.setReducedMotion(reduced);
  }

  private async spawnOne(nearPosition: THREE.Vector3) {
    if (this.loading || this.disposed) return;
    this.loading = true;

    try {
      const position = this.chooseSpawnPosition(nearPosition);
      if (!position) return;

      const model = await loadModel(
        this.config.modelPath,
        this.config.scaleCorrection,
        false,
        false,
        true
      );
      if (this.disposed) return;

      const animations = getModelAnimations(this.config.modelPath);
      const variant = this.config.variants[
        this.spawnSequence % Math.max(1, this.config.variants.length)
      ];
      if (!variant) throw new Error(`No wildlife variants configured for ${this.config.species}`);

      const animal = new AnimatedAnimal(
        nextAnimalId++,
        position,
        model,
        animations,
        this.config,
        variant,
        this.reducedMotion
      );
      this.spawnSequence++;
      this.animals.push(animal);
      this.scene.add(animal.mesh, animal.contactShadow, animal.presentationRoot);
    } finally {
      this.loading = false;
    }
  }

  private chooseSpawnPosition(nearPosition: THREE.Vector3): THREE.Vector3 | null {
    const clearRadius = this.config.spawnClearRadius ?? 1;
    const debugOffsets = this.config.debugSpawnOffsets;

    if (debugOffsets && debugOffsets.length > 0) {
      const offset = debugOffsets[this.spawnSequence % debugOffsets.length];
      return new THREE.Vector3(
        nearPosition.x + offset.x,
        this.config.groundOffset,
        nearPosition.z + offset.y
      );
    }

    const minimumDistance = Math.min(
      this.config.spawnRadius,
      Math.max(this.config.spawnRadius * 0.3, this.config.spawnExclusionRadius ?? 0)
    );

    for (let attempt = 0; attempt < 16; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = THREE.MathUtils.randFloat(minimumDistance, this.config.spawnRadius);
      const candidate = new THREE.Vector3(
        nearPosition.x + Math.cos(angle) * distance,
        this.config.groundOffset,
        nearPosition.z + Math.sin(angle) * distance
      );

      if (
        this.config.isSpawnPositionClear &&
        !this.config.isSpawnPositionClear(candidate, clearRadius)
      ) {
        continue;
      }
      return candidate;
    }

    return null;
  }

  private removeAnimal(index: number) {
    const animal = this.animals[index];
    this.scene.remove(animal.mesh, animal.contactShadow, animal.presentationRoot);
    this.effects.forgetAnimal(animal.id);
    animal.dispose();
    this.animals.splice(index, 1);
  }

  update(delta: number, snakeHeadPosition: THREE.Vector3): AnimalManagerResult {
    const result: AnimalManagerResult = { eaten: [], attacks: [], threats: [] };
    if (this.disposed) return result;

    this.combatGraceRemaining = Math.max(0, this.combatGraceRemaining - delta);
    const combatEnabled = this.combatGraceRemaining <= 0 || Boolean(this.config.debugState);

    for (const animal of this.animals) animal.nearbyAnimals = this.animals;

    for (const animal of this.animals) {
      const update = animal.update(delta, snakeHeadPosition, combatEnabled);
      this.effects.updateAnimal(
        animal.id,
        animal.mesh.position,
        animal.mesh.rotation.y,
        update.speed,
        animal.species,
        delta
      );

      if (update.didAttack) {
        result.attacks.push({
          animalId: animal.id,
          position: animal.mesh.position.clone(),
        });
      }
      if (update.threatLevel) {
        result.threats.push({
          id: animal.id,
          position: animal.mesh.position,
          distance: animal.mesh.position.distanceTo(snakeHeadPosition),
          level: update.threatLevel,
        });
      }
    }

    if (!this.config.isPredator) {
      for (let index = this.animals.length - 1; index >= 0; index--) {
        const animal = this.animals[index];
        const distance = animal.mesh.position.distanceTo(snakeHeadPosition);
        if (distance >= this.config.eatDistance) continue;

        const position = animal.mesh.position.clone();
        result.eaten.push({
          animalId: animal.id,
          position,
          points: this.config.points,
          accent: animal.accent,
        });
        this.effects.burst(position, animal.accent, 1.1);
        this.removeAnimal(index);
      }
    }

    for (let index = this.animals.length - 1; index >= 0; index--) {
      const distance = this.animals[index].mesh.position.distanceTo(snakeHeadPosition);
      if (distance > this.config.despawnRadius) this.removeAnimal(index);
    }

    if (this.animals.length < this.config.count && !this.loading) {
      void this.spawnOne(snakeHeadPosition);
    }

    return result;
  }

  dispose() {
    this.disposed = true;
    for (let index = this.animals.length - 1; index >= 0; index--) {
      this.removeAnimal(index);
    }
  }
}
