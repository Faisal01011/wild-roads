import * as THREE from 'three';
import { createScene } from './world/scene';
import { createLighting } from './world/lighting';
import { Snake } from './player/snake';
import { updateCameraFollow } from './world/cameraFollow';
import { ChunkManager } from './world/chunkManager';
import { RabbitManager } from './entities/rabbitManager';

const { scene, camera, renderer } = createScene();
renderer.shadowMap.enabled = true;

createLighting(scene);

const snake = new Snake();
scene.add(snake.mesh);

const chunkManager = new ChunkManager(scene);
const rabbitManager = new RabbitManager(scene);

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  snake.update(delta);
  updateCameraFollow(camera, snake, delta);
  chunkManager.update(snake.mesh.position);
  rabbitManager.update(delta, snake.mesh.position);

  renderer.render(scene, camera);
}

animate();