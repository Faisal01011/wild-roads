import * as THREE from 'three';
import { getTerrainHeight } from '../world/chunk';
import type { WildlifeSpecies } from './wildlifeTypes';
import type { QualityProfile } from '../utils/quality';

interface FootprintParticle {
  mesh: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  age: number;
  lifetime: number;
  active: boolean;
}

interface DustParticle {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  velocity: THREE.Vector3;
  age: number;
  lifetime: number;
  startScale: number;
  active: boolean;
}

interface TrailState {
  distance: number;
  side: number;
  lastPosition: THREE.Vector3;
  initialized: boolean;
}

const FOOTPRINT_POOL_SIZE = 64;
const DUST_POOL_SIZE = 42;

function createSoftParticleTexture(): THREE.DataTexture {
  const size = 32;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const normalizedX = (x + 0.5) / size * 2 - 1;
      const normalizedY = (y + 0.5) / size * 2 - 1;
      const distance = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
      const alpha = THREE.MathUtils.smoothstep(1 - distance, 0, 0.82);
      const index = (y * size + x) * 4;
      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = Math.round(alpha * 210);
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export class WildlifeEffects {
  private readonly scene: THREE.Scene;
  private readonly footprintGeometry = new THREE.CircleGeometry(0.5, 12);
  private readonly dustTexture = createSoftParticleTexture();
  private readonly footprints: FootprintParticle[] = [];
  private readonly dust: DustParticle[] = [];
  private readonly trails = new Map<number, TrailState>();
  private footprintCursor = 0;
  private dustCursor = 0;
  private reducedMotion: boolean;
  private particleDensity = 1;

  constructor(scene: THREE.Scene, reducedMotion: boolean) {
    this.scene = scene;
    this.reducedMotion = reducedMotion;
    this.footprintGeometry.rotateX(-Math.PI / 2);

    for (let i = 0; i < FOOTPRINT_POOL_SIZE; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x2b2119,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      });
      const mesh = new THREE.Mesh(this.footprintGeometry, material);
      mesh.visible = false;
      mesh.renderOrder = 1;
      this.footprints.push({ mesh, age: 0, lifetime: 0, active: false });
      this.scene.add(mesh);
    }

    for (let i = 0; i < DUST_POOL_SIZE; i++) {
      const material = new THREE.SpriteMaterial({
        color: 0xbfa57b,
        map: this.dustTexture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      this.dust.push({
        sprite,
        material,
        velocity: new THREE.Vector3(),
        age: 0,
        lifetime: 0,
        startScale: 0,
        active: false,
      });
      this.scene.add(sprite);
    }
  }

  setReducedMotion(reduced: boolean) {
    this.reducedMotion = reduced;
    if (!reduced) return;

    for (const particle of this.dust) {
      particle.active = false;
      particle.sprite.visible = false;
    }
  }

  setQuality(profile: QualityProfile) {
    this.particleDensity = profile.particleDensity;
  }

  updateAnimal(
    id: number,
    position: THREE.Vector3,
    rotationY: number,
    speed: number,
    species: WildlifeSpecies,
    delta: number
  ) {
    let trail = this.trails.get(id);
    if (!trail) {
      trail = {
        distance: 0,
        side: id % 2 === 0 ? -1 : 1,
        lastPosition: position.clone(),
        initialized: false,
      };
      this.trails.set(id, trail);
    }

    if (!trail.initialized) {
      trail.lastPosition.copy(position);
      trail.initialized = true;
      return;
    }

    const moved = trail.lastPosition.distanceTo(position);
    trail.lastPosition.copy(position);
    if (speed < 0.45 || moved > 3) {
      trail.distance = 0;
      return;
    }

    trail.distance += moved;
    const stride = species === 'wolf' ? 0.72 : 0.88;

    if (trail.distance >= stride) {
      trail.distance %= stride;
      if (Math.random() <= Math.max(0.45, this.particleDensity)) {
        this.emitFootprint(position, rotationY, species, trail.side);
      }
      trail.side *= -1;
    }

    if (
      !this.reducedMotion
      && speed > 3.2
      && Math.random() < delta * Math.min(9, speed * 1.2) * this.particleDensity
    ) {
      this.emitDust(position, rotationY, species, speed);
    }
  }

  forgetAnimal(id: number) {
    this.trails.delete(id);
  }

  burst(position: THREE.Vector3, accent: number, intensity = 1) {
    if (this.reducedMotion) return;
    const count = Math.max(2, Math.round((5 + intensity * 4) * this.particleDensity));
    for (let i = 0; i < count; i++) {
      const particle = this.claimDust();
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 0.45;
      const terrainHeight = getTerrainHeight(position.x, position.z);
      particle.material.color.setHex(i % 3 === 0 ? accent : 0xc3aa83);
      particle.material.opacity = 0.72;
      particle.sprite.position.set(
        position.x + Math.cos(angle) * radius,
        Math.max(terrainHeight + 0.24, position.y + 0.15),
        position.z + Math.sin(angle) * radius
      );
      particle.velocity.set(
        Math.cos(angle) * (0.35 + Math.random() * 0.7),
        0.45 + Math.random() * 0.65,
        Math.sin(angle) * (0.35 + Math.random() * 0.7)
      );
      particle.startScale = 0.3 + Math.random() * 0.25;
      particle.sprite.scale.setScalar(particle.startScale);
      particle.age = 0;
      particle.lifetime = 0.5 + Math.random() * 0.25;
      particle.active = true;
      particle.sprite.visible = true;
    }
  }

  update(delta: number) {
    for (const footprint of this.footprints) {
      if (!footprint.active) continue;
      footprint.age += delta;
      const progress = footprint.age / footprint.lifetime;
      footprint.mesh.material.opacity = 0.28 * (1 - THREE.MathUtils.smoothstep(progress, 0.45, 1));

      if (progress >= 1) {
        footprint.active = false;
        footprint.mesh.visible = false;
      }
    }

    for (const particle of this.dust) {
      if (!particle.active) continue;
      particle.age += delta;
      const progress = particle.age / particle.lifetime;
      particle.sprite.position.addScaledVector(particle.velocity, delta);
      particle.velocity.y -= delta * 0.42;
      const scale = particle.startScale * (1 + progress * 1.7);
      particle.sprite.scale.setScalar(scale);
      particle.material.opacity = 0.55 * (1 - progress) * (1 - progress);

      if (progress >= 1) {
        particle.active = false;
        particle.sprite.visible = false;
      }
    }
  }

  private emitFootprint(
    position: THREE.Vector3,
    rotationY: number,
    species: WildlifeSpecies,
    side: number
  ) {
    const particle = this.footprints[this.footprintCursor];
    this.footprintCursor = (this.footprintCursor + 1) % this.footprints.length;
    const lateral = species === 'wolf' ? 0.2 : 0.27;
    const sideX = Math.cos(rotationY) * lateral * side;
    const sideZ = -Math.sin(rotationY) * lateral * side;
    const terrainHeight = getTerrainHeight(position.x + sideX, position.z + sideZ);

    particle.mesh.position.set(position.x + sideX, terrainHeight + 0.035, position.z + sideZ);
    particle.mesh.rotation.y = -rotationY + (side > 0 ? 0.08 : -0.08);
    const width = species === 'wolf' ? 0.2 : 0.17;
    const length = species === 'wolf' ? 0.38 : 0.42;
    particle.mesh.scale.set(width, 1, length);
    particle.mesh.material.color.setHex(species === 'wolf' ? 0x211d1a : 0x39291d);
    particle.mesh.material.opacity = 0.28;
    particle.mesh.visible = true;
    particle.age = 0;
    particle.lifetime = 3.2;
    particle.active = true;
  }

  private emitDust(
    position: THREE.Vector3,
    rotationY: number,
    species: WildlifeSpecies,
    speed: number
  ) {
    const particle = this.claimDust();
    const terrainHeight = getTerrainHeight(position.x, position.z);
    const backwardX = -Math.sin(rotationY);
    const backwardZ = -Math.cos(rotationY);
    const scatter = (Math.random() - 0.5) * 0.55;

    particle.material.color.setHex(species === 'wolf' ? 0xa89374 : 0xc1aa82);
    particle.material.opacity = 0.45;
    particle.sprite.position.set(
      position.x + backwardX * 0.35 + Math.cos(rotationY) * scatter,
      terrainHeight + 0.23,
      position.z + backwardZ * 0.35 - Math.sin(rotationY) * scatter
    );
    particle.velocity.set(backwardX * 0.25, 0.25, backwardZ * 0.25);
    particle.startScale = THREE.MathUtils.clamp(speed * 0.055, 0.24, 0.44);
    particle.sprite.scale.setScalar(particle.startScale);
    particle.age = 0;
    particle.lifetime = 0.55 + Math.random() * 0.25;
    particle.active = true;
    particle.sprite.visible = true;
  }

  private claimDust(): DustParticle {
    const particle = this.dust[this.dustCursor];
    this.dustCursor = (this.dustCursor + 1) % this.dust.length;
    return particle;
  }

  dispose() {
    this.trails.clear();

    for (const footprint of this.footprints) {
      this.scene.remove(footprint.mesh);
      footprint.mesh.material.dispose();
    }
    for (const particle of this.dust) {
      this.scene.remove(particle.sprite);
      particle.material.dispose();
    }

    this.footprintGeometry.dispose();
    this.dustTexture.dispose();
  }
}
