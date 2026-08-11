import * as THREE from 'three';
import type { Snake } from '../player/snake';
import type { TerrainCollider } from './chunk';
import { getTerrainHeight } from './terrain';
import { updateShake } from '../utils/effects';

const BASE_DISTANCE = 7.8;
const BASE_HEIGHT = 4.1;
const BASE_FOV = 60;
const MAX_GROWTH_ZOOM = 0.55;
const COLLISION_PADDING = 0.72;
const CAMERA_GROUND_CLEARANCE = 0.95;
const TERRAIN_RAY_STEPS = 12;

function springVector(
  current: THREE.Vector3,
  velocity: THREE.Vector3,
  target: THREE.Vector3,
  stiffness: number,
  damping: number,
  delta: number,
  acceleration: THREE.Vector3
) {
  acceleration.copy(target).sub(current).multiplyScalar(stiffness);
  velocity.addScaledVector(acceleration, delta);
  velocity.multiplyScalar(Math.exp(-damping * delta));
  current.addScaledVector(velocity, delta);
}

export class CameraFollowRig {
  private camera: THREE.PerspectiveCamera;
  private reducedMotion: boolean;
  private initialized = false;
  private elapsed = 0;
  private springPosition = new THREE.Vector3();
  private springLookTarget = new THREE.Vector3();
  private positionVelocity = new THREE.Vector3();
  private lookVelocity = new THREE.Vector3();
  private desiredPosition = new THREE.Vector3();
  private desiredLookTarget = new THREE.Vector3();
  private forward = new THREE.Vector3();
  private rayDirection = new THREE.Vector3();
  private renderPosition = new THREE.Vector3();
  private swayOffset = new THREE.Vector3();
  private positionAcceleration = new THREE.Vector3();
  private lookAcceleration = new THREE.Vector3();
  private currentBank = 0;

  constructor(camera: THREE.PerspectiveCamera, reducedMotion: boolean) {
    this.camera = camera;
    this.reducedMotion = reducedMotion;
  }

  setReducedMotion(reduced: boolean) {
    this.reducedMotion = reduced;
    if (reduced) {
      this.currentBank = 0;
      this.positionVelocity.multiplyScalar(0.35);
      this.lookVelocity.multiplyScalar(0.35);
    }
  }

  private calculateDesiredFrame(snake: Snake, colliders: TerrainCollider[]) {
    this.forward.set(Math.sin(snake.headingAngle), 0, Math.cos(snake.headingAngle));

    const lengthZoom = Math.min(MAX_GROWTH_ZOOM, Math.max(0, snake.length - 4) * 0.026);
    const dynamicBoost = this.reducedMotion ? 0 : snake.boostAmount;
    const distance = BASE_DISTANCE * (1 + lengthZoom + dynamicBoost * 0.16);
    const height = BASE_HEIGHT + lengthZoom * 1.25 + dynamicBoost * 0.48;
    const lookAhead = 1.15 + dynamicBoost * 1.25;

    this.desiredLookTarget
      .copy(snake.head.position)
      .addScaledVector(this.forward, lookAhead);
    this.desiredLookTarget.y += 0.58;

    this.desiredPosition
      .copy(this.desiredLookTarget)
      .addScaledVector(this.forward, -distance);
    this.desiredPosition.y += height;

    this.resolveObstructions(this.desiredLookTarget, this.desiredPosition, colliders);
  }

  private resolveObstructions(
    focus: THREE.Vector3,
    cameraTarget: THREE.Vector3,
    colliders: TerrainCollider[]
  ) {
    this.rayDirection.copy(cameraTarget).sub(focus);
    const horizontalLengthSquared =
      this.rayDirection.x * this.rayDirection.x + this.rayDirection.z * this.rayDirection.z;
    const horizontalLength = Math.sqrt(horizontalLengthSquared);
    let safeAmount = 1;

    if (horizontalLengthSquared > 0.001) {
      for (const collider of colliders) {
        const toColliderX = collider.x - focus.x;
        const toColliderZ = collider.z - focus.z;
        const amount = THREE.MathUtils.clamp(
          (toColliderX * this.rayDirection.x + toColliderZ * this.rayDirection.z) /
            horizontalLengthSquared,
          0,
          1
        );
        if (amount < 0.12 || amount >= safeAmount) continue;

        const closestX = focus.x + this.rayDirection.x * amount;
        const closestZ = focus.z + this.rayDirection.z * amount;
        const clearance = collider.radius + COLLISION_PADDING;
        if (Math.hypot(collider.x - closestX, collider.z - closestZ) >= clearance) continue;

        const rayHeight = focus.y + this.rayDirection.y * amount;
        const obstacleHeight =
          getTerrainHeight(collider.x, collider.z) + (collider.kind === 'tree' ? 6.4 : 2.15);
        if (rayHeight > obstacleHeight) continue;

        safeAmount = Math.max(0.3, amount - clearance / Math.max(0.001, horizontalLength));
      }
    }

    for (let step = 2; step <= TERRAIN_RAY_STEPS; step++) {
      const amount = step / TERRAIN_RAY_STEPS;
      if (amount >= safeAmount) break;
      const sampleX = focus.x + this.rayDirection.x * amount;
      const sampleY = focus.y + this.rayDirection.y * amount;
      const sampleZ = focus.z + this.rayDirection.z * amount;
      if (sampleY < getTerrainHeight(sampleX, sampleZ) + CAMERA_GROUND_CLEARANCE) {
        safeAmount = Math.max(0.3, amount - 1 / TERRAIN_RAY_STEPS);
        break;
      }
    }

    if (safeAmount < 1) cameraTarget.copy(focus).addScaledVector(this.rayDirection, safeAmount);
    cameraTarget.y = Math.max(
      cameraTarget.y,
      getTerrainHeight(cameraTarget.x, cameraTarget.z) + CAMERA_GROUND_CLEARANCE
    );
  }

