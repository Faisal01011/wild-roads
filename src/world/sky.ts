import * as THREE from 'three';
import type { AtmosphereFrame } from './lighting';
import type { QualityProfile } from '../utils/quality';

const SKY_RADIUS = 420;
const CELESTIAL_DISTANCE = 360;
const CLOUD_COUNT = 12;
const STAR_COUNT = 620;

function configureSpriteTexture(texture: THREE.Texture): THREE.Texture {
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createRadialTexture(coreRadius: number, featherPower: number): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  const imageData = context.createImageData(size, size);
  const center = (size - 1) / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x - center, y - center) / center;
      const edge = Math.max(0, 1 - Math.max(0, distance - coreRadius) / (1 - coreRadius));
      const alpha = distance <= coreRadius ? 1 : Math.pow(edge, featherPower);
      const offset = (y * size + x) * 4;
      imageData.data[offset] = 255;
      imageData.data[offset + 1] = 255;
      imageData.data[offset + 2] = 255;
      imageData.data[offset + 3] = Math.round(alpha * 255);
    }
  }

  context.putImageData(imageData, 0, 0);
  return configureSpriteTexture(new THREE.CanvasTexture(canvas));
}

function createCloudTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  const imageData = context.createImageData(size, size);
  const blobs = [
    { x: 30, y: 73, radius: 24 },
    { x: 52, y: 62, radius: 31 },
    { x: 76, y: 58, radius: 36 },
    { x: 101, y: 72, radius: 25 },
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let density = 0;

      for (const blob of blobs) {
        const distance = Math.hypot(x - blob.x, y - blob.y) / blob.radius;
        density = Math.max(density, distance < 1 ? Math.pow(1 - distance, 0.72) : 0);
      }

      const offset = (y * size + x) * 4;
      imageData.data[offset] = 255;
      imageData.data[offset + 1] = 255;
      imageData.data[offset + 2] = 255;
      imageData.data[offset + 3] = Math.round(Math.min(1, density) * 210);
    }
  }

  context.putImageData(imageData, 0, 0);
  return configureSpriteTexture(new THREE.CanvasTexture(canvas));
}

const celestialCoreTexture = createRadialTexture(0.82, 3.5);
const celestialGlowTexture = createRadialTexture(0.08, 2.4);
const cloudTexture = createCloudTexture();

function seededRandomFactory(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function createStars(): THREE.Points {
  const random = seededRandomFactory(0x57494c44);
  const positions = new Float32Array(STAR_COUNT * 3);

  for (let index = 0; index < STAR_COUNT; index++) {
    const height = 0.06 + Math.pow(random(), 0.72) * 0.94;
    const angle = random() * Math.PI * 2;
    const horizontalRadius = Math.sqrt(Math.max(0, 1 - height * height));
    const radius = SKY_RADIUS * 0.92;
    const offset = index * 3;

    positions[offset] = Math.cos(angle) * horizontalRadius * radius;
    positions[offset + 1] = height * radius;
    positions[offset + 2] = Math.sin(angle) * horizontalRadius * radius;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xdce8ff,
    size: 1.15,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  const stars = new THREE.Points(geometry, material);
  stars.frustumCulled = false;
  stars.renderOrder = -980;
  return stars;
}

function createCelestialSprite(
  texture: THREE.Texture,
  blending: THREE.Blending = THREE.NormalBlending
): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: texture,
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
    blending,
    toneMapped: false,
  });
  return new THREE.Sprite(material);
}

