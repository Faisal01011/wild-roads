import * as THREE from 'three';
import { input } from '../utils/input';
import { getTerrainHeight, resolveTerrainCollisions } from '../world/chunk';
import type { TerrainCollider } from '../world/chunk';
import { SnakeTrail } from './snakeTrail';
import type { QualityProfile } from '../utils/quality';

const FORWARD_SPEED = 5;
const BOOST_SPEED = 9;
const TURN_SPEED = 2.5;
const SEGMENT_SPACING = 0.5;
const HISTORY_LENGTH = 720;
const HISTORY_BOOTSTRAP_SPACING = 0.08;
const HEAD_GROUND_OFFSET = 0.48;
const SEGMENT_GROUND_OFFSET = 0.39;
const HEAD_COLLISION_RADIUS = 0.5;
const SEGMENT_RADIUS = 0.34;
const SEGMENT_LENGTH = 0.3;
const TAPER_COUNT = 6;
const GROWTH_DURATION = 0.48;

const MAX_STAMINA = 100;
const STAMINA_DRAIN_RATE = 35;
const STAMINA_REGEN_RATE = 20;
const MIN_STAMINA_TO_BOOST = 5;

const BODY_WAVE_AMPLITUDE = 0.12;
const BODY_WAVE_FREQUENCY = 2.15;

interface SnakeOptions {
  reducedMotion?: boolean;
}

interface SegmentState {
  mesh: THREE.Mesh;
  shadow: THREE.Mesh;
  growth: number;
}

function createBlobShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(3, 10, 7, 0.5)');
  gradient.addColorStop(0.55, 'rgba(3, 10, 7, 0.24)');
  gradient.addColorStop(1, 'rgba(3, 10, 7, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function createScaleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;

  context.fillStyle = '#d5ddaf';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const scaleWidth = 24;
  const scaleHeight = 18;
  for (let row = -1; row < 9; row++) {
    for (let column = -1; column < 13; column++) {
      const offset = row % 2 === 0 ? 0 : scaleWidth / 2;
      const x = column * scaleWidth + offset;
      const y = row * scaleHeight;
      const shade = (row + column) % 3 === 0 ? 'rgba(24, 69, 43, 0.28)' : 'rgba(64, 91, 45, 0.16)';
      context.beginPath();
      context.moveTo(x, y + scaleHeight * 0.45);
      context.quadraticCurveTo(x + scaleWidth * 0.5, y - scaleHeight * 0.08, x + scaleWidth, y + scaleHeight * 0.45);
      context.quadraticCurveTo(x + scaleWidth * 0.5, y + scaleHeight * 1.05, x, y + scaleHeight * 0.45);
      context.fillStyle = shade;
      context.fill();
      context.strokeStyle = 'rgba(35, 78, 45, 0.3)';
      context.lineWidth = 1;
      context.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3.8, 1.8);
  return texture;
}

function catmullRom(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  p3: THREE.Vector3,
  amount: number,
  target: THREE.Vector3
) {
  const amountSquared = amount * amount;
  const amountCubed = amountSquared * amount;
  target.set(
    0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * amount +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * amountSquared +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * amountCubed),
    0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * amount +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * amountSquared +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * amountCubed),
    0.5 *
      (2 * p1.z +
        (-p0.z + p2.z) * amount +
        (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * amountSquared +
        (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * amountCubed)
  );
}

function easeOutBack(amount: number): number {
  const overshoot = 1.3;
  const shifted = amount - 1;
  return 1 + (overshoot + 1) * shifted * shifted * shifted + overshoot * shifted * shifted;
}

const forwardVector = new THREE.Vector3();
const pathPoint = new THREE.Vector3();
const pathDirection = new THREE.Vector3();
const pathPerpendicular = new THREE.Vector3();
const lookDirection = new THREE.Vector3();

export class Snake {
  public head: THREE.Group;

  private headVisual = new THREE.Group();
  private headSkinMaterial: THREE.MeshStandardMaterial;
  private bodyMaterial: THREE.MeshStandardMaterial;
  private bellyMaterial: THREE.MeshStandardMaterial;
  private heading = 0;
  private turnVelocity = 0;
  private segments: SegmentState[] = [];
  private headShadow: THREE.Mesh;
  private positionHistory: THREE.Vector3[] = [];
  private stamina = MAX_STAMINA;
  private boosting = false;
  private currentSpeed = FORWARD_SPEED;
  private targetSpeed = FORWARD_SPEED;
  private speedBoostMultiplier = 1;
  private speedBoostTimer = 0;
  private boostVisualAmount = 0;
  private motionTime = 0;
  private hitTimer = 0;
  private hitDuration = 0;
  private reducedMotion: boolean;
  private playerShadowsEnabled = true;

  private scaleTexture = createScaleTexture();
  private shadowTexture = createBlobShadowTexture();
  private segmentGeometry = new THREE.CapsuleGeometry(SEGMENT_RADIUS, SEGMENT_LENGTH, 7, 14);
  private shadowGeometry = new THREE.PlaneGeometry(1, 1);
  private shadowMaterial: THREE.MeshBasicMaterial;
  private trail = new SnakeTrail();

  constructor(options: SnakeOptions = {}) {
    this.reducedMotion = options.reducedMotion ?? false;

    this.headSkinMaterial = new THREE.MeshStandardMaterial({
      color: 0x9caf5d,
      map: this.scaleTexture,
      roughness: 0.7,
      metalness: 0.02,
      emissive: 0x4d5c2d,
      emissiveIntensity: 0,
    });
    this.bodyMaterial = this.headSkinMaterial.clone();
    this.bodyMaterial.color.setHex(0x83984e);
    this.bellyMaterial = new THREE.MeshStandardMaterial({
      color: 0xb8b47b,
      roughness: 0.86,
      metalness: 0,
      emissive: 0x5c4728,
      emissiveIntensity: 0,
    });
    this.shadowMaterial = new THREE.MeshBasicMaterial({
      map: this.shadowTexture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    this.segmentGeometry.rotateX(Math.PI / 2);

    this.head = new THREE.Group();
    this.head.name = 'snake-player';
    this.createHead();
    this.head.add(this.headVisual);
    this.headShadow = this.createContactShadow(1.3, 1.05);

    for (let index = 0; index < 4; index++) this.addSegment(true);
    this.setStartPosition(0, 0);
  }

  private createHead() {
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.48, 20, 14), this.headSkinMaterial);
    skull.name = 'snake-skull';
    skull.scale.set(0.92, 0.7, 1.2);
    skull.position.set(0, 0.02, 0.08);
    skull.castShadow = true;
    skull.receiveShadow = true;
    this.headVisual.add(skull);

    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 10), this.headSkinMaterial);
    muzzle.name = 'snake-muzzle';
    muzzle.scale.set(1.08, 0.58, 0.88);
    muzzle.position.set(0, -0.07, 0.46);
    muzzle.castShadow = true;
    this.headVisual.add(muzzle);

    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.29, 14, 9), this.bellyMaterial);
    jaw.scale.set(1.04, 0.38, 0.9);
    jaw.position.set(0, -0.23, 0.39);
    jaw.castShadow = true;
    this.headVisual.add(jaw);

    const crownGeometry = new THREE.SphereGeometry(0.24, 14, 8);
    const crownMaterial = new THREE.MeshStandardMaterial({
      color: 0x2f5b3c,
      roughness: 0.82,
      metalness: 0,
    });
    const crown = new THREE.Mesh(crownGeometry, crownMaterial);
    crown.position.set(0, 0.345, 0.06);
    crown.scale.set(0.72, 0.18, 1.72);
    crown.castShadow = true;
    this.headVisual.add(crown);

    const eyeGeometry = new THREE.SphereGeometry(0.09, 12, 9);
    const eyeMaterial = new THREE.MeshStandardMaterial({
      color: 0xe7c96a,
      roughness: 0.38,
      metalness: 0.05,
      emissive: 0x6b4d13,
      emissiveIntensity: 0.16,
    });
    const pupilGeometry = new THREE.SphereGeometry(0.045, 10, 8);
    const pupilMaterial = new THREE.MeshStandardMaterial({
      color: 0x0d1510,
      roughness: 0.25,
      metalness: 0.08,
    });
    const glintGeometry = new THREE.SphereGeometry(0.014, 6, 5);
    const glintMaterial = new THREE.MeshBasicMaterial({ color: 0xfff4cf, toneMapped: false });

    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
      eye.position.set(side * 0.28, 0.14, 0.35);
      eye.scale.set(0.86, 1, 0.78);
      eye.castShadow = true;

      const pupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
      pupil.position.set(side * 0.294, 0.14, 0.414);
      pupil.scale.set(0.58, 1.15, 0.5);

      const glint = new THREE.Mesh(glintGeometry, glintMaterial);
      glint.position.set(side * 0.278, 0.173, 0.451);
      this.headVisual.add(eye, pupil, glint);
    }

    const nostrilGeometry = new THREE.SphereGeometry(0.022, 7, 5);
    const nostrilMaterial = new THREE.MeshBasicMaterial({ color: 0x263325 });
    for (const side of [-1, 1]) {
      const nostril = new THREE.Mesh(nostrilGeometry, nostrilMaterial);
      nostril.position.set(side * 0.105, -0.015, 0.715);
      this.headVisual.add(nostril);
    }
  }

  private createContactShadow(width: number, depth: number): THREE.Mesh {
    const shadow = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(width, depth, 1);
    shadow.renderOrder = 1;
    return shadow;
  }

  private addSegment(instant: boolean): SegmentState {
    const mesh = new THREE.Mesh(this.segmentGeometry, this.bodyMaterial);
    mesh.castShadow = this.playerShadowsEnabled;
    mesh.receiveShadow = true;
    mesh.position.copy(this.head.position);

    const shadow = this.createContactShadow(0.78, 0.92);
    const segment = { mesh, shadow, growth: instant ? 1 : 0 };
    this.segments.push(segment);
    return segment;
  }

  grow(scene: THREE.Scene) {
    const segment = this.addSegment(false);
    const previousTail = this.segments[this.segments.length - 2];
    if (previousTail) {
      segment.mesh.position.copy(previousTail.mesh.position);
      segment.shadow.position.copy(previousTail.shadow.position);
    }
    scene.add(segment.mesh, segment.shadow);
    this.trail.spawnGrowthBurst(segment.mesh.position, this.reducedMotion);
  }

  shrink(scene: THREE.Scene, count: number = 1) {
    for (let index = 0; index < count; index++) {
      if (this.segments.length <= 1) break;
      const segment = this.segments.pop();
      if (!segment) continue;
      scene.remove(segment.mesh, segment.shadow);
    }
  }

  get length(): number {
    return this.segments.length;
  }

  get staminaPercent(): number {
    return this.stamina / MAX_STAMINA;
  }

  get isSpeedBoosted(): boolean {
    return this.speedBoostTimer > 0;
  }

  get speedBoostSecondsRemaining(): number {
    return this.speedBoostTimer;
  }

  get headingAngle(): number {
    return this.heading;
  }

  get turnAmount(): number {
    return THREE.MathUtils.clamp(this.turnVelocity / TURN_SPEED, -1, 1);
  }

  get boostAmount(): number {
    return this.boostVisualAmount;
  }

  get speedRatio(): number {
    return this.currentSpeed / FORWARD_SPEED;
  }

  setReducedMotion(reduced: boolean) {
    this.reducedMotion = reduced;
    if (reduced) this.trail.clear();
  }

  setQuality(profile: QualityProfile) {
    this.playerShadowsEnabled = profile.playerShadows;
    this.trail.setQuality(profile);
    this.head.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.userData.authoredCastShadow === undefined) {
        child.userData.authoredCastShadow = child.castShadow;
      }
      child.castShadow = profile.playerShadows && Boolean(child.userData.authoredCastShadow);
    });
    for (const segment of this.segments) {
      segment.mesh.castShadow = profile.playerShadows;
    }
  }

  setStartPosition(worldX: number, worldZ: number) {
    const terrainHeight = getTerrainHeight(worldX, worldZ);
    this.head.position.set(worldX, terrainHeight + HEAD_GROUND_OFFSET, worldZ);
    this.headShadow.position.set(worldX, terrainHeight + 0.025, worldZ);
    this.positionHistory = [];

    const pathLength = Math.max(4, this.segments.length + 2) * SEGMENT_SPACING;
    const sampleCount = Math.ceil(pathLength / HISTORY_BOOTSTRAP_SPACING);
    for (let index = 0; index <= sampleCount; index++) {
      const z = worldZ - index * HISTORY_BOOTSTRAP_SPACING;
      const height = getTerrainHeight(worldX, z) + HEAD_GROUND_OFFSET;
      this.positionHistory.push(new THREE.Vector3(worldX, height, z));
    }

    this.positionSegments(0);
    this.trail.clear();
  }

  applySpeedBoost(durationSeconds: number, multiplier: number) {
    this.speedBoostMultiplier = multiplier;
    this.speedBoostTimer = durationSeconds;
  }

  refillStamina(amount: number) {
    this.stamina = Math.min(MAX_STAMINA, this.stamina + amount);
  }

  triggerHit(durationSeconds: number) {
    this.hitDuration = durationSeconds;
    this.hitTimer = durationSeconds;
    this.trail.spawnHitBurst(this.head.position, this.reducedMotion);
  }

  addToScene(scene: THREE.Scene) {
    scene.add(this.head, this.headShadow);
    for (const segment of this.segments) scene.add(segment.mesh, segment.shadow);
    this.trail.addToScene(scene);
  }

  private taperForIndex(index: number): number {
    const distanceFromTail = this.segments.length - 1 - index;
    if (distanceFromTail >= TAPER_COUNT) return 1;
    return 0.3 + 0.7 * (distanceFromTail / TAPER_COUNT);
  }

  private spacingForIndex(index: number): number {
    const taper = this.taperForIndex(index);
    return SEGMENT_SPACING * THREE.MathUtils.lerp(0.44, 1, taper);
  }

  private updateSegmentTransform(index: number, point: THREE.Vector3, taper: number, delta: number) {
    const segment = this.segments[index];
    if (!segment) return;

    segment.growth = Math.min(1, segment.growth + delta / GROWTH_DURATION);
    const growth = segment.growth >= 1 ? 1 : Math.max(0, easeOutBack(segment.growth));
    const growthPulse = segment.growth < 1 ? 1 + Math.sin(segment.growth * Math.PI) * 0.08 : 1;
    const scale = taper * growth * growthPulse;
    const terrainHeight = getTerrainHeight(point.x, point.z);

    segment.mesh.position.set(point.x, terrainHeight + SEGMENT_GROUND_OFFSET, point.z);
    const lookTarget = index === 0 ? this.head.position : this.segments[index - 1].mesh.position;
    lookDirection.copy(lookTarget).sub(segment.mesh.position);
    const horizontalDistance = Math.hypot(lookDirection.x, lookDirection.z);
    const yaw = Math.atan2(lookDirection.x, lookDirection.z);
    const pitch = -Math.atan2(lookDirection.y, Math.max(0.001, horizontalDistance));
    const bodyRoll = this.reducedMotion
      ? 0
      : Math.sin(this.motionTime * 7 - index * 0.58) * 0.11 * Math.min(1, this.speedRatio);

    segment.mesh.rotation.set(pitch, yaw, bodyRoll, 'YXZ');
    segment.mesh.scale.set(scale, scale * 0.78, scale * 1.04);
    segment.shadow.position.set(point.x, terrainHeight + 0.025, point.z);
    segment.shadow.scale.set(scale * 0.78, scale * 0.96, 1);
  }

  private positionSegments(delta: number) {
    if (this.positionHistory.length < 2) return;

    let targetIndex = 0;
    let targetDistance = this.spacingForIndex(0);
    let travelled = 0;

    for (let pathIndex = 1; pathIndex < this.positionHistory.length && targetIndex < this.segments.length; pathIndex++) {
      const newer = this.positionHistory[pathIndex - 1];
      const older = this.positionHistory[pathIndex];
      const segmentLength = newer.distanceTo(older);

      while (targetIndex < this.segments.length && travelled + segmentLength >= targetDistance) {
        const remaining = targetDistance - travelled;
        const amount = segmentLength > 0.0001 ? remaining / segmentLength : 0;
        const p0 = this.positionHistory[Math.max(0, pathIndex - 2)];
        const p3 = this.positionHistory[Math.min(this.positionHistory.length - 1, pathIndex + 1)];
        catmullRom(p0, newer, older, p3, amount, pathPoint);

        pathDirection.copy(newer).sub(older);
        pathDirection.y = 0;
        if (pathDirection.lengthSq() > 0.0001) pathDirection.normalize();
        pathPerpendicular.set(-pathDirection.z, 0, pathDirection.x);

        const taper = this.taperForIndex(targetIndex);
        const waveStrength = this.reducedMotion
          ? 0.018
          : BODY_WAVE_AMPLITUDE *
            (0.72 + this.boostVisualAmount * 0.58) *
            THREE.MathUtils.lerp(0.24, 1, taper);
        const wave =
          Math.sin(this.motionTime * 6.4 - targetDistance * BODY_WAVE_FREQUENCY) * waveStrength;
        pathPoint.addScaledVector(pathPerpendicular, wave);

        this.updateSegmentTransform(targetIndex, pathPoint, taper, delta);
        targetIndex++;
        if (targetIndex < this.segments.length) targetDistance += this.spacingForIndex(targetIndex);
      }

      travelled += segmentLength;
    }

    const fallback = this.positionHistory[this.positionHistory.length - 1];
    while (targetIndex < this.segments.length) {
      this.updateSegmentTransform(targetIndex, fallback, this.taperForIndex(targetIndex), delta);
      targetIndex++;
    }
  }

  private updateVisualState(delta: number, terrainHeight: number) {
    forwardVector.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    const aheadHeight = getTerrainHeight(
      this.head.position.x + forwardVector.x * 0.9,
      this.head.position.z + forwardVector.z * 0.9
    );
    const slopePitch = -Math.atan2(aheadHeight - terrainHeight, 0.9);
    const hitProgress = this.hitDuration > 0 ? this.hitTimer / this.hitDuration : 0;
    const hitPulse = hitProgress > 0 ? 0.35 + Math.abs(Math.sin(hitProgress * Math.PI * 8)) * 0.8 : 0;
    const boostGlow = this.boostVisualAmount * 0.22;
    const visualLerp = 1 - Math.exp(-10 * delta);
    const bob = this.reducedMotion ? 0 : Math.sin(this.motionTime * 7.4) * 0.025 * Math.min(1.2, this.speedRatio);
    const hitKick = this.reducedMotion ? 0 : Math.sin(hitProgress * Math.PI) * 0.16;

    this.headVisual.position.y = bob;
    this.headVisual.rotation.x = THREE.MathUtils.lerp(this.headVisual.rotation.x, slopePitch + hitKick, visualLerp);
    this.headVisual.rotation.z = THREE.MathUtils.lerp(
      this.headVisual.rotation.z,
      this.reducedMotion ? 0 : -this.turnAmount * 0.17,
      visualLerp
    );

    const emissiveColor = hitPulse > 0 ? 0xd85745 : 0x71833d;
    this.headSkinMaterial.emissive.setHex(emissiveColor);
    this.bodyMaterial.emissive.setHex(emissiveColor);
    this.bellyMaterial.emissive.setHex(hitPulse > 0 ? 0x8c2d24 : 0x5c4728);
    this.headSkinMaterial.emissiveIntensity = hitPulse * 0.95 + boostGlow;
    this.bodyMaterial.emissiveIntensity = hitPulse * 0.72 + boostGlow * 0.8;
    this.bellyMaterial.emissiveIntensity = hitPulse * 0.5;
  }

  update(delta: number, terrainColliders: TerrainCollider[]) {
    this.motionTime += delta * THREE.MathUtils.clamp(this.speedRatio, 0.65, 2.2);
    this.hitTimer = Math.max(0, this.hitTimer - delta);

    const turnInput = input.getTurnInput();
    const targetTurnVelocity = -turnInput * TURN_SPEED;
    this.turnVelocity = THREE.MathUtils.lerp(
      this.turnVelocity,
      targetTurnVelocity,
      1 - Math.exp(-8 * delta)
    );
    this.heading += this.turnVelocity * delta;
    this.head.rotation.y = this.heading;

    const wantsBoost = input.wantsBoost();
    if (wantsBoost && this.stamina > MIN_STAMINA_TO_BOOST) this.boosting = true;
    if (!wantsBoost || this.stamina <= 0) this.boosting = false;

    if (this.boosting) {
      this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN_RATE * delta);
    } else {
      this.stamina = Math.min(MAX_STAMINA, this.stamina + STAMINA_REGEN_RATE * delta);
    }

    if (this.speedBoostTimer > 0) {
      this.speedBoostTimer = Math.max(0, this.speedBoostTimer - delta);
      if (this.speedBoostTimer <= 0) this.speedBoostMultiplier = 1;
    }

    this.targetSpeed = (this.boosting ? BOOST_SPEED : FORWARD_SPEED) * this.speedBoostMultiplier;
    this.currentSpeed = THREE.MathUtils.lerp(
      this.currentSpeed,
      this.targetSpeed,
      1 - Math.exp(-6 * delta)
    );
    const targetBoostVisual = Math.max(this.boosting ? 1 : 0, this.speedBoostTimer > 0 ? 0.72 : 0);
    this.boostVisualAmount = THREE.MathUtils.lerp(
      this.boostVisualAmount,
      targetBoostVisual,
      1 - Math.exp(-7 * delta)
    );

    forwardVector.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.head.position.addScaledVector(forwardVector, this.currentSpeed * delta);
    resolveTerrainCollisions(this.head.position, terrainColliders, HEAD_COLLISION_RADIUS);

    const terrainHeight = getTerrainHeight(this.head.position.x, this.head.position.z);
    this.head.position.y = terrainHeight + HEAD_GROUND_OFFSET;
    this.headShadow.position.set(this.head.position.x, terrainHeight + 0.025, this.head.position.z);

    const recycled = this.positionHistory.length >= HISTORY_LENGTH ? this.positionHistory.pop() : undefined;
    const newest = recycled ?? new THREE.Vector3();
    newest.copy(this.head.position);
    this.positionHistory.unshift(newest);

    this.positionSegments(delta);
    this.updateVisualState(delta, terrainHeight);

    const effectSegmentIndex = Math.min(
      this.segments.length - 1,
      Math.max(2, Math.floor(this.segments.length * 0.45))
    );
    const tail = this.segments[effectSegmentIndex]?.mesh.position ?? this.head.position;
    this.trail.update(
      delta,
      tail,
      forwardVector,
      this.boostVisualAmount,
      Math.abs(this.turnAmount),
      this.reducedMotion
    );
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.head, this.headShadow);
    for (const segment of this.segments) scene.remove(segment.mesh, segment.shadow);
    this.trail.dispose(scene);

    const headGeometries = new Set<THREE.BufferGeometry>();
    const headMaterials = new Set<THREE.Material>();
    this.head.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      headGeometries.add(child.geometry);
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => headMaterials.add(material));
    });
    headGeometries.forEach((geometry) => geometry.dispose());
    headMaterials.forEach((material) => material.dispose());

    this.segmentGeometry.dispose();
    this.bodyMaterial.dispose();
    this.shadowGeometry.dispose();
    this.shadowMaterial.dispose();
    this.scaleTexture.dispose();
    this.shadowTexture.dispose();
    this.positionHistory = [];
    this.segments = [];
  }
}
