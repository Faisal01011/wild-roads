import * as THREE from 'three';
import { getTerrainHeight } from '../world/chunk';

const WANDER_SPEED = 1.2;
const FLEE_SPEED = 4;
const FLEE_TRIGGER_RADIUS = 6;
const DIRECTION_CHANGE_INTERVAL = 2.5;
const GROUND_OFFSET = 0.2;

type RabbitState = 'idle' | 'wander' | 'flee';

export class Rabbit {
  public mesh: THREE.Object3D;
  private state: RabbitState = 'wander';
  private wanderDirection: THREE.Vector3;
  private timeUntilDirectionChange: number;

  constructor(position: THREE.Vector3, model: THREE.Group) {
    this.mesh = model.clone(true);
    this.mesh.position.copy(position);
    this.enableShadows(this.mesh);

    this.wanderDirection = this.randomDirection();
    this.timeUntilDirectionChange = this.randomInterval();
  }

  private enableShadows(object: THREE.Object3D) {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
      }
    });
  }

  private randomDirection(): THREE.Vector3 {
    const angle = Math.random() * Math.PI * 2;
    return new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
  }

  private randomInterval(): number {
    return DIRECTION_CHANGE_INTERVAL * (0.5 + Math.random());
  }

  update(delta: number, snakeHeadPosition: THREE.Vector3) {
    const distanceToSnake = this.mesh.position.distanceTo(snakeHeadPosition);

    if (distanceToSnake < FLEE_TRIGGER_RADIUS) {
      this.state = 'flee';
    } else if (this.state === 'flee') {
      this.state = 'wander';
    }

    if (this.state === 'flee') {
      const fleeDirection = this.mesh.position
        .clone()
        .sub(snakeHeadPosition)
        .setY(0)
        .normalize();

      this.mesh.position.addScaledVector(fleeDirection, FLEE_SPEED * delta);
      this.faceDirection(fleeDirection);
    } else {
      this.timeUntilDirectionChange -= delta;
      if (this.timeUntilDirectionChange <= 0) {
        this.wanderDirection = this.randomDirection();
        this.timeUntilDirectionChange = this.randomInterval();
      }

      this.mesh.position.addScaledVector(this.wanderDirection, WANDER_SPEED * delta);
      this.faceDirection(this.wanderDirection);
    }

    const terrainHeight = getTerrainHeight(this.mesh.position.x, this.mesh.position.z);
    this.mesh.position.y = terrainHeight + GROUND_OFFSET;
  }

  private faceDirection(direction: THREE.Vector3) {
    const angle = Math.atan2(direction.x, direction.z);
    this.mesh.rotation.y = angle;
  }
}