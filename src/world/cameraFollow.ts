import * as THREE from 'three';
import { Snake } from '../player/snake';

const OFFSET = new THREE.Vector3(0, 4, -8);
const LERP_SPEED = 4;

export function updateCameraFollow(
  camera: THREE.PerspectiveCamera,
  snake: Snake,
  delta: number
) {
  const rotatedOffset = OFFSET.clone().applyAxisAngle(
    new THREE.Vector3(0, 1, 0),
    snake.head.rotation.y
  );

  const desiredPosition = snake.head.position.clone().add(rotatedOffset);

  camera.position.lerp(desiredPosition, 1 - Math.pow(0.001, delta) * LERP_SPEED * 0.1);
  camera.lookAt(
    snake.head.position.x,
    snake.head.position.y + 1,
    snake.head.position.z
  );
}