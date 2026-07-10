import * as THREE from 'three';
import { Rabbit } from './rabbit';

const RABBIT_COUNT = 15;
const SPAWN_RADIUS = 40;
const DESPAWN_RADIUS = 60; // beyond this, a rabbit is too far to matter
const EAT_DISTANCE = 1.2;

export class RabbitManager {
  private scene: THREE.Scene;
  private rabbits: Rabbit[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  private spawnOne(nearPosition: THREE.Vector3) {
    const angle = Math.random() * Math.PI * 2;
    const dist = SPAWN_RADIUS * 0.3 + Math.random() * SPAWN_RADIUS * 0.7; // avoid spawning right on top of the player
    const position = new THREE.Vector3(
      nearPosition.x + Math.cos(angle) * dist,
      0.2,
      nearPosition.z + Math.sin(angle) * dist
    );

    const rabbit = new Rabbit(position);
    this.rabbits.push(rabbit);
    this.scene.add(rabbit.mesh);
  }

  private removeRabbit(index: number) {
    const rabbit = this.rabbits[index];
    this.scene.remove(rabbit.mesh);
    rabbit.mesh.geometry.dispose();
    (rabbit.mesh.material as THREE.Material).dispose();
    this.rabbits.splice(index, 1);
  }

  update(delta: number, snakeHeadPosition: THREE.Vector3): number {
    let eatenCount = 0;

    for (const rabbit of this.rabbits) {
      rabbit.update(delta, snakeHeadPosition);
    }

    // Eating
    for (let i = this.rabbits.length - 1; i >= 0; i--) {
      const distance = this.rabbits[i].mesh.position.distanceTo(snakeHeadPosition);
      if (distance < EAT_DISTANCE) {
        this.removeRabbit(i);
        eatenCount++;
      }
    }

    // Despawn anything too far away (keeps memory/entity count bounded)
    for (let i = this.rabbits.length - 1; i >= 0; i--) {
      const distance = this.rabbits[i].mesh.position.distanceTo(snakeHeadPosition);
      if (distance > DESPAWN_RADIUS) {
        this.removeRabbit(i);
      }
    }

    // Top up population near the player, whatever the cause of the shortfall
    while (this.rabbits.length < RABBIT_COUNT) {
      this.spawnOne(snakeHeadPosition);
    }

    return eatenCount;
  }
}