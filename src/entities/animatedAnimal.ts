import * as THREE from 'three';
import { getTerrainHeight } from '../world/chunk';

export interface AnimalConfig {
  wanderSpeed: number;
  fleeSpeed: number;
  fleeTriggerRadius: number;
  groundOffset: number;
  wanderAnimationPattern?: RegExp;
  fleeAnimationPattern?: RegExp;
}

type AnimalState = 'wander' | 'flee';

export class AnimatedAnimal {
  public mesh: THREE.Object3D;
  private state: AnimalState = 'wander';
  private wanderDirection: THREE.Vector3;
  private timeUntilDirectionChange: number;
  private mixer: THREE.AnimationMixer | null = null;
  private wanderAction: THREE.AnimationAction | null = null;
  private fleeAction: THREE.AnimationAction | null = null;
  private config: AnimalConfig;
  private directionChangeInterval = 3;

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
      const fleeClip = config.fleeAnimationPattern
        ? animations.find((a) => config.fleeAnimationPattern!.test(a.name))
        : wanderClip;

      if (wanderClip) {
        this.wanderAction = this.mixer.clipAction(wanderClip);
        this.wanderAction.play();
      }
      if (fleeClip) {
        this.fleeAction = this.mixer.clipAction(fleeClip);
        if (fleeClip === wanderClip) {
          // Same clip reused for both states — nothing extra to do, already playing
        } else {
          this.fleeAction.setEffectiveWeight(0);
          this.fleeAction.play();
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

  update(delta: number, snakeHeadPosition: THREE.Vector3) {
    const distanceToSnake = this.mesh.position.distanceTo(snakeHeadPosition);
    const previousState = this.state;

    if (distanceToSnake < this.config.fleeTriggerRadius) {
      this.state = 'flee';
    } else if (this.state === 'flee') {
      this.state = 'wander';
    }

    if (this.state !== previousState) {
      this.crossfadeToState(this.state);
    }

    if (this.state === 'flee') {
      const fleeDirection = this.mesh.position
        .clone()
        .sub(snakeHeadPosition)
        .setY(0)
        .normalize();

      this.mesh.position.addScaledVector(fleeDirection, this.config.fleeSpeed * delta);
      this.faceDirection(fleeDirection);
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
  }

  private crossfadeToState(state: AnimalState) {
    if (!this.wanderAction || !this.fleeAction || this.wanderAction === this.fleeAction) return;

    if (state === 'flee') {
      this.fleeAction.reset().play();
      this.fleeAction.setEffectiveWeight(1);
      this.wanderAction.crossFadeTo(this.fleeAction, 0.3, false);
    } else {
      this.wanderAction.reset().play();
      this.wanderAction.setEffectiveWeight(1);
      this.fleeAction.crossFadeTo(this.wanderAction, 0.3, false);
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