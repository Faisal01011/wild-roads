import * as THREE from 'three';

export function createGround() {
  const geometry = new THREE.PlaneGeometry(200, 200);
  const material = new THREE.MeshStandardMaterial({ color: 0x4caf50 }); // grass green
  const ground = new THREE.Mesh(geometry, material);

  ground.rotation.x = -Math.PI / 2; // lay it flat
  ground.receiveShadow = true;

  return ground;
}