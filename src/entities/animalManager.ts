import * as THREE from 'three';
import { AnimatedAnimal } from './animatedAnimal';
import type { AnimalConfig } from './animatedAnimal';
import { loadModel, getModelAnimations } from '../utils/assetLoader';

export interface SpeciesConfig extends AnimalConfig {
  modelPath: string;
  scaleCorrection: number;
  count: number;
  spawnRadius: number;
  despawnRadius: number;
  eatDistance: number;
  points: number;
}

export interface AnimalManagerResult {
  eatenPoints: number;
  attacks: number;
}

export class AnimalManager {
  private scene: THREE.Scene;
  private animals: AnimatedAnimal[] = [];
  private config: SpeciesConfig;
  private loading = false;
  private hasLoggedAnimations = false;

  constructor(scene: THREE.Scene, config: SpeciesConfig) {
    this.scene = scene;
    this.config = config;
  }

  private async spawnOne(nearPosition: THREE.Vector3) {
    if (this.loading) return;
    this.loading = true;

    try {
      const angle = Math.random() * Math.PI * 2;
      const dist = this.config.spawnRadius * 0.3 + Math.random() * this.config.spawnRadius * 0.7;
      const position = new THREE.Vector3(
        nearPosition.x + Math.cos(angle) * dist,
        this.config.groundOffset,
        nearPosition.z + Math.sin(angle) * dist
      );

      const model = await loadModel(this.config.modelPath, this.config.scaleCorrection, false, false, true);

      const animations = getModelAnimations(this.config.modelPath);
      if (!this.hasLoggedAnimations) {
        console.log(`Animations found for ${this.config.modelPath}:`, animations.map((a) => a.name));
        this.hasLoggedAnimations = true;
      }

      const animal = new AnimatedAnimal(position, model, animations, this.config);
      this.animals.push(animal);
      this.scene.add(animal.mesh);
    } finally {
      this.loading = false;
    }
  }

  private removeAnimal(index: number) {
    const animal = this.animals[index];
    this.scene.remove(animal.mesh);
    animal.dispose();
    this.animals.splice(index, 1);
  }

  update(delta: number, snakeHeadPosition: THREE.Vector3): AnimalManagerResult {
    let eatenPoints = 0;
    let attacks = 0;

    for (const animal of this.animals) {
  animal.nearbyAnimals = this.animals;
}

for (const animal of this.animals) {
  const caught = animal.update(delta, snakeHeadPosition);
  if (caught) attacks++;
}

    if (!this.config.isPredator) {
      for (let i = this.animals.length - 1; i >= 0; i--) {
        const distance = this.animals[i].mesh.position.distanceTo(snakeHeadPosition);
        if (distance < this.config.eatDistance) {
          this.removeAnimal(i);
          eatenPoints += this.config.points;
        }
      }
    }

    for (let i = this.animals.length - 1; i >= 0; i--) {
      const distance = this.animals[i].mesh.position.distanceTo(snakeHeadPosition);
      if (distance > this.config.despawnRadius) {
        this.removeAnimal(i);
      }
    }

    if (this.animals.length < this.config.count && !this.loading) {
      this.spawnOne(snakeHeadPosition);
    }

    return { eatenPoints, attacks };
  }
}