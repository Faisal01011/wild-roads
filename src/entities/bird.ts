import * as THREE from 'three';
import { getTerrainHeight } from '../world/chunk';

const WANDER_SPEED = 0.8;
const FLEE_TRIGGER_RADIUS = 5;
const FLY_UP_SPEED = 3;
const FLY_AWAY_SPEED = 6;
const MAX_FLY_HEIGHT = 8;
const DIRECTION_CHANGE_INTERVAL = 3;
const GROUND_OFFSET = 0.3;

type BirdState = 'ground' | 'fleeing';

export class Bird {
  public mesh: THREE.Object3D;
  private state: BirdState = 'ground';
  private wanderDirection: THREE.Vector3;
  private timeUntilDirectionChange: number;
  private fleeDirection: THREE.Vector3 = new THREE.Vector3();

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

    if (this.state === 'ground' && distanceToSnake < FLEE_TRIGGER_RADIUS) {
      this.state = 'fleeing';
      this.fleeDirection = this.mesh.position
        .clone()
        .sub(snakeHeadPosition)
        .setY(0)
        .normalize();
    }

    if (this.state === 'fleeing') {
      this.mesh.position.y += FLY_UP_SPEED * delta;
      this.mesh.position.addScaledVector(this.fleeDirection, FLY_AWAY_SPEED * delta);
      this.mesh.position.y = Math.min(this.mesh.position.y, MAX_FLY_HEIGHT);
    } else {
      this.timeUntilDirectionChange -= delta;
      if (this.timeUntilDirectionChange <= 0) {
        this.wanderDirection = this.randomDirection();
        this.timeUntilDirectionChange = this.randomInterval();
      }

      this.mesh.position.addScaledVector(this.wanderDirection, WANDER_SPEED * delta);

      const terrainHeight = getTerrainHeight(this.mesh.position.x, this.mesh.position.z);
      this.mesh.position.y = terrainHeight + GROUND_OFFSET;
    }

    this.faceMovementDirection();
  }

  private faceMovementDirection() {
    const dir = this.state === 'fleeing' ? this.fleeDirection : this.wanderDirection;
    const angle = Math.atan2(dir.x, dir.z);
    this.mesh.rotation.y = angle;
  }

  isCatchable(): boolean {
    return this.mesh.position.y < 1.2;
  }
}