import * as THREE from 'three';

const DAY_COLOR = new THREE.Color(0x87ceeb);
const NIGHT_COLOR = new THREE.Color(0x0a0e2a);
const SUNSET_COLOR = new THREE.Color(0xff8c42);
const skyColorResult = new THREE.Color(); // reused every frame instead of allocated

export class DayNightCycle {
  private sun: THREE.DirectionalLight;
  private ambient: THREE.AmbientLight;
  private scene: THREE.Scene;
  private time: number = 0.3;
  private readonly CYCLE_DURATION = 120;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -50;
    this.sun.shadow.camera.right = 50;
    this.sun.shadow.camera.top = 50;
    this.sun.shadow.camera.bottom = -50;
    scene.add(this.sun);

    this.applyTimeOfDay();
  }

  get sunAngle(): number {
    return this.time * Math.PI * 2;
  }

  get sunHeightFactor(): number {
    return Math.sin(this.time * Math.PI * 2);
  }

  update(delta: number) {
    this.time += delta / this.CYCLE_DURATION;
    if (this.time >= 1) this.time -= 1;

    this.applyTimeOfDay();
  }

  private applyTimeOfDay() {
    const angle = this.time * Math.PI * 2;
    const sunHeight = Math.sin(angle);
    const sunDistance = 80;

    this.sun.position.set(
      Math.cos(angle) * sunDistance,
      Math.max(sunHeight, 0.05) * sunDistance,
      30
    );

    const brightness = Math.max(sunHeight, 0.1);
    this.sun.intensity = brightness * 1.1;
    this.ambient.intensity = 0.2 + brightness * 0.4;

    if (sunHeight > 0.3) {
      skyColorResult.copy(DAY_COLOR);
    } else if (sunHeight > -0.1) {
      const t = (sunHeight - -0.1) / (0.3 - -0.1);
      skyColorResult.copy(NIGHT_COLOR).lerp(SUNSET_COLOR, Math.min(t, 1));
      if (sunHeight > 0.1) {
        skyColorResult.copy(SUNSET_COLOR).lerp(DAY_COLOR, (sunHeight - 0.1) / 0.2);
      }
    } else {
      skyColorResult.copy(NIGHT_COLOR);
    }

    if (!this.scene.background || !(this.scene.background as THREE.Color).equals) {
      this.scene.background = new THREE.Color();
    }
    (this.scene.background as THREE.Color).copy(skyColorResult);

    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(skyColorResult);
    }
  }
}