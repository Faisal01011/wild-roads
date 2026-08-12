import * as THREE from 'three';
import type { QualityProfile } from '../utils/quality';

const PARTICLE_COUNT = 96;
const GOLD = new THREE.Color(0xf2c66d);
const MOSS = new THREE.Color(0x89a85f);
const DUST = new THREE.Color(0x9d7650);
const DANGER = new THREE.Color(0xd85745);

const vertexShader = /* glsl */ `
  attribute float aLife;
  attribute float aSize;
  attribute vec3 aColor;

  varying float vLife;
  varying vec3 vColor;

  void main() {
    vLife = aLife;
    vColor = aColor;

    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (260.0 / max(1.0, -viewPosition.z));
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const fragmentShader = /* glsl */ `
  varying float vLife;
  varying vec3 vColor;

  void main() {
    float distanceFromCenter = length(gl_PointCoord - vec2(0.5));
    float softDisc = 1.0 - smoothstep(0.12, 0.5, distanceFromCenter);
    float fade = smoothstep(0.0, 0.18, vLife) * min(1.0, vLife * 1.8);
    gl_FragColor = vec4(vColor, softDisc * fade * 0.72);
  }
`;

const perpendicular = new THREE.Vector3();

export class SnakeTrail {
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;
  private points: THREE.Points;
  private positions = new Float32Array(PARTICLE_COUNT * 3);
  private colors = new Float32Array(PARTICLE_COUNT * 3);
  private life = new Float32Array(PARTICLE_COUNT);
  private maxLife = new Float32Array(PARTICLE_COUNT);
  private sizes = new Float32Array(PARTICLE_COUNT);
  private velocities = new Float32Array(PARTICLE_COUNT * 3);
  private cursor = 0;
  private spawnBudget = 0;
  private densityScale = 1;

  constructor() {
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: false,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  addToScene(scene: THREE.Scene) {
    scene.add(this.points);
  }

  setQuality(profile: QualityProfile) {
    this.densityScale = profile.particleDensity;
  }

  private spawn(
    position: THREE.Vector3,
    color: THREE.Color,
    size: number,
    lifetime: number,
    velocityX: number,
    velocityY: number,
    velocityZ: number
  ) {
    const index = this.cursor;
    const offset = index * 3;
    this.cursor = (this.cursor + 1) % PARTICLE_COUNT;

    this.positions[offset] = position.x;
    this.positions[offset + 1] = position.y;
    this.positions[offset + 2] = position.z;
    this.colors[offset] = color.r;
    this.colors[offset + 1] = color.g;
    this.colors[offset + 2] = color.b;
    this.velocities[offset] = velocityX;
    this.velocities[offset + 1] = velocityY;
    this.velocities[offset + 2] = velocityZ;
    this.maxLife[index] = lifetime;
    this.life[index] = 1;
    this.sizes[index] = size;
  }

  update(
    delta: number,
    emitter: THREE.Vector3,
    forward: THREE.Vector3,
    boostAmount: number,
    turnAmount: number,
    reducedMotion: boolean
  ) {
    for (let index = 0; index < PARTICLE_COUNT; index++) {
      if (this.life[index] <= 0) continue;

      const offset = index * 3;
      const remainingSeconds = this.life[index] * this.maxLife[index] - delta;
      this.life[index] = Math.max(0, remainingSeconds / this.maxLife[index]);
      this.velocities[offset + 1] -= 0.45 * delta;
      this.positions[offset] += this.velocities[offset] * delta;
      this.positions[offset + 1] += this.velocities[offset + 1] * delta;
      this.positions[offset + 2] += this.velocities[offset + 2] * delta;
    }

    if (reducedMotion) {
      this.life.fill(0);
      this.spawnBudget = 0;
    } else {
      const spawnRate = (boostAmount * 34 + Math.max(0, turnAmount - 0.35) * 9)
        * this.densityScale;
      this.spawnBudget += spawnRate * delta;
      perpendicular.set(-forward.z, 0, forward.x);

      while (this.spawnBudget >= 1) {
        this.spawnBudget -= 1;
        const side = (Math.random() - 0.5) * (0.36 + boostAmount * 0.28);
        const lift = 0.04 + Math.random() * 0.1;
        const color = Math.random() > 0.52 ? GOLD : boostAmount > 0.35 ? MOSS : DUST;
        const speed = 0.25 + Math.random() * 0.45;
        this.spawn(
          emitter,
          color,
          0.7 + boostAmount * 1.15 + Math.random() * 0.45,
          0.38 + Math.random() * 0.28,
          perpendicular.x * side - forward.x * speed,
          lift,
          perpendicular.z * side - forward.z * speed
        );
      }
    }

    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aLife as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }

  spawnGrowthBurst(position: THREE.Vector3, reducedMotion: boolean) {
    if (reducedMotion) return;
    const count = Math.max(4, Math.round(12 * this.densityScale));
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2 + Math.random() * 0.2;
      const speed = 0.35 + Math.random() * 0.55;
      this.spawn(
        position,
        index % 2 === 0 ? GOLD : MOSS,
        1.1 + Math.random() * 0.55,
        0.45 + Math.random() * 0.25,
        Math.cos(angle) * speed,
        0.35 + Math.random() * 0.45,
        Math.sin(angle) * speed
      );
    }
  }

  spawnHitBurst(position: THREE.Vector3, reducedMotion: boolean) {
    if (reducedMotion) return;
    const count = Math.max(4, Math.round(10 * this.densityScale));
    for (let index = 0; index < count; index++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.55 + Math.random() * 0.75;
      this.spawn(
        position,
        DANGER,
        1.1 + Math.random() * 0.6,
        0.32 + Math.random() * 0.2,
        Math.cos(angle) * speed,
        0.4 + Math.random() * 0.55,
        Math.sin(angle) * speed
      );
    }
  }

  clear() {
    this.life.fill(0);
    this.spawnBudget = 0;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }
}
