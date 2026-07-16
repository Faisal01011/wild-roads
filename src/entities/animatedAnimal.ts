import * as THREE from 'three';
import { getTerrainHeight } from '../world/chunk';

export interface AnimalConfig {
  wanderSpeed: number;
  fleeSpeed: number;
  fleeTriggerRadius: number;
  groundOffset: number;
  wanderAnimationPattern?: RegExp;
  fleeAnimationPattern?: RegExp;
  attackAnimationPattern?: RegExp;
  isPredator?: boolean;
  catchDistance?: number;
  attackCooldownSeconds?: number;
}

export type AnimalState =
  | 'idle'
  | 'wander'
  | 'graze'
  | 'alert'
  | 'panic'
  | 'circle';

export class AnimatedAnimal {
  public mesh: THREE.Object3D;

  public nearbyAnimals: AnimatedAnimal[] = [];

  private state: AnimalState = 'idle';

  private mixer: THREE.AnimationMixer | null = null;

  private idleAction: THREE.AnimationAction | null = null;
  private walkAction: THREE.AnimationAction | null = null;
  private eatAction: THREE.AnimationAction | null = null;
  private runAction: THREE.AnimationAction | null = null;
  private attackAction: THREE.AnimationAction | null = null;

  private config: AnimalConfig;

  private stateTimer = 0;
  private reactionDelay = 0;
  private circleDirection = Math.random() < 0.5 ? -1 : 1;
  private circleRadius = 4 + Math.random() * 2;
  private circleTime = 0;
  private attackCooldown = 0;
  private hasRaisedAlarm = false;

  private destination = new THREE.Vector3();
  private hasDestination = false;

  private readonly MIN_WANDER_DISTANCE = 4;
  private readonly MAX_WANDER_DISTANCE = 10;
  private readonly DESTINATION_RADIUS = 0.6;

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

      const idleClip =
        animations.find(a => /^idle/i.test(a.name));

      const walkClip =
        animations.find(a => (config.wanderAnimationPattern ?? /^walk/i).test(a.name));

      const eatClip =
        animations.find(a => /^eating/i.test(a.name));

      const runClip =
        animations.find(a => (config.fleeAnimationPattern ?? /^gallop/i).test(a.name));

      const attackClip =
        animations.find(a => (config.attackAnimationPattern ?? /^attack/i).test(a.name));

      if (idleClip) {
        this.idleAction = this.mixer.clipAction(idleClip);
        this.idleAction.setLoop(THREE.LoopRepeat, Infinity);
      }

      if (walkClip) {
        this.walkAction = this.mixer.clipAction(walkClip);
        this.walkAction.setLoop(THREE.LoopRepeat, Infinity);
      }

      if (eatClip) {
        this.eatAction = this.mixer.clipAction(eatClip);
        this.eatAction.setLoop(THREE.LoopRepeat, Infinity);
      }

      if (runClip) {
        this.runAction = this.mixer.clipAction(runClip);
        this.runAction.setLoop(THREE.LoopRepeat, Infinity);
      }

