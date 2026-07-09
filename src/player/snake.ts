import * as THREE from 'three';

export function createSnake() {
  // Stand-in shape until we have a real model — a stretched capsule
  const geometry = new THREE.CapsuleGeometry(0.5, 2, 4, 8);
  const material = new THREE.MeshStandardMaterial({ color: 0x2e7d32 });
  const snake = new THREE.Mesh(geometry, material);

  snake.rotation.z = Math.PI / 2; // lay it horizontal
  snake.position.y = 0.5;
  snake.castShadow = true;

  return snake;
}