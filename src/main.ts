import * as THREE from 'three';
import { createScene } from './world/scene';
import { createLighting } from './world/lighting';
import { Snake } from './player/snake';
import { updateCameraFollow } from './world/cameraFollow';
import { ChunkManager } from './world/chunkManager';
import { RabbitManager } from './entities/rabbitManager';
import { BirdManager } from './entities/birdManager';
import { updateScoreDisplay, updateStaminaBar } from './utils/ui';

const { scene, camera, renderer } = createScene();
renderer.shadowMap.enabled = true;

createLighting(scene);

const snake = new Snake();
snake.addToScene(scene);

const chunkManager = new ChunkManager(scene);
const rabbitManager = new RabbitManager(scene);
const birdManager = new BirdManager(scene);

let score = 0;
updateScoreDisplay(score);

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  snake.update(delta, scene);
  updateCameraFollow(camera, snake, delta);
  chunkManager.update(snake.head.position);

  const eatenRabbits = rabbitManager.update(delta, snake.head.position);
  const eatenBirds = birdManager.update(delta, snake.head.position);
  const totalEaten = eatenRabbits + eatenBirds;

  if (totalEaten > 0) {
    for (let i = 0; i < totalEaten; i++) {
      snake.grow();
    }
    score += totalEaten;
    updateScoreDisplay(score);
  }

  updateStaminaBar(snake.staminaPercent);

  renderer.render(scene, camera);
}

animate();