      if (attackClip) {
        this.attackAction = this.mixer.clipAction(attackClip);
        this.attackAction.setLoop(THREE.LoopOnce, 1);
        this.attackAction.clampWhenFinished = true;
      }
    }

    this.stateTimer = THREE.MathUtils.randFloat(2, 5);

    this.chooseNewDestination();

    this.playStateAnimation(this.state);
  }

  private chooseNewDestination() {
    const angle = Math.random() * Math.PI * 2;

    const distance =
      this.MIN_WANDER_DISTANCE +
      Math.random() *
        (this.MAX_WANDER_DISTANCE - this.MIN_WANDER_DISTANCE);

    this.destination.set(
      this.mesh.position.x + Math.cos(angle) * distance,
      0,
      this.mesh.position.z + Math.sin(angle) * distance
    );

    this.hasDestination = true;
  }

  private applyHerding(direction: THREE.Vector3): THREE.Vector3 {
    if (this.config.isPredator) return direction;

    const center = new THREE.Vector3();
    let count = 0;

    for (const other of this.nearbyAnimals) {
      if (other === this) continue;

      const d = this.mesh.position.distanceTo(other.mesh.position);

      if (d < 8) {
        center.add(other.mesh.position);
        count++;
      }
    }

    if (count === 0) return direction;

    center.divideScalar(count);

    const herd = center
      .sub(this.mesh.position)
      .setY(0);

    if (herd.lengthSq() < 0.0001) return direction;

    herd.normalize();

    direction.lerp(herd, 0.35);

    direction.normalize();

    return direction;
  }

  update(delta: number, snakeHeadPosition: THREE.Vector3): boolean {
    const distanceToSnake = this.mesh.position.distanceTo(snakeHeadPosition);
    const previousState = this.state;

    // Snake detected
    if (
      distanceToSnake < this.config.fleeTriggerRadius &&
      this.state !== 'alert' &&
      this.state !== 'panic'
    ) {
      this.state = 'alert';
      this.reactionDelay = THREE.MathUtils.randFloat(0.25, 0.6);
      this.hasRaisedAlarm = false;
    }

    // State timers
    if (this.state !== 'alert' && this.state !== 'panic') {
      this.stateTimer -= delta;

      if (this.stateTimer <= 0) {
        switch (this.state) {
          case 'idle':
            this.state = 'wander';
            this.chooseNewDestination();
            this.stateTimer = THREE.MathUtils.randFloat(5, 8);
            break;

          case 'wander':
            this.state = 'graze';
            this.stateTimer = THREE.MathUtils.randFloat(3, 6);
            break;

          case 'graze':
            this.state = 'idle';
            this.stateTimer = THREE.MathUtils.randFloat(2, 4);
            break;
        }
      }
    }

    if (previousState !== this.state) {
      this.playStateAnimation(this.state);
    }

    switch (this.state) {
      case 'idle':
        break;

      case 'graze':
        this.mesh.rotation.y +=
          (Math.random() - 0.5) * delta * 0.25;
        break;

      case 'wander': {
        if (!this.hasDestination) {
          this.chooseNewDestination();
        }

        const direction = this.destination
          .clone()
          .sub(this.mesh.position);

        direction.y = 0;

        const distance = direction.length();

        if (distance < this.DESTINATION_RADIUS) {
          this.hasDestination = false;
          this.state = 'idle';
          this.stateTimer = THREE.MathUtils.randFloat(2, 4);
          this.playStateAnimation(this.state);
          break;
        }

        direction.normalize();

        direction.copy(this.applyHerding(direction));

        this.mesh.position.addScaledVector(
          direction,
          this.config.wanderSpeed * delta
        );

        this.faceDirection(direction, delta);

        break;
      }

      case 'alert': {
        const lookDirection = snakeHeadPosition
          .clone()
          .sub(this.mesh.position)
          .setY(0)
          .normalize();

        this.faceDirection(lookDirection, delta);

        this.reactionDelay -= delta;

        if (!this.hasRaisedAlarm) {
          this.hasRaisedAlarm = true;

          for (const other of this.nearbyAnimals) {
            if (other === this) continue;

            if (
              other.mesh.position.distanceTo(this.mesh.position) < 12 &&
              other.state !== 'panic' &&
              other.state !== 'alert'
            ) {
              other.state = 'alert';
              other.reactionDelay =
                THREE.MathUtils.randFloat(0.15, 0.4);
            }
          }
        }

        if (this.reactionDelay <= 0) {
          this.state = 'panic';
          this.playStateAnimation(this.state);
        }

        break;
      }
      case 'circle': {

        this.circleTime += delta;

        const toSnake = snakeHeadPosition
            .clone()
            .sub(this.mesh.position);

        const distance = toSnake.length();

        toSnake.normalize();

        const tangent = new THREE.Vector3(
            -toSnake.z,
            0,
            toSnake.x
        ).multiplyScalar(this.circleDirection);

        const move = tangent
            .multiplyScalar(0.8)
            .add(
                toSnake.multiplyScalar(
                    distance - this.circleRadius
                )
            );

        move.normalize();

        this.mesh.position.addScaledVector(
            move,
            this.config.wanderSpeed * 1.8 * delta
        );

        this.faceDirection(move, delta);

        if (
            distance < this.config.catchDistance! + 0.3 ||
            this.circleTime > 3
        ) {
            this.circleTime = 0;
            this.state = 'panic';
            this.playStateAnimation(this.state);
        }

        break;
      }

      case 'panic': {
        const moveDirection = this.config.isPredator
          ? snakeHeadPosition
              .clone()
              .sub(this.mesh.position)
              .setY(0)
              .normalize()
          : this.mesh.position
              .clone()
              .sub(snakeHeadPosition)
              .setY(0)
              .normalize();

        this.mesh.position.addScaledVector(
          moveDirection,
          this.config.fleeSpeed * delta
        );

        this.faceDirection(moveDirection, delta);

        if (distanceToSnake > this.config.fleeTriggerRadius * 2) {
          this.state = 'idle';
          this.stateTimer = THREE.MathUtils.randFloat(2, 4);
          this.playStateAnimation(this.state);
        }

        break;
      }
    }

    const terrainHeight = getTerrainHeight(
      this.mesh.position.x,
      this.mesh.position.z
    );

    this.mesh.position.y =
      terrainHeight + this.config.groundOffset;

    this.mixer?.update(delta);

    this.attackCooldown = Math.max(
      0,
      this.attackCooldown - delta
    );

    if (
      this.config.isPredator &&
      this.state === 'panic' &&
      this.attackCooldown <= 0 &&
      distanceToSnake <
        (this.config.catchDistance ?? 1.3)
    ) {
      this.attackCooldown =
        this.config.attackCooldownSeconds ?? 2.5;
      this.playAttackAnimation();
      return true;
    }

    return false;
  }

  private playAttackAnimation() {
    if (!this.attackAction) return;

    this.attackAction.reset().setEffectiveWeight(1).fadeIn(0.1).play();

    // Once the bite finishes, fade back to the chase (run) animation
    // if we're still in panic state, rather than freezing on the last attack frame.
    const onFinished = (event: { action: THREE.AnimationAction }) => {
      if (event.action !== this.attackAction) return;
      this.mixer?.removeEventListener('finished', onFinished);

      if (this.state === 'panic' && this.runAction) {
        this.attackAction!.fadeOut(0.15);
        this.runAction.reset().setEffectiveWeight(1).fadeIn(0.15).play();
      }
    };

    this.mixer?.addEventListener('finished', onFinished);
  }

  private playStateAnimation(state: AnimalState) {
    if (!this.mixer) return;

    let next: THREE.AnimationAction | null = null;

    switch (state) {
      case 'idle':
        next = this.idleAction;
        break;

      case 'wander':
        next = this.walkAction;
        break;

      case 'graze':
        next = this.eatAction ?? this.idleAction;
        break;

      case 'alert':
      case 'panic':
        next = this.runAction;
        break;
    }

    if (!next) return;

    const actions = [
      this.idleAction,
      this.walkAction,
      this.eatAction,
      this.runAction,
      this.attackAction,
    ].filter(Boolean) as THREE.AnimationAction[];

    for (const action of actions) {
      if (action === next) continue;

      action.fadeOut(0.25);
    }

    next
      .reset()
      .fadeIn(0.25)
      .setEffectiveWeight(1)
      .play();
  }

  private faceDirection(
    direction: THREE.Vector3,
    delta: number
  ) {
    if (direction.lengthSq() < 0.0001) return;

    const targetRotation = Math.atan2(
      direction.x,
      direction.z
    );

    this.mesh.rotation.y = THREE.MathUtils.lerp(
      this.mesh.rotation.y,
      targetRotation,
      Math.min(1, delta * 8)
    );
  }

  dispose() {
    if (!this.mixer) return;

    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mesh);
    this.mixer = null;
  }
}