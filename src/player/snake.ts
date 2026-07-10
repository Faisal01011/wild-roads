import * as THREE from 'three';
import { input } from '../utils/input';

import { getTerrainHeight } from '../world/chunk';

const HEAD_GROUND_OFFSET = 0.5;
const SEGMENT_GROUND_OFFSET = 0.4;
const FORWARD_SPEED = 5;
const BOOST_SPEED = 9;
const TURN_SPEED = 2.5;
const SEGMENT_SPACING = 0.6;
const SEGMENT_RADIUS = 0.4;
const HISTORY_LENGTH = 500;

const MAX_STAMINA = 100;
const STAMINA_DRAIN_RATE = 35; // per second while boosting
const STAMINA_REGEN_RATE = 20; // per second while not boosting
const MIN_STAMINA_TO_BOOST = 5; // can't start a boost below this threshold

export class Snake {
  public head: THREE.Mesh;
  private heading: number = 0;
  private segments: THREE.Mesh[] = [];
  private positionHistory: THREE.Vector3[] = [];
  private stamina: number = MAX_STAMINA;
  private isBoosting: boolean = false;

  constructor() {
    const headGeometry = new THREE.SphereGeometry(SEGMENT_RADIUS, 8, 8);
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0x1b5e20 });
    this.head = new THREE.Mesh(headGeometry, headMaterial);
    this.head.position.y = 0.5;
    this.head.castShadow = true;

    for (let i = 0; i < 3; i++) {
      this.addSegment();
    }
  }

  private addSegment() {
    const geometry = new THREE.SphereGeometry(SEGMENT_RADIUS, 8, 8);
    const material = new THREE.MeshStandardMaterial({ color: 0x2e7d32 });
    const segment = new THREE.Mesh(geometry, material);
    segment.castShadow = true;
    segment.position.copy(this.head.position);
    this.segments.push(segment);
  }

  grow(scene: THREE.Scene) {
  this.addSegment();
  const newest = this.segments[this.segments.length - 1];
  scene.add(newest); // add immediately, don't wait for the next update() cycle
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

  update(delta: number) {
    
    // Turning
    const turnInput = input.getTurnInput();
    this.heading -= turnInput * TURN_SPEED * delta;
    this.head.rotation.y = this.heading;

    // Boost handling
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

    // Move head forward
    const forward = new THREE.Vector3(
      Math.sin(this.heading),
      0,
      Math.cos(this.heading)
    );
    this.head.position.addScaledVector(forward, currentSpeed * delta);
    
    // Follow terrain height
    const terrainHeight = getTerrainHeight(this.head.position.x, this.head.position.z);
    this.head.position.y = terrainHeight + HEAD_GROUND_OFFSET;

    // Record head position into history
    this.positionHistory.unshift(this.head.position.clone());
    if (this.positionHistory.length > HISTORY_LENGTH) {
      this.positionHistory.pop();
    }

    // Segments follow the trail
    for (let i = 0; i < this.segments.length; i++) {
  const targetDistance = SEGMENT_SPACING * (i + 1);
  const point = this.getHistoryPointAtDistance(targetDistance);
  if (point) {
    const segmentTerrainHeight = getTerrainHeight(point.x, point.z);
    this.segments[i].position.set(point.x, segmentTerrainHeight + SEGMENT_GROUND_OFFSET, point.z);
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