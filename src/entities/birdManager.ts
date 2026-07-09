import * as THREE from 'three';
import { Bird } from './bird';

const BIRD_COUNT = 10;
const SPAWN_RADIUS = 40;
const EAT_DISTANCE = 1.0;

export class BirdManager {
  private scene: THREE.Scene;
  private birds: Bird[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    for (let i = 0; i < BIRD_COUNT; i++) {
      this.spawnOne();
    }
  }

  private spawnOne() {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * SPAWN_RADIUS;
    const position = new THREE.Vector3(
      Math.cos(angle) * dist,
      0.3,
      Math.sin(angle) * dist
    );

    const bird = new Bird(position);
    this.birds.push(bird);
    this.scene.add(bird.mesh);
  }

  update(delta: number, snakeHeadPosition: THREE.Vector3): number {
    let eatenCount = 0;

    for (const bird of this.birds) {
      bird.update(delta, snakeHeadPosition);
    }

    for (let i = this.birds.length - 1; i >= 0; i--) {
      const bird = this.birds[i];

      // Only catchable while still on the ground
      if (!bird.isCatchable()) continue;

      const distance = bird.mesh.position.distanceTo(snakeHeadPosition);
      if (distance < EAT_DISTANCE) {
        this.scene.remove(bird.mesh);
        bird.mesh.geometry.dispose();
        (bird.mesh.material as THREE.Material).dispose();

        this.birds.splice(i, 1);
        eatenCount++;
        this.spawnOne();
      }
    }

    // Also clean up birds that have flown far too high/away to matter,
    // so the array doesn't grow unbounded with "escaped" birds
    this.birds = this.birds.filter((bird) => {
      if (!bird.isCatchable() && bird.mesh.position.y >= 7.5) {
        this.scene.remove(bird.mesh);
        bird.mesh.geometry.dispose();
        (bird.mesh.material as THREE.Material).dispose();
        this.spawnOne();
        return false;
      }
      return true;
    });

    return eatenCount;
  }
}