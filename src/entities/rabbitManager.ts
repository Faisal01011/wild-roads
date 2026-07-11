import * as THREE from 'three';
import { Rabbit } from './rabbit';

const RABBIT_COUNT = 15;
const SPAWN_RADIUS = 40;
const DESPAWN_RADIUS = 60;
const EAT_DISTANCE = 1.2;

export class RabbitManager {
  private scene: THREE.Scene;
  private model: THREE.Group;
  private rabbits: Rabbit[] = [];

  constructor(scene: THREE.Scene, model: THREE.Group) {
    this.scene = scene;
    this.model = model;
  }

  private spawnOne(nearPosition: THREE.Vector3) {
    const angle = Math.random() * Math.PI * 2;
    const dist = SPAWN_RADIUS * 0.3 + Math.random() * SPAWN_RADIUS * 0.7;
    const position = new THREE.Vector3(
      nearPosition.x + Math.cos(angle) * dist,
      0.2,
      nearPosition.z + Math.sin(angle) * dist
    );

    const rabbit = new Rabbit(position, this.model);
    this.rabbits.push(rabbit);
    this.scene.add(rabbit.mesh);
  }

  private removeRabbit(index: number) {
    const rabbit = this.rabbits[index];
    this.scene.remove(rabbit.mesh);
    this.rabbits.splice(index, 1);
  }

  update(delta: number, snakeHeadPosition: THREE.Vector3): number {
    let eatenCount = 0;

    for (const rabbit of this.rabbits) {
      rabbit.update(delta, snakeHeadPosition);
    }

    for (let i = this.rabbits.length - 1; i >= 0; i--) {
      const distance = this.rabbits[i].mesh.position.distanceTo(snakeHeadPosition);
      if (distance < EAT_DISTANCE) {
        this.removeRabbit(i);
        eatenCount++;
      }
    }

    for (let i = this.rabbits.length - 1; i >= 0; i--) {
      const distance = this.rabbits[i].mesh.position.distanceTo(snakeHeadPosition);
      if (distance > DESPAWN_RADIUS) {
        this.removeRabbit(i);
      }
    }

    while (this.rabbits.length < RABBIT_COUNT) {
      this.spawnOne(snakeHeadPosition);
    }

    return eatenCount;
  }
}