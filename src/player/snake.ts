import * as THREE from 'three';
import { input } from '../utils/input';

const FORWARD_SPEED = 5; // units per second
const TURN_SPEED = 2.5;  // radians per second

export class Snake {
  public mesh: THREE.Mesh;
  private heading: number = 0; // current facing angle in radians

  constructor() {
    const geometry = new THREE.CapsuleGeometry(0.5, 2, 4, 8);
    const material = new THREE.MeshStandardMaterial({ color: 0x2e7d32 });
    this.mesh = new THREE.Mesh(geometry, material);

    this.mesh.rotation.z = Math.PI / 2; // lay it horizontal at rest
    this.mesh.position.y = 0.5;
    this.mesh.castShadow = true;
  }

  update(delta: number) {
    // Turning
    const turnInput = input.getTurnInput();
    this.heading -= turnInput * TURN_SPEED * delta;

    // Apply heading to mesh rotation (rotate around Y axis, the "up" axis)
    this.mesh.rotation.y = this.heading;

    // Move forward in the direction of heading
    const forward = new THREE.Vector3(
      Math.sin(this.heading),
      0,
      Math.cos(this.heading)
    );
    this.mesh.position.addScaledVector(forward, FORWARD_SPEED * delta);
  }
}