const vertexShader = /* glsl */ `
  varying vec3 vWorldDirection;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldDirection = normalize(worldPosition.xyz - cameraPosition);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform vec3 uZenithColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uGroundColor;
  uniform vec3 uFogColor;
  uniform vec3 uSunColor;
  uniform vec3 uSunDirection;
  uniform float uHazeStrength;

  varying vec3 vWorldDirection;

  void main() {
    vec3 direction = normalize(vWorldDirection);
    float height = clamp(direction.y, -1.0, 1.0);

    float skyGradient = pow(clamp(height, 0.0, 1.0), 0.52);
    vec3 upperSky = mix(uHorizonColor, uZenithColor, skyGradient);

    float lowerGradient = smoothstep(-0.34, 0.025, height);
    vec3 lowerSky = mix(uGroundColor, uHorizonColor, lowerGradient);
    vec3 color = mix(lowerSky, upperSky, step(0.0, height));

    float horizonHaze = exp(-abs(height) * 9.0) * uHazeStrength;
    color = mix(color, uFogColor, clamp(horizonHaze, 0.0, 0.72));

    float sunAlignment = max(dot(direction, normalize(uSunDirection)), 0.0);
    float broadSunHaze = pow(sunAlignment, 10.0) * 0.1;
    float closeSunHaze = pow(sunAlignment, 72.0) * 0.2;
    color += uSunColor * (broadSunHaze + closeSunHaze);

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface CloudRecord {
  sprite: THREE.Sprite;
  speed: number;
  baseOpacity: number;
}

export class SkyObjects {
  private readonly scene: THREE.Scene;
  private readonly dome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly stars: THREE.Points;
  private readonly sunCore: THREE.Sprite;
  private readonly sunGlow: THREE.Sprite;
  private readonly moonCore: THREE.Sprite;
  private readonly moonGlow: THREE.Sprite;
  private readonly clouds: CloudRecord[] = [];
  private activeCloudCount = CLOUD_COUNT;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const domeMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: true,
      uniforms: {
        uZenithColor: { value: new THREE.Color(0x4384b2) },
        uHorizonColor: { value: new THREE.Color(0xc4d9df) },
        uGroundColor: { value: new THREE.Color(0x4a6a4d) },
        uFogColor: { value: new THREE.Color(0xb0c7bd) },
        uSunColor: { value: new THREE.Color(0xfff2d2) },
        uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
        uHazeStrength: { value: 0.25 },
      },
    });

    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(SKY_RADIUS, 32, 20),
      domeMaterial
    );
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1000;
    scene.add(this.dome);

    this.stars = createStars();
    scene.add(this.stars);

    this.sunGlow = createCelestialSprite(celestialGlowTexture, THREE.AdditiveBlending);
    this.sunGlow.scale.set(32, 32, 1);
    this.sunGlow.renderOrder = -960;
    scene.add(this.sunGlow);

    this.sunCore = createCelestialSprite(celestialCoreTexture);
    this.sunCore.scale.set(7, 7, 1);
    this.sunCore.renderOrder = -950;
    scene.add(this.sunCore);

    this.moonGlow = createCelestialSprite(celestialGlowTexture, THREE.AdditiveBlending);
    this.moonGlow.scale.set(17, 17, 1);
    this.moonGlow.renderOrder = -960;
    scene.add(this.moonGlow);

    this.moonCore = createCelestialSprite(celestialCoreTexture);
    this.moonCore.scale.set(5.2, 5.2, 1);
    this.moonCore.renderOrder = -950;
    scene.add(this.moonCore);

    const random = seededRandomFactory(0x524f4144);
    for (let index = 0; index < CLOUD_COUNT; index++) {
      const material = new THREE.SpriteMaterial({
        map: cloudTexture,
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        opacity: 0.4,
        fog: false,
        toneMapped: true,
      });
      const cloud = new THREE.Sprite(material);
      const scale = 28 + random() * 34;
      cloud.scale.set(scale, scale * (0.34 + random() * 0.12), 1);

      const angle = random() * Math.PI * 2;
      const distance = 95 + random() * 85;
      cloud.position.set(
        Math.cos(angle) * distance,
        28 + random() * 20,
        Math.sin(angle) * distance
      );
      cloud.renderOrder = -900;
      scene.add(cloud);
      this.clouds.push({
        sprite: cloud,
        speed: 0.35 + random() * 0.5,
        baseOpacity: 0.7 + random() * 0.3,
      });
    }
  }

  update(
    delta: number,
    atmosphere: AtmosphereFrame,
    playerPosition: THREE.Vector3
  ) {
    this.dome.position.copy(playerPosition);
    this.stars.position.copy(playerPosition);

    const uniforms = this.dome.material.uniforms;
    (uniforms.uZenithColor.value as THREE.Color).copy(atmosphere.zenithColor);
    (uniforms.uHorizonColor.value as THREE.Color).copy(atmosphere.horizonColor);
    (uniforms.uGroundColor.value as THREE.Color).copy(atmosphere.groundColor);
    (uniforms.uFogColor.value as THREE.Color).copy(atmosphere.fogColor);
    (uniforms.uSunColor.value as THREE.Color).copy(atmosphere.sunColor);
    (uniforms.uSunDirection.value as THREE.Vector3).copy(atmosphere.sunDirection);
    uniforms.uHazeStrength.value = atmosphere.hazeStrength;

    const starMaterial = this.stars.material as THREE.PointsMaterial;
    starMaterial.opacity = atmosphere.starOpacity;
    this.stars.rotation.y += delta * 0.003;

    const sunPosition = this.sunCore.position
      .copy(playerPosition)
      .addScaledVector(atmosphere.sunDirection, CELESTIAL_DISTANCE);
    this.sunGlow.position.copy(sunPosition);

    const moonPosition = this.moonCore.position
      .copy(playerPosition)
      .addScaledVector(atmosphere.moonDirection, CELESTIAL_DISTANCE);
    this.moonGlow.position.copy(moonPosition);

    const sunCoreMaterial = this.sunCore.material as THREE.SpriteMaterial;
    const sunGlowMaterial = this.sunGlow.material as THREE.SpriteMaterial;
    sunCoreMaterial.color.copy(atmosphere.sunColor);
    sunGlowMaterial.color.copy(atmosphere.sunColor);
    sunCoreMaterial.opacity = atmosphere.sunVisibility;
    sunGlowMaterial.opacity = atmosphere.sunVisibility * (0.38 + atmosphere.hazeStrength * 0.42);

    const moonCoreMaterial = this.moonCore.material as THREE.SpriteMaterial;
    const moonGlowMaterial = this.moonGlow.material as THREE.SpriteMaterial;
    moonCoreMaterial.color.set(0xdce7f4);
    moonGlowMaterial.color.set(0x9bb8df);
    moonCoreMaterial.opacity = atmosphere.moonVisibility * 0.92;
    moonGlowMaterial.opacity = atmosphere.moonVisibility * 0.32;

    for (let index = 0; index < this.activeCloudCount; index++) {
      const cloud = this.clouds[index];
      cloud.sprite.position.x += cloud.speed * delta;

      const offsetX = cloud.sprite.position.x - playerPosition.x;
      const offsetZ = cloud.sprite.position.z - playerPosition.z;
      const distance = Math.hypot(offsetX, offsetZ);

      if (distance > 205 || distance < 70) {
        const angle = Math.atan2(offsetZ, offsetX) + Math.PI * 0.8;
        const spawnDistance = 130 + (cloud.baseOpacity - 0.7) * 150;
        cloud.sprite.position.set(
          playerPosition.x + Math.cos(angle) * spawnDistance,
          28 + cloud.baseOpacity * 18,
          playerPosition.z + Math.sin(angle) * spawnDistance
        );
      }

      const material = cloud.sprite.material as THREE.SpriteMaterial;
      material.color.copy(atmosphere.cloudColor);
      material.opacity = atmosphere.cloudOpacity * cloud.baseOpacity;
    }
  }

  setQuality(profile: QualityProfile) {
    this.activeCloudCount = Math.max(3, Math.round(CLOUD_COUNT * profile.skyDensity));
    this.clouds.forEach((cloud, index) => {
      cloud.sprite.visible = index < this.activeCloudCount;
    });
    this.stars.geometry.setDrawRange(0, Math.max(140, Math.round(STAR_COUNT * profile.skyDensity)));
  }

  dispose() {
    this.scene.remove(
      this.dome,
      this.stars,
      this.sunCore,
      this.sunGlow,
      this.moonCore,
      this.moonGlow
    );
    this.dome.geometry.dispose();
    this.dome.material.dispose();
    this.stars.geometry.dispose();
    (this.stars.material as THREE.Material).dispose();
    (this.sunCore.material as THREE.Material).dispose();
    (this.sunGlow.material as THREE.Material).dispose();
    (this.moonCore.material as THREE.Material).dispose();
    (this.moonGlow.material as THREE.Material).dispose();

    for (const cloud of this.clouds) {
      this.scene.remove(cloud.sprite);
      (cloud.sprite.material as THREE.Material).dispose();
    }
    this.clouds.length = 0;
  }
}