  private resolveCameraPenetration(colliders: TerrainCollider[]) {
    this.springPosition.y = Math.max(
      this.springPosition.y,
      getTerrainHeight(this.springPosition.x, this.springPosition.z) + CAMERA_GROUND_CLEARANCE
    );

    for (const collider of colliders) {
      const obstacleTop =
        getTerrainHeight(collider.x, collider.z) + (collider.kind === 'tree' ? 6.4 : 2.15);
      if (this.springPosition.y > obstacleTop) continue;

      const offsetX = this.springPosition.x - collider.x;
      const offsetZ = this.springPosition.z - collider.z;
      const distance = Math.hypot(offsetX, offsetZ);
      const minimumDistance = collider.radius + COLLISION_PADDING;
      if (distance >= minimumDistance) continue;

      if (distance < 0.001) {
        this.springPosition.x += minimumDistance;
      } else {
        const correction = minimumDistance / distance;
        this.springPosition.x = collider.x + offsetX * correction;
        this.springPosition.z = collider.z + offsetZ * correction;
      }
      this.positionVelocity.multiplyScalar(0.45);
    }
  }

  private applyCameraTransform(snake: Snake, delta: number) {
    const targetFov =
      BASE_FOV + Math.min(2.2, Math.max(0, snake.length - 4) * 0.045) +
      (this.reducedMotion ? 0 : snake.boostAmount * 4.5);
    const nextFov = THREE.MathUtils.lerp(
      this.camera.fov,
      targetFov,
      1 - Math.exp(-5.5 * delta)
    );
    if (Math.abs(nextFov - this.camera.fov) > 0.001) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }

    this.swayOffset.set(0, 0, 0);
    if (!this.reducedMotion) {
      const lateralSway = Math.sin(this.elapsed * 1.15) * 0.055;
      this.swayOffset.set(-this.forward.z * lateralSway, Math.sin(this.elapsed * 1.7) * 0.025, this.forward.x * lateralSway);
    }

    this.renderPosition.copy(this.springPosition).add(this.swayOffset).add(updateShake(delta));
    this.camera.position.copy(this.renderPosition);
    this.camera.lookAt(this.springLookTarget);

    const targetBank = this.reducedMotion ? 0 : snake.turnAmount * 0.052;
    this.currentBank = THREE.MathUtils.lerp(
      this.currentBank,
      targetBank,
      1 - Math.exp(-7 * delta)
    );
    this.camera.rotateZ(this.currentBank);
  }

  snapToSnake(snake: Snake, colliders: TerrainCollider[]) {
    this.calculateDesiredFrame(snake, colliders);
    this.springPosition.copy(this.desiredPosition);
    this.springLookTarget.copy(this.desiredLookTarget);
    this.positionVelocity.set(0, 0, 0);
    this.lookVelocity.set(0, 0, 0);
    this.initialized = true;
    this.applyCameraTransform(snake, 0);
  }

  update(snake: Snake, delta: number, colliders: TerrainCollider[]) {
    this.elapsed += delta;
    this.calculateDesiredFrame(snake, colliders);
    if (!this.initialized) this.snapToSnake(snake, colliders);

    if (this.reducedMotion) {
      const amount = 1 - Math.exp(-10 * delta);
      this.springPosition.lerp(this.desiredPosition, amount);
      this.springLookTarget.lerp(this.desiredLookTarget, amount);
      this.positionVelocity.set(0, 0, 0);
      this.lookVelocity.set(0, 0, 0);
    } else {
      springVector(
        this.springPosition,
        this.positionVelocity,
        this.desiredPosition,
        38,
        10.5,
        delta,
        this.positionAcceleration
      );
      springVector(
        this.springLookTarget,
        this.lookVelocity,
        this.desiredLookTarget,
        48,
        12,
        delta,
        this.lookAcceleration
      );
    }

    this.resolveCameraPenetration(colliders);
    this.applyCameraTransform(snake, delta);
  }
}
