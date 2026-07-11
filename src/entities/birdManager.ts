import * as THREE from 'three';
import { Bird } from './bird';

const BIRD_COUNT = 10;
const SPAWN_RADIUS = 40;
const DESPAWN_RADIUS = 60;
const EAT_DISTANCE = 1.0;

export class BirdManager {
  private scene: THREE.Scene;
  private model: THREE.Group;
  private birds: Bird[] = [];

  constructor(scene: THREE.Scene, model: THREE.Group) {
    this.scene = scene;
    this.model = model;
  }

  private spawnOne(nearPosition: THREE.Vector3) {
    const angle = Math.random() * Math.PI * 2;
    const dist = SPAWN_RADIUS * 0.3 + Math.random() * SPAWN_RADIUS * 0.7;
    const position = new THREE.Vector3(
      nearPosition.x + Math.cos(angle) * dist,
      0.3,
      nearPosition.z + Math.sin(angle) * dist
    );

    const bird = new Bird(position, this.model);
    this.birds.push(bird);
    this.scene.add(bird.mesh);
  }

  private removeBird(index: number) {
    const bird = this.birds[index];
    this.scene.remove(bird.mesh);
    this.birds.splice(index, 1);
  }

  update(delta: number, snakeHeadPosition: THREE.Vector3): number {
    let eatenCount = 0;

    for (const bird of this.birds) {
      bird.update(delta, snakeHeadPosition);
    }

    for (let i = this.birds.length - 1; i >= 0; i--) {
      const bird = this.birds[i];
      if (!bird.isCatchable()) continue;

      const distance = bird.mesh.position.distanceTo(snakeHeadPosition);
      if (distance < EAT_DISTANCE) {
        this.removeBird(i);
        eatenCount++;
      }
    }

    for (let i = this.birds.length - 1; i >= 0; i--) {
      const bird = this.birds[i];
      const distance = bird.mesh.position.distanceTo(snakeHeadPosition);
      const escapedHigh = !bird.isCatchable() && bird.mesh.position.y >= 7.5;

      if (distance > DESPAWN_RADIUS || escapedHigh) {
        this.removeBird(i);
      }
    }

    while (this.birds.length < BIRD_COUNT) {
      this.spawnOne(snakeHeadPosition);
    }

    return eatenCount;
  }
}