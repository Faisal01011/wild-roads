import * as THREE from 'three';

function createGlowTexture(color: string): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.4, color);
  gradient.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  return new THREE.CanvasTexture(canvas);
}

function createCloudTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Several overlapping soft blobs to form an irregular cloud puff shape
  const blobs = [
    { x: 40, y: 70, r: 30 },
    { x: 70, y: 60, r: 34 },
    { x: 95, y: 70, r: 26 },
    { x: 60, y: 50, r: 28 },
  ];

  for (const blob of blobs) {
    const gradient = ctx.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, blob.r);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(blob.x, blob.y, blob.r, 0, Math.PI * 2);
    ctx.fill();
  }

  return new THREE.CanvasTexture(canvas);
}

const sunTexture = createGlowTexture('rgba(255,244,214,1)');
const moonTexture = createGlowTexture('rgba(214,224,255,1)');
const cloudTexture = createCloudTexture();

export class SkyObjects {
  private sun: THREE.Sprite;
  private moon: THREE.Sprite;
  private clouds: THREE.Sprite[] = [];
  private cloudSpeeds: number[] = [];

  constructor(scene: THREE.Scene) {
    const sunMaterial = new THREE.SpriteMaterial({
      map: sunTexture,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.sun = new THREE.Sprite(sunMaterial);
    this.sun.scale.set(18, 18, 1);
    scene.add(this.sun);

    const moonMaterial = new THREE.SpriteMaterial({
      map: moonTexture,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.moon = new THREE.Sprite(moonMaterial);
    this.moon.scale.set(12, 12, 1);
    scene.add(this.moon);

    const CLOUD_COUNT = 14;
for (let i = 0; i < CLOUD_COUNT; i++) {
  const material = new THREE.SpriteMaterial({
    map: cloudTexture,
    transparent: true,
    depthWrite: false,
    opacity: 0.75,
    fog: false,
  });
  const cloud = new THREE.Sprite(material);
  const scale = 25 + Math.random() * 30;
  cloud.scale.set(scale, scale * 0.5, 1);

  const angle = Math.random() * Math.PI * 2;
  const distance = 90 + Math.random() * 80;
  cloud.position.set(
    Math.cos(angle) * distance,
    15 + Math.random() * 10,
    Math.sin(angle) * distance
  );
  scene.add(cloud);
  this.clouds.push(cloud);
  this.cloudSpeeds.push(0.5 + Math.random() * 1);
}
  }

  update(delta: number, sunAngle: number, sunHeight: number, playerPosition: THREE.Vector3) {
    const distance = 250;

    // Sun and moon track the same angle as the directional light, opposite each other
    this.sun.position.set(
      playerPosition.x + Math.cos(sunAngle) * distance,
      sunHeight * distance,
      playerPosition.z + 30
    );

    const moonAngle = sunAngle + Math.PI;
    const moonHeight = -sunHeight;
    this.moon.position.set(
      playerPosition.x + Math.cos(moonAngle) * distance,
      moonHeight * distance,
      playerPosition.z + 30
    );

    // Fade whichever body is below the horizon
    (this.sun.material as THREE.SpriteMaterial).opacity = THREE.MathUtils.clamp(sunHeight * 3, 0, 1);
    (this.moon.material as THREE.SpriteMaterial).opacity = THREE.MathUtils.clamp(moonHeight * 3, 0, 1);

    // Drift clouds slowly, recycle when far from the player
    for (let i = 0; i < this.clouds.length; i++) {
  const cloud = this.clouds[i];
  cloud.position.x += this.cloudSpeeds[i] * delta;

  const dx = cloud.position.x - playerPosition.x;
  const dz = cloud.position.z - playerPosition.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist > 200 || dist < 60) {
    const angle = Math.random() * Math.PI * 2;
    const spawnDistance = 90 + Math.random() * 80;
    cloud.position.set(
      playerPosition.x + Math.cos(angle) * spawnDistance,
      15 + Math.random() * 10,
      playerPosition.z + Math.sin(angle) * spawnDistance
    );
  }
}
  }
}