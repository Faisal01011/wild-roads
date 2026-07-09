import * as THREE from 'three';
import { input } from '../utils/input';

const FORWARD_SPEED = 5;
const TURN_SPEED = 2.5;
const SEGMENT_SPACING = 0.6; // distance between each segment along the trail
const SEGMENT_RADIUS = 0.4;
const HISTORY_LENGTH = 500; // max trail points kept — generous ceiling for growth

export class Snake {
  public head: THREE.Mesh;
  private heading: number = 0;
  private segments: THREE.Mesh[] = [];
  private positionHistory: THREE.Vector3[] = [];

  constructor() {
    const headGeometry = new THREE.SphereGeometry(SEGMENT_RADIUS, 8, 8);
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0x1b5e20 });
    this.head = new THREE.Mesh(headGeometry, headMaterial);
    this.head.position.y = 0.5;
    this.head.castShadow = true;

    // Start with a few segments so it doesn't look like a single dot
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

  grow() {
    this.addSegment();
  }

  get length(): number {
    return this.segments.length;
  }

  addToScene(scene: THREE.Scene) {
    scene.add(this.head);
    for (const segment of this.segments) {
      scene.add(segment);
    }
  }

  private addNewSegmentToScene(scene: THREE.Scene) {
    const newest = this.segments[this.segments.length - 1];
    scene.add(newest);
  }

  update(delta: number, scene: THREE.Scene) {
    const previousSegmentCount = this.segments.length;

    // Turning
    const turnInput = input.getTurnInput();
    this.heading -= turnInput * TURN_SPEED * delta;
    this.head.rotation.y = this.heading;

    // Move head forward
    const forward = new THREE.Vector3(
      Math.sin(this.heading),
      0,
      Math.cos(this.heading)
    );
    this.head.position.addScaledVector(forward, FORWARD_SPEED * delta);

    // Record head position into history
    this.positionHistory.unshift(this.head.position.clone());
    if (this.positionHistory.length > HISTORY_LENGTH) {
      this.positionHistory.pop();
    }

    // Each segment follows a point further back in the trail,
    // spaced out by SEGMENT_SPACING
    for (let i = 0; i < this.segments.length; i++) {
      const targetDistance = SEGMENT_SPACING * (i + 1);
      const point = this.getHistoryPointAtDistance(targetDistance);
      if (point) {
        this.segments[i].position.copy(point);
      }
    }

    // If a new segment was added elsewhere (via grow()), make sure it's in the scene
    if (this.segments.length > previousSegmentCount) {
      this.addNewSegmentToScene(scene);
    }
  }

  // Walk the history trail and find the point at a given distance from the head
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

    // Not enough history yet (e.g. right at spawn) — fall back to the oldest point
    return this.positionHistory[this.positionHistory.length - 1] ?? null;
  }
}