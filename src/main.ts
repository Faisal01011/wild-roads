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
snake.addToScene(scene);

const chunkManager = new ChunkManager(scene);
const rabbitManager = new RabbitManager(scene);

let score = 0;

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  snake.update(delta, scene);
  updateCameraFollow(camera, snake, delta);
  chunkManager.update(snake.head.position);

  const eaten = rabbitManager.update(delta, snake.head.position);
  if (eaten > 0) {
    for (let i = 0; i < eaten; i++) {
      snake.grow();
    }
    score += eaten;
    console.log('Score:', score, '| Length:', snake.length);
  }

  renderer.render(scene, camera);
}

animate();