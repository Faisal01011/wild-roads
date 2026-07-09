import * as THREE from 'three';
import { Rabbit } from './rabbit';

const RABBIT_COUNT = 15;
const SPAWN_RADIUS = 40;
const EAT_DISTANCE = 1.2; // how close the snake head needs to be to eat

export class RabbitManager {
  private scene: THREE.Scene;
  private rabbits: Rabbit[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.spawnInitial();
  }

  private spawnInitial() {
    for (let i = 0; i < RABBIT_COUNT; i++) {
      this.spawnOne();
    }
  }

  private spawnOne() {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * SPAWN_RADIUS;
    const position = new THREE.Vector3(
      Math.cos(angle) * dist,
      0.2,
      Math.sin(angle) * dist
    );

    const rabbit = new Rabbit(position);
    this.rabbits.push(rabbit);
    this.scene.add(rabbit.mesh);
  }

  update(delta: number, snakeHeadPosition: THREE.Vector3): number {
    let eatenCount = 0;

    for (const rabbit of this.rabbits) {
      rabbit.update(delta, snakeHeadPosition);
    }

    // Check collisions — iterate backwards so removal doesn't skip entries
    for (let i = this.rabbits.length - 1; i >= 0; i--) {
      const rabbit = this.rabbits[i];
      const distance = rabbit.mesh.position.distanceTo(snakeHeadPosition);

      if (distance < EAT_DISTANCE) {
        this.scene.remove(rabbit.mesh);
        rabbit.mesh.geometry.dispose();
        (rabbit.mesh.material as THREE.Material).dispose();

        this.rabbits.splice(i, 1);
        eatenCount++;

        // Replace it so the world doesn't slowly empty out
        this.spawnOne();
      }
    }

    return eatenCount;
  }
}