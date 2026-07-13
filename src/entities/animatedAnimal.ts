import * as THREE from 'three';
import { getTerrainHeight } from '../world/chunk';

export interface AnimalConfig {
  wanderSpeed: number;
  fleeSpeed: number;
  fleeTriggerRadius: number;
  groundOffset: number;
  wanderAnimationPattern?: RegExp;
  fleeAnimationPattern?: RegExp;
  isPredator?: boolean;
  catchDistance?: number;
  attackCooldownSeconds?: number;
}

type AnimalState = 'wander' | 'alert';

export class AnimatedAnimal {
  public mesh: THREE.Object3D;
  private state: AnimalState = 'wander';
  private wanderDirection: THREE.Vector3;
  private timeUntilDirectionChange: number;
  private mixer: THREE.AnimationMixer | null = null;
  private wanderAction: THREE.AnimationAction | null = null;
  private alertAction: THREE.AnimationAction | null = null;
  private config: AnimalConfig;
  private directionChangeInterval = 3;
  private attackCooldown = 0;

  constructor(
    position: THREE.Vector3,
    model: THREE.Group,
    animations: THREE.AnimationClip[],
    config: AnimalConfig
  ) {
    this.mesh = model;
    this.mesh.position.copy(position);
    this.config = config;

    if (animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(this.mesh);

      const wanderClip = config.wanderAnimationPattern
        ? animations.find((a) => config.wanderAnimationPattern!.test(a.name))
        : animations[0];
      const alertClip = config.fleeAnimationPattern
        ? animations.find((a) => config.fleeAnimationPattern!.test(a.name))
        : wanderClip;

      if (wanderClip) {
        this.wanderAction = this.mixer.clipAction(wanderClip);
        this.wanderAction.play();
      }
      if (alertClip) {
        this.alertAction = this.mixer.clipAction(alertClip);
        if (alertClip !== wanderClip) {
          this.alertAction.setEffectiveWeight(0);
          this.alertAction.play();
        }
      }
    }

    this.wanderDirection = this.randomDirection();
    this.timeUntilDirectionChange = this.randomInterval();
  }

  private randomDirection(): THREE.Vector3 {
    const angle = Math.random() * Math.PI * 2;
    return new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
  }

  private randomInterval(): number {
    return this.directionChangeInterval * (0.5 + Math.random());
  }

  // Returns true if this update caused a catch of the player (predators only)
  update(delta: number, snakeHeadPosition: THREE.Vector3): boolean {
    const distanceToSnake = this.mesh.position.distanceTo(snakeHeadPosition);
    const previousState = this.state;

    if (distanceToSnake < this.config.fleeTriggerRadius) {
      this.state = 'alert';
    } else if (this.state === 'alert') {
      this.state = 'wander';
    }

    if (this.state !== previousState) {
      this.crossfadeToState(this.state);
    }

    if (this.state === 'alert') {
      const moveDirection = this.config.isPredator
        ? snakeHeadPosition.clone().sub(this.mesh.position).setY(0).normalize()
        : this.mesh.position.clone().sub(snakeHeadPosition).setY(0).normalize();

      this.mesh.position.addScaledVector(moveDirection, this.config.fleeSpeed * delta);
      this.faceDirection(moveDirection);
    } else {
      this.timeUntilDirectionChange -= delta;
      if (this.timeUntilDirectionChange <= 0) {
        this.wanderDirection = this.randomDirection();
        this.timeUntilDirectionChange = this.randomInterval();
      }

      this.mesh.position.addScaledVector(this.wanderDirection, this.config.wanderSpeed * delta);
      this.faceDirection(this.wanderDirection);
    }

    const terrainHeight = getTerrainHeight(this.mesh.position.x, this.mesh.position.z);
    this.mesh.position.y = terrainHeight + this.config.groundOffset;

    if (this.mixer) {
      this.mixer.update(delta);
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - delta);

    if (
      this.config.isPredator &&
      this.state === 'alert' &&
      this.attackCooldown <= 0 &&
      distanceToSnake < (this.config.catchDistance ?? 1.3)
    ) {
      this.attackCooldown = this.config.attackCooldownSeconds ?? 2.5;
      return true;
    }

    return false;
  }

  private crossfadeToState(state: AnimalState) {
    if (!this.wanderAction || !this.alertAction || this.wanderAction === this.alertAction) return;

    if (state === 'alert') {
      this.alertAction.reset().play();
      this.alertAction.setEffectiveWeight(1);
      this.wanderAction.crossFadeTo(this.alertAction, 0.3, false);
    } else {
      this.wanderAction.reset().play();
      this.wanderAction.setEffectiveWeight(1);
      this.alertAction.crossFadeTo(this.wanderAction, 0.3, false);
    }
  }

  private faceDirection(direction: THREE.Vector3) {
    const angle = Math.atan2(direction.x, direction.z);
    this.mesh.rotation.y = angle;
  }

  dispose() {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.mesh);
      this.mixer = null;
    }
  }
}