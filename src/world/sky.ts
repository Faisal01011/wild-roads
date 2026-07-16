import * as THREE from 'three';

function configureSpriteTexture(texture: THREE.Texture): THREE.Texture {
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// Manually computes a radial falloff into ImageData instead of using
// ctx.createRadialGradient — some mobile browsers (notably Chrome on
// Android) apply automatic dithering to canvas gradients to prevent
// banding, which introduces per-pixel color noise. That noise is invisible
// at native texture size but becomes visible speckling once the texture is
// stretched across large sprites. Writing pixels directly avoids the
// dithering pass entirely.
function createGlowTexture(r: number, g: number, b: number): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(size, size);
  const center = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy) / center; // 0 at center, 1 at edge
      const alpha = dist < 0.4 ? 1 : Math.max(0, 1 - (dist - 0.4) / 0.6);

      const i = (y * size + x) * 4;
      imageData.data[i] = r;
      imageData.data[i + 1] = g;
      imageData.data[i + 2] = b;
      imageData.data[i + 3] = Math.round(alpha * 255);
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return configureSpriteTexture(new THREE.CanvasTexture(canvas));
}

function createCloudTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(size, size);

  const blobs = [
    { x: 40, y: 70, r: 30 },
    { x: 70, y: 60, r: 34 },
    { x: 95, y: 70, r: 26 },
    { x: 60, y: 50, r: 28 },
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let maxAlpha = 0;

      for (const blob of blobs) {
        const dx = x - blob.x;
        const dy = y - blob.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const t = dist / blob.r;
        const alpha = t < 1 ? (1 - t) * 0.9 : 0;
        maxAlpha = Math.max(maxAlpha, alpha);
      }

      const i = (y * size + x) * 4;
      imageData.data[i] = 255;
      imageData.data[i + 1] = 255;
      imageData.data[i + 2] = 255;
      imageData.data[i + 3] = Math.round(Math.min(1, maxAlpha) * 255);
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return configureSpriteTexture(new THREE.CanvasTexture(canvas));
}

const sunTexture = createGlowTexture(255, 244, 214);
const moonTexture = createGlowTexture(214, 224, 255);
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

    (this.sun.material as THREE.SpriteMaterial).opacity = THREE.MathUtils.clamp(sunHeight * 3, 0, 1);
    (this.moon.material as THREE.SpriteMaterial).opacity = THREE.MathUtils.clamp(moonHeight * 3, 0, 1);

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