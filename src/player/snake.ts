import * as THREE from 'three';
import { input } from '../utils/input';
import { getTerrainHeight, resolveRockCollisions } from '../world/chunk';
import type { RockCollider } from '../world/chunk';

const FORWARD_SPEED = 5;
const BOOST_SPEED = 9;
const TURN_SPEED = 2.5;
const SEGMENT_SPACING = 0.6;
const HISTORY_LENGTH = 500;
const HEAD_GROUND_OFFSET = 0.5;
const SEGMENT_GROUND_OFFSET = 0.4;
const HEAD_COLLISION_RADIUS = 0.5;
const SEGMENT_BASE_RADIUS = 0.35;
const TAPER_COUNT = 4;

const MAX_STAMINA = 100;
const STAMINA_DRAIN_RATE = 35;
const STAMINA_REGEN_RATE = 20;
const MIN_STAMINA_TO_BOOST = 5;

const BODY_WAVE_AMPLITUDE = 0.08;
const BODY_WAVE_FREQUENCY = 0.6;

function createBlobShadowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0, 'rgba(0,0,0,0.55)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  return new THREE.CanvasTexture(canvas);
}

const blobShadowTexture = createBlobShadowTexture();

// Reused scratch vectors for the per-segment wave calculation —
// avoids allocating new Vector3s every segment, every frame.
const scratchDirection = new THREE.Vector3();
const scratchPerpendicular = new THREE.Vector3();

export class Snake {
  public head: THREE.Object3D;
  private heading: number = 0;
  private turnVelocity: number = 0;
  private segments: THREE.Mesh[] = [];
  private segmentShadows: THREE.Mesh[] = [];
  private headShadow: THREE.Mesh;
  private positionHistory: THREE.Vector3[] = [];
  private stamina: number = MAX_STAMINA;
  private isBoosting: boolean = false;

  private currentSpeed = FORWARD_SPEED;
  private targetSpeed = FORWARD_SPEED;

  constructor() {
    const headGroup = new THREE.Group();

    const headGeometry = new THREE.ConeGeometry(0.4, 0.7, 8);
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xc9a35c });
    const headMesh = new THREE.Mesh(headGeometry, headMaterial);
    headMesh.rotation.x = Math.PI / 2;
    headMesh.castShadow = false;
    headGroup.add(headMesh);

    const eyeGeometry = new THREE.SphereGeometry(0.06, 6, 6);
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.15, 0.1, 0.2);
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(0.15, 0.1, 0.2);
    headGroup.add(leftEye, rightEye);

    this.head = headGroup;
    this.head.position.y = HEAD_GROUND_OFFSET;

    this.headShadow = this.createContactShadow(0.7);

    for (let i = 0; i < 3; i++) {
      this.addSegment();
    }
  }

  private createContactShadow(radius: number): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(radius * 2, radius * 2);
    const material = new THREE.MeshBasicMaterial({
      map: blobShadowTexture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const shadow = new THREE.Mesh(geometry, material);
    shadow.rotation.x = -Math.PI / 2;
    return shadow;
  }

  private addSegment() {
    const geometry = new THREE.SphereGeometry(SEGMENT_BASE_RADIUS, 8, 8);
    const material = new THREE.MeshStandardMaterial({ color: 0xc9a35c });
    const segment = new THREE.Mesh(geometry, material);
    segment.castShadow = false;
    segment.position.copy(this.head.position);
    this.segments.push(segment);

    const segmentShadow = this.createContactShadow(0.45);
    this.segmentShadows.push(segmentShadow);
  }

  grow(scene: THREE.Scene) {
    this.addSegment();
    const newest = this.segments[this.segments.length - 1];
    scene.add(newest);
    const newestShadow = this.segmentShadows[this.segmentShadows.length - 1];
    scene.add(newestShadow);
  }

  shrink(scene: THREE.Scene, count: number = 1) {
    for (let i = 0; i < count; i++) {
      if (this.segments.length <= 1) break;

      const segment = this.segments.pop();
      const shadow = this.segmentShadows.pop();

      if (segment) {
        scene.remove(segment);
        segment.geometry.dispose();
        (segment.material as THREE.Material).dispose();
      }
      if (shadow) {
        scene.remove(shadow);
        shadow.geometry.dispose();
        (shadow.material as THREE.Material).dispose();
      }
    }
  }

  get length(): number {
    return this.segments.length;
  }

  get staminaPercent(): number {
    return this.stamina / MAX_STAMINA;
  }

  addToScene(scene: THREE.Scene) {
    scene.add(this.head);
    scene.add(this.headShadow);
    for (const segment of this.segments) {
      scene.add(segment);
    }
    for (const shadow of this.segmentShadows) {
      scene.add(shadow);
    }
  }

  update(delta: number, rockColliders: RockCollider[]) {
    const turnInput = input.getTurnInput();

    const targetTurnVelocity = -turnInput * TURN_SPEED;

    this.turnVelocity = THREE.MathUtils.lerp(
      this.turnVelocity,
      targetTurnVelocity,
      8 * delta
    );

    this.heading += this.turnVelocity * delta;
    this.head.rotation.y = this.heading;

    this.head.rotation.z = THREE.MathUtils.lerp(
      this.head.rotation.z,
      -this.turnVelocity * 0.2,
      10 * delta
    );

    const wantsBoost = input.wantsBoost();

    if (wantsBoost && this.stamina > MIN_STAMINA_TO_BOOST) {
      this.isBoosting = true;
    }
    if (!wantsBoost || this.stamina <= 0) {
      this.isBoosting = false;
    }

    if (this.isBoosting) {
      this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN_RATE * delta);
    } else {
      this.stamina = Math.min(MAX_STAMINA, this.stamina + STAMINA_REGEN_RATE * delta);
    }

    this.targetSpeed = this.isBoosting ? BOOST_SPEED : FORWARD_SPEED;

    this.currentSpeed = THREE.MathUtils.lerp(
      this.currentSpeed,
      this.targetSpeed,
      6 * delta
    );

    const forward = new THREE.Vector3(
      Math.sin(this.heading),
      0,
      Math.cos(this.heading)
    );

    this.head.position.addScaledVector(forward, this.currentSpeed * delta);

    resolveRockCollisions(this.head.position, rockColliders, HEAD_COLLISION_RADIUS);

    const terrainHeight = getTerrainHeight(this.head.position.x, this.head.position.z);
    this.head.position.y = terrainHeight + HEAD_GROUND_OFFSET;

    this.headShadow.position.set(this.head.position.x, terrainHeight + 0.02, this.head.position.z);

    this.positionHistory.unshift(this.head.position.clone());
    if (this.positionHistory.length > HISTORY_LENGTH) {
      this.positionHistory.pop();
    }

    const totalSegments = this.segments.length;

    const targets: { distance: number; taperFactor: number }[] = [];
    let cumulativeDistance = 0;
    for (let i = 0; i < totalSegments; i++) {
      const distanceFromTail = totalSegments - 1 - i;
      const isTapered = distanceFromTail < TAPER_COUNT;
      const taperFactor = isTapered
        ? 0.35 + 0.65 * (distanceFromTail / TAPER_COUNT)
        : 1;
      const spacingForThisSegment = SEGMENT_SPACING * (isTapered ? Math.max(taperFactor, 0.5) : 1);
      cumulativeDistance += spacingForThisSegment;
      targets.push({ distance: cumulativeDistance, taperFactor });
    }

    let travelled = 0;
    let targetIndex = 0;
    const now = performance.now();

    for (let i = 1; i < this.positionHistory.length && targetIndex < targets.length; i++) {
      const a = this.positionHistory[i - 1];
      const b = this.positionHistory[i];
      const segmentLength = a.distanceTo(b);

      while (targetIndex < targets.length && travelled + segmentLength >= targets[targetIndex].distance) {
        const remaining = targets[targetIndex].distance - travelled;
        const t = segmentLength > 0 ? remaining / segmentLength : 0;
        const point = a.clone().lerp(b, t);
        const taperFactor = targets[targetIndex].taperFactor;

        // Direction of travel at this point, using reused scratch vectors (no allocation)
        scratchDirection.copy(a).sub(b).normalize();
        scratchPerpendicular.set(-scratchDirection.z, 0, scratchDirection.x);

        const wave =
          Math.sin(now * 0.004 - targets[targetIndex].distance * BODY_WAVE_FREQUENCY) *
          BODY_WAVE_AMPLITUDE;

        point.addScaledVector(scratchPerpendicular, wave);

        const segmentTerrainHeight = getTerrainHeight(point.x, point.z);

        this.segments[targetIndex].position.set(
          point.x,
          segmentTerrainHeight + SEGMENT_GROUND_OFFSET,
          point.z
        );

        const lookTarget =
          targetIndex === 0 ? this.head.position : this.segments[targetIndex - 1].position;

        const dx = lookTarget.x - point.x;
        const dz = lookTarget.z - point.z;
        this.segments[targetIndex].rotation.y = Math.atan2(dx, dz);
        this.segments[targetIndex].scale.setScalar(taperFactor);

        this.segmentShadows[targetIndex].position.set(point.x, segmentTerrainHeight + 0.02, point.z);
        this.segmentShadows[targetIndex].scale.setScalar(taperFactor);

        targetIndex++;
      }

      travelled += segmentLength;
    }

    const fallbackPoint = this.positionHistory[this.positionHistory.length - 1];
    while (targetIndex < targets.length && fallbackPoint) {
      const taperFactor = targets[targetIndex].taperFactor;
      const segmentTerrainHeight = getTerrainHeight(fallbackPoint.x, fallbackPoint.z);
      this.segments[targetIndex].position.set(
        fallbackPoint.x,
        segmentTerrainHeight + SEGMENT_GROUND_OFFSET,
        fallbackPoint.z
      );

      const lookTarget =
        targetIndex === 0 ? this.head.position : this.segments[targetIndex - 1].position;

      const dx = lookTarget.x - fallbackPoint.x;
      const dz = lookTarget.z - fallbackPoint.z;
      this.segments[targetIndex].rotation.y = Math.atan2(dx, dz);
      this.segments[targetIndex].scale.setScalar(taperFactor);
      this.segmentShadows[targetIndex].position.set(fallbackPoint.x, segmentTerrainHeight + 0.02, fallbackPoint.z);
      this.segmentShadows[targetIndex].scale.setScalar(taperFactor);
      targetIndex++;
    }
  }
}