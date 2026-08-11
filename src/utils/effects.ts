import * as THREE from 'three';

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
  velocities: THREE.Vector3[];
  age: number;
  lifetime: number;
}

const activeBursts: Burst[] = [];

export function spawnEatBurst(scene: THREE.Scene, position: THREE.Vector3) {
  if (reducedMotion) return;
  const particleCount = 10;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const velocities: THREE.Vector3[] = [];

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = position.x;
    positions[i * 3 + 1] = position.y + 0.3;
    positions[i * 3 + 2] = position.z;

    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 1.5;
    velocities.push(
      new THREE.Vector3(Math.cos(angle) * speed, 2 + Math.random() * 2, Math.sin(angle) * speed)
    );
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xd4a44c,
    size: 0.12,
    transparent: true,
    opacity: 1,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  activeBursts.push({ points, velocities, age: 0, lifetime: 0.6 });
}

export function updateBursts(scene: THREE.Scene, delta: number) {
  for (let i = activeBursts.length - 1; i >= 0; i--) {
    const burst = activeBursts[i];
    burst.age += delta;

    const positions = burst.points.geometry.attributes.position as THREE.BufferAttribute;
    for (let p = 0; p < burst.velocities.length; p++) {
      const v = burst.velocities[p];
      v.y -= 4 * delta; // gravity
      positions.setXYZ(
        p,
        positions.getX(p) + v.x * delta,
        positions.getY(p) + v.y * delta,
        positions.getZ(p) + v.z * delta
      );
    }
    positions.needsUpdate = true;

    const material = burst.points.material as THREE.PointsMaterial;
    material.opacity = Math.max(0, 1 - burst.age / burst.lifetime);

    if (burst.age >= burst.lifetime) {
      scene.remove(burst.points);
      burst.points.geometry.dispose();
      material.dispose();
      activeBursts.splice(i, 1);
    }
  }
}

export function disposeBursts(scene: THREE.Scene) {
  shakeMagnitude = 0;
  shakeOffset.set(0, 0, 0);
  for (const burst of activeBursts) {
    scene.remove(burst.points);
    burst.points.geometry.dispose();
    (burst.points.material as THREE.Material).dispose();
  }
  activeBursts.length = 0;
}
