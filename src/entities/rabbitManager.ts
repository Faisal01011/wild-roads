import * as THREE from 'three';
import { Rabbit } from './rabbit';

const RABBIT_COUNT = 15;
const SPAWN_RADIUS = 40;

export class RabbitManager {
  private scene: THREE.Scene;
  private rabbits: Rabbit[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.spawnInitial();
  }

  private spawnInitial() {
    for (let i = 0; i < RABBIT_COUNT; i++) {
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
  }

  update(delta: number, snakeHeadPosition: THREE.Vector3) {
    for (const rabbit of this.rabbits) {
      rabbit.update(delta, snakeHeadPosition);
    }
  }

  getRabbits(): Rabbit[] {
    return this.rabbits;
  }
}