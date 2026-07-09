import * as THREE from 'three';

const WANDER_SPEED = 1.2;
const FLEE_SPEED = 4;
const FLEE_TRIGGER_RADIUS = 6;
const DIRECTION_CHANGE_INTERVAL = 2.5; // seconds, avg time before picking a new wander direction

type RabbitState = 'idle' | 'wander' | 'flee';

export class Rabbit {
  public mesh: THREE.Mesh;
  private state: RabbitState = 'wander';
  private wanderDirection: THREE.Vector3;
  private timeUntilDirectionChange: number;

  constructor(position: THREE.Vector3) {
    // Placeholder shape until we swap in a real rabbit model
    const geometry = new THREE.BoxGeometry(0.4, 0.4, 0.6);
    const material = new THREE.MeshStandardMaterial({ color: 0xcdaa7d });
    this.mesh = new THREE.Mesh(geometry, material);
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

    // Decide state
    if (distanceToSnake < FLEE_TRIGGER_RADIUS) {
      this.state = 'flee';
    } else if (this.state === 'flee') {
      // Just escaped danger, go back to wandering
      this.state = 'wander';
    }

    if (this.state === 'flee') {
      // Run directly away from the snake
      const fleeDirection = this.mesh.position
        .clone()
        .sub(snakeHeadPosition)
        .setY(0)
        .normalize();

      this.mesh.position.addScaledVector(fleeDirection, FLEE_SPEED * delta);
      this.faceDirection(fleeDirection);
    } else {
      // Wander: change direction periodically
      this.timeUntilDirectionChange -= delta;
      if (this.timeUntilDirectionChange <= 0) {
        this.wanderDirection = this.randomDirection();
        this.timeUntilDirectionChange = this.randomInterval();
      }

      this.mesh.position.addScaledVector(this.wanderDirection, WANDER_SPEED * delta);
      this.faceDirection(this.wanderDirection);
    }
  }

  private faceDirection(direction: THREE.Vector3) {
    const angle = Math.atan2(direction.x, direction.z);
    this.mesh.rotation.y = angle;
  }
}