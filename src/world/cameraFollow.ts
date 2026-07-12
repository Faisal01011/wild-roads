import * as THREE from 'three';
import { Snake } from '../player/snake';
import { updateShake } from '../utils/effects';

const BASE_OFFSET = new THREE.Vector3(0, 4, -8);
const LERP_SPEED = 4;
const MAX_ZOOM_OUT = 1.6; // multiplier at very long snake length
const ZOOM_GROWTH_RATE = 0.015; // how quickly zoom-out ramps up per segment

let swayTime = 0;

export function updateCameraFollow(
  camera: THREE.PerspectiveCamera,
  snake: Snake,
  delta: number
) {
  swayTime += delta;

  const zoomFactor = Math.min(1 + snake.length * ZOOM_GROWTH_RATE, MAX_ZOOM_OUT);
  const offset = BASE_OFFSET.clone().multiplyScalar(zoomFactor);

  const rotatedOffset = offset.applyAxisAngle(
    new THREE.Vector3(0, 1, 0),
    snake.head.rotation.y
  );

  const sway = Math.sin(swayTime * 0.6) * 0.15;
  const desiredPosition = snake.head.position.clone().add(rotatedOffset);
  desiredPosition.x += sway;

  camera.position.lerp(desiredPosition, 1 - Math.pow(0.001, delta) * LERP_SPEED * 0.1);

  const shakeOffset = updateShake(delta);
  camera.position.add(shakeOffset);

  camera.lookAt(
    snake.head.position.x,
    snake.head.position.y + 1,
    snake.head.position.z
  );
}