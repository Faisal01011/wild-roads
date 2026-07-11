import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache: Map<string, THREE.Group> = new Map();

export async function loadModel(
  path: string,
  scaleCorrection = 1,
  recenter = false
): Promise<THREE.Group> {
  if (cache.has(path)) {
    return cache.get(path)!.clone(true);
  }

  return new Promise((resolve, reject) => {
    loader.load(
      path,
      (gltf) => {
        gltf.scene.scale.setScalar(scaleCorrection);

        let result: THREE.Group = gltf.scene;

        if (recenter) {
          gltf.scene.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const center = new THREE.Vector3();
          box.getCenter(center);

          // Apply the correction to the INNER model, not the outer wrapper —
          // so the wrapper's own position stays free to be set by placement code later
          gltf.scene.position.x -= center.x;
          gltf.scene.position.z -= center.z;
          gltf.scene.position.y -= box.min.y;

          const wrapper = new THREE.Group();
          wrapper.add(gltf.scene);
          result = wrapper;
        }

        cache.set(path, result);
        resolve(result.clone(true));
      },
      undefined,
      (error) => {
        console.error(`Failed to load model: ${path}`, error);
        reject(error);
      }
    );
  });
}

export interface GameAssets {
  snake: THREE.Group;
  rabbit: THREE.Group;
  gull: THREE.Group;
  tree: THREE.Group;
  bush: THREE.Group;
  grass: THREE.Group;
  rock: THREE.Group;
}

export async function preloadAssets(): Promise<GameAssets> {
  const [snake, rabbit, gull, tree, bush, grass, rock] = await Promise.all([
    loadModel('/models/snake.glb', 0.054),
    loadModel('/models/rabbit.glb', 0.0009),
    loadModel('/models/gull.glb', 0.0113),
    loadModel('/models/tree.glb', 0.87, true),
    loadModel('/models/bush.glb', 0.68, true),
    loadModel('/models/grass.glb', 0.78),
    loadModel('/models/rock.glb', 0.70, true),
  ]);

  return { snake, rabbit, gull, tree, bush, grass, rock };
}