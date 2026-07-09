import { createScene } from './world/scene';
import { createLighting } from './world/lighting';
import { createGround } from './world/ground';
import { createSnake } from './player/snake';

const { scene, camera, renderer } = createScene();
renderer.shadowMap.enabled = true;

createLighting(scene);

const ground = createGround();
scene.add(ground);

const snake = createSnake();
scene.add(snake);

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

animate();