import * as THREE from 'three';

export class DayNightCycle {
  private sun: THREE.DirectionalLight;
  private ambient: THREE.AmbientLight;
  private scene: THREE.Scene;
  private time: number = 0.3; // 0 = midnight, 0.5 = noon, 1 = midnight again
  private readonly CYCLE_DURATION = 120; // full day length in seconds — tune to taste

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -50;
    this.sun.shadow.camera.right = 50;
    this.sun.shadow.camera.top = 50;
    this.sun.shadow.camera.bottom = -50;
    scene.add(this.sun);

    this.applyTimeOfDay(); // set initial state immediately
  }

  update(delta: number) {
    this.time += delta / this.CYCLE_DURATION;
    if (this.time >= 1) this.time -= 1;

    this.applyTimeOfDay();
  }

  private applyTimeOfDay() {
    // Sun angle: full circle over the day, peaking overhead at time = 0.5
    const angle = this.time * Math.PI * 2;
    const sunHeight = Math.sin(angle);
    const sunDistance = 80;

    this.sun.position.set(
      Math.cos(angle) * sunDistance,
      Math.max(sunHeight, 0.05) * sunDistance, // never let it go fully below the horizon visually
      30
    );

    // Brightness: full during day, dim at night
    const brightness = Math.max(sunHeight, 0.1);
    this.sun.intensity = brightness * 1.1;
    this.ambient.intensity = 0.2 + brightness * 0.4;

    // Sky color: blue at day, deep navy at night, orange tint at sunrise/sunset
    const dayColor = new THREE.Color(0x87ceeb);
    const nightColor = new THREE.Color(0x0a0e2a);
    const sunsetColor = new THREE.Color(0xff8c42);

    let skyColor: THREE.Color;
    if (sunHeight > 0.3) {
      skyColor = dayColor;
    } else if (sunHeight > -0.1) {
      // Blend toward sunset color near the horizon
      const t = (sunHeight - -0.1) / (0.3 - -0.1);
      skyColor = nightColor.clone().lerp(sunsetColor, Math.min(t, 1));
      if (sunHeight > 0.1) {
        skyColor = sunsetColor.clone().lerp(dayColor, (sunHeight - 0.1) / 0.2);
      }
    } else {
      skyColor = nightColor;
    }

    this.scene.background = skyColor;
  }
}