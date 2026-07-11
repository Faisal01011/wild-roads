import * as THREE from 'three';
import { createScene } from './world/scene';
import { DayNightCycle } from './world/lighting';
import { Snake } from './player/snake';
import { updateCameraFollow } from './world/cameraFollow';
import { ChunkManager } from './world/chunkManager';
import { RabbitManager } from './entities/rabbitManager';
import { BirdManager } from './entities/birdManager';
import { updateScoreDisplay, updateStaminaBar } from './utils/ui';
import { audioManager } from './utils/audio';
import { preloadAssets } from './utils/assetLoader';

async function start() {
  const assets = await preloadAssets();

  document.getElementById('loading-screen')?.classList.add('hidden');

  const { scene, camera, renderer } = createScene();
  renderer.shadowMap.enabled = true;

  const dayNightCycle = new DayNightCycle(scene);

  const snake = new Snake();
  snake.addToScene(scene);

  const chunkManager = new ChunkManager(scene, assets);
  const rabbitManager = new RabbitManager(scene, assets.rabbit);
  const birdManager = new BirdManager(scene, assets.gull);

  let score = 0;
  updateScoreDisplay(score);

  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    dayNightCycle.update(delta);
    const rockColliders = chunkManager.getRockColliders();
    snake.update(delta, rockColliders);
    updateCameraFollow(camera, snake, delta);
    chunkManager.update(snake.head.position);

    const eatenRabbits = rabbitManager.update(delta, snake.head.position);
    const eatenBirds = birdManager.update(delta, snake.head.position);
    const totalEaten = eatenRabbits + eatenBirds;

    if (totalEaten > 0) {
      for (let i = 0; i < totalEaten; i++) {
        snake.grow(scene);
      }
      score += totalEaten;
      updateScoreDisplay(score);
      audioManager.playEat();
    }

    updateStaminaBar(snake.staminaPercent);

    renderer.render(scene, camera);
  }

animate();
}

start();
