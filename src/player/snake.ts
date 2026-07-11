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

export class Snake {
  public head: THREE.Object3D;
  private heading: number = 0;
  private segments: THREE.Mesh[] = [];
  private positionHistory: THREE.Vector3[] = [];
  private stamina: number = MAX_STAMINA;
  private isBoosting: boolean = false;

  constructor() {
    const headGroup = new THREE.Group();

    const headGeometry = new THREE.ConeGeometry(0.4, 0.7, 8);
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xc9a35c });
    const headMesh = new THREE.Mesh(headGeometry, headMaterial);
    headMesh.rotation.x = Math.PI / 2;
    headMesh.castShadow = true;
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

    for (let i = 0; i < 3; i++) {
      this.addSegment();
    }
  }

  private addSegment() {
    const geometry = new THREE.SphereGeometry(SEGMENT_BASE_RADIUS, 8, 8);
    const material = new THREE.MeshStandardMaterial({ color: 0xc9a35c });
    const segment = new THREE.Mesh(geometry, material);
    segment.castShadow = true;
    segment.position.copy(this.head.position);
    this.segments.push(segment);
  }

  grow(scene: THREE.Scene) {
    this.addSegment();
    const newest = this.segments[this.segments.length - 1];
    scene.add(newest);
  }

  get length(): number {
    return this.segments.length;
  }

  get staminaPercent(): number {
    return this.stamina / MAX_STAMINA;
  }

  addToScene(scene: THREE.Scene) {
    scene.add(this.head);
    for (const segment of this.segments) {
      scene.add(segment);
    }
  }

  update(delta: number, rockColliders: RockCollider[]) {
    const turnInput = input.getTurnInput();
    this.heading -= turnInput * TURN_SPEED * delta;
    this.head.rotation.y = this.heading;

    const wantsBoost = input.isPressed('shift') || input.isPressed(' ');

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

    const currentSpeed = this.isBoosting ? BOOST_SPEED : FORWARD_SPEED;

    const forward = new THREE.Vector3(
      Math.sin(this.heading),
      0,
      Math.cos(this.heading)
    );
    this.head.position.addScaledVector(forward, currentSpeed * delta);

    resolveRockCollisions(this.head.position, rockColliders, HEAD_COLLISION_RADIUS);

    const terrainHeight = getTerrainHeight(this.head.position.x, this.head.position.z);
    this.head.position.y = terrainHeight + HEAD_GROUND_OFFSET;

    this.positionHistory.unshift(this.head.position.clone());
    if (this.positionHistory.length > HISTORY_LENGTH) {
      this.positionHistory.pop();
    }

    const totalSegments = this.segments.length;

    for (let i = 0; i < totalSegments; i++) {
      const targetDistance = SEGMENT_SPACING * (i + 1);
      const point = this.getHistoryPointAtDistance(targetDistance);
      if (point) {
        const segmentTerrainHeight = getTerrainHeight(point.x, point.z);
        this.segments[i].position.set(point.x, segmentTerrainHeight + SEGMENT_GROUND_OFFSET, point.z);

        const distanceFromTail = totalSegments - 1 - i;
        if (distanceFromTail < TAPER_COUNT) {
          const taperFactor = 0.35 + 0.65 * (distanceFromTail / TAPER_COUNT);
          this.segments[i].scale.setScalar(taperFactor);
        } else {
          this.segments[i].scale.setScalar(1);
        }
      }
    }
  }

  private getHistoryPointAtDistance(distance: number): THREE.Vector3 | null {
    let travelled = 0;

    for (let i = 1; i < this.positionHistory.length; i++) {
      const a = this.positionHistory[i - 1];
      const b = this.positionHistory[i];
      const segmentLength = a.distanceTo(b);

      if (travelled + segmentLength >= distance) {
        const remaining = distance - travelled;
        const t = remaining / segmentLength;
        return a.clone().lerp(b, t);
      }

      travelled += segmentLength;
    }

    return this.positionHistory[this.positionHistory.length - 1] ?? null;
  }
}