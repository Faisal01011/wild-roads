import * as THREE from 'three';

const WANDER_SPEED = 0.8;
const FLEE_TRIGGER_RADIUS = 5;
const FLY_UP_SPEED = 3;
const FLY_AWAY_SPEED = 6;
const MAX_FLY_HEIGHT = 8;
const DIRECTION_CHANGE_INTERVAL = 3;

type BirdState = 'ground' | 'fleeing';

export class Bird {
  public mesh: THREE.Mesh;
  private state: BirdState = 'ground';
  private wanderDirection: THREE.Vector3;
  private timeUntilDirectionChange: number;
  private fleeDirection: THREE.Vector3 = new THREE.Vector3();

  constructor(position: THREE.Vector3) {
    // Placeholder shape until swapped for a real model
    const geometry = new THREE.ConeGeometry(0.25, 0.5, 6);
    const material = new THREE.MeshStandardMaterial({ color: 0x5d4037 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.rotation.x = Math.PI / 2; // point forward instead of up
    this.mesh.position.copy(position);
    this.mesh.castShadow = true;

    this.wanderDirection = this.randomDirection();
    this.timeUntilDirectionChange = this.randomInterval();
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
      // Startled — pick a horizontal escape direction and take off
      this.state = 'fleeing';
      this.fleeDirection = this.mesh.position
        .clone()
        .sub(snakeHeadPosition)
        .setY(0)
        .normalize();
    }

    if (this.state === 'fleeing') {
      // Rise and move away simultaneously
      this.mesh.position.y += FLY_UP_SPEED * delta;
      this.mesh.position.addScaledVector(this.fleeDirection, FLY_AWAY_SPEED * delta);

      // Once high enough and far enough, just let it be — it's no longer catchable
      // (no need to reset state; a fled bird stays fled, unlike the rabbit)
      this.mesh.position.y = Math.min(this.mesh.position.y, MAX_FLY_HEIGHT);
    } else {
      // Ground wander, same pattern as rabbit
      this.timeUntilDirectionChange -= delta;
      if (this.timeUntilDirectionChange <= 0) {
        this.wanderDirection = this.randomDirection();
        this.timeUntilDirectionChange = this.randomInterval();
      }

      this.mesh.position.addScaledVector(this.wanderDirection, WANDER_SPEED * delta);
    }

    this.faceMovementDirection();
  }

  private faceMovementDirection() {
    const dir = this.state === 'fleeing' ? this.fleeDirection : this.wanderDirection;
    const angle = Math.atan2(dir.x, dir.z);
    this.mesh.rotation.y = angle;
  }

  isCatchable(): boolean {
    return this.state === 'ground';
  }
}