import * as THREE from 'three';

export function createLighting(scene: THREE.Scene) {
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(50, 80, 30);
  sun.castShadow = true;

  // Reasonable shadow bounds so it doesn't look blocky
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -50;
  sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;

  scene.add(sun);
}