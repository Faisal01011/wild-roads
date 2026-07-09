import * as THREE from 'three';
import { Snake } from '../player/snake';

const OFFSET = new THREE.Vector3(0, 4, -8); // behind and above
const LERP_SPEED = 4;

export function updateCameraFollow(
  camera: THREE.PerspectiveCamera,
  snake: Snake,
  delta: number
) {
  // Rotate the offset by the snake's heading so the camera stays behind it
  const rotatedOffset = OFFSET.clone().applyAxisAngle(
    new THREE.Vector3(0, 1, 0),
    snake.mesh.rotation.y
  );

  const desiredPosition = snake.mesh.position.clone().add(rotatedOffset);

  camera.position.lerp(desiredPosition, 1 - Math.pow(0.001, delta) * LERP_SPEED * 0.1);
  camera.lookAt(
    snake.mesh.position.x,
    snake.mesh.position.y + 1,
    snake.mesh.position.z
  );
}