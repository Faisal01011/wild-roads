import * as THREE from 'three';
import type { QualityProfile } from './quality';

// ---------- Screen shake ----------
let shakeMagnitude = 0;
const shakeDecay = 4;
let shakePhase = 0;
let reducedMotion = false;
const shakeOffset = new THREE.Vector3();

export function setEffectsReducedMotion(reduced: boolean) {
  reducedMotion = reduced;
  if (reduced) shakeMagnitude = 0;
}

let particleDensity = 1;

export function setEffectsQuality(profile: QualityProfile) {
  particleDensity = profile.particleDensity;
}

export function triggerShake(intensity: number) {
  if (reducedMotion) return;
  shakeMagnitude = Math.max(shakeMagnitude, intensity);
}

export function updateShake(delta: number): THREE.Vector3 {
  if (reducedMotion || shakeMagnitude <= 0) return shakeOffset.set(0, 0, 0);

  shakePhase += delta * 64;
  shakeOffset.set(
    Math.sin(shakePhase * 1.7) * shakeMagnitude * 0.48,
    Math.cos(shakePhase * 2.3) * shakeMagnitude * 0.34,
    Math.sin(shakePhase * 1.1) * shakeMagnitude * 0.12
  );

  shakeMagnitude = Math.max(0, shakeMagnitude - shakeDecay * delta);
  return shakeOffset;
}

// ---------- Eat particle burst ----------
interface Burst {
  points: THREE.Points;
  positions: Float32Array;
  velocities: Float32Array;
  particleCount: number;
  age: number;
  lifetime: number;
  active: boolean;
}

const BURST_POOL_SIZE = 6;
const MAX_BURST_PARTICLES = 10;
const burstPool: Burst[] = [];

function createBurst(scene: THREE.Scene): Burst {
  const positions = new Float32Array(MAX_BURST_PARTICLES * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, 0);
  const material = new THREE.PointsMaterial({
    color: 0xd4a44c,
    size: 0.12,
    transparent: true,
    opacity: 0,
  });
  const points = new THREE.Points(geometry, material);
  points.visible = false;
  scene.add(points);
  return {
    points,
    positions,
    velocities: new Float32Array(MAX_BURST_PARTICLES * 3),
    particleCount: 0,
    age: 0,
    lifetime: 0.6,
    active: false,
  };
}

function ensureBurstPool(scene: THREE.Scene) {
  while (burstPool.length < BURST_POOL_SIZE) burstPool.push(createBurst(scene));
}

function claimBurst(): Burst {
  for (const burst of burstPool) {
    if (!burst.active) return burst;
  }
  let oldest = burstPool[0];
  for (let index = 1; index < burstPool.length; index++) {
    if (burstPool[index].age > oldest.age) oldest = burstPool[index];
  }
  return oldest;
}

export function spawnEatBurst(scene: THREE.Scene, position: THREE.Vector3) {
  if (reducedMotion) return;
  ensureBurstPool(scene);
  const burst = claimBurst();
  const particleCount = Math.max(4, Math.round(MAX_BURST_PARTICLES * particleDensity));

  for (let i = 0; i < particleCount; i++) {
    const offset = i * 3;
    burst.positions[offset] = position.x;
    burst.positions[offset + 1] = position.y + 0.3;
    burst.positions[offset + 2] = position.z;

    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 1.5;
    burst.velocities[offset] = Math.cos(angle) * speed;
    burst.velocities[offset + 1] = 2 + Math.random() * 2;
    burst.velocities[offset + 2] = Math.sin(angle) * speed;
  }

  burst.particleCount = particleCount;
  burst.age = 0;
  burst.lifetime = 0.6;
  burst.active = true;
  burst.points.visible = true;
  burst.points.geometry.setDrawRange(0, particleCount);
  (burst.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  (burst.points.material as THREE.PointsMaterial).opacity = 1;
}

export function updateBursts(delta: number) {
  for (const burst of burstPool) {
    if (!burst.active) continue;
    burst.age += delta;

    const positions = burst.points.geometry.attributes.position as THREE.BufferAttribute;
    for (let particle = 0; particle < burst.particleCount; particle++) {
      const offset = particle * 3;
      burst.velocities[offset + 1] -= 4 * delta;
      burst.positions[offset] += burst.velocities[offset] * delta;
      burst.positions[offset + 1] += burst.velocities[offset + 1] * delta;
      burst.positions[offset + 2] += burst.velocities[offset + 2] * delta;
    }
    positions.needsUpdate = true;

    const material = burst.points.material as THREE.PointsMaterial;
    material.opacity = Math.max(0, 1 - burst.age / burst.lifetime);

    if (burst.age >= burst.lifetime) {
      burst.active = false;
      burst.points.visible = false;
    }
  }
}

export function disposeBursts(scene: THREE.Scene) {
  shakeMagnitude = 0;
  shakeOffset.set(0, 0, 0);
  for (const burst of burstPool) {
    scene.remove(burst.points);
    burst.points.geometry.dispose();
    (burst.points.material as THREE.Material).dispose();
  }
  burstPool.length = 0;
}
