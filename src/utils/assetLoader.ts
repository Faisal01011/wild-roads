import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const cache: Map<string, THREE.Group> = new Map();
const animationsCache: Map<string, THREE.AnimationClip[]> = new Map();

function isolateLargestChild(scene: THREE.Group): THREE.Group {
  if (scene.children.length <= 1) return scene;

  let largest: THREE.Object3D | null = null;
  let largestVolume = 0;

  for (const child of scene.children) {
    const box = new THREE.Box3().setFromObject(child);
    const size = new THREE.Vector3();
    box.getSize(size);
    const volume = size.x * size.y * size.z;

    if (volume > largestVolume) {
      largestVolume = volume;
      largest = child;
    }
  }

  if (!largest) return scene;

  const isolated = new THREE.Group();
  isolated.add(largest.clone(true));
  return isolated;
}

export async function loadModel(
  path: string,
  scaleCorrection = 1,
  recenter = false,
  isolateLargest = false,
  keepAnimations = false
): Promise<THREE.Group> {
  if (cache.has(path)) {
    return keepAnimations
      ? (SkeletonUtils.clone(cache.get(path)!) as THREE.Group)
      : cache.get(path)!.clone(true);
  }

  return new Promise((resolve, reject) => {
    loader.load(
      path,
      (gltf) => {
        let baseScene: THREE.Group = gltf.scene;

        if (isolateLargest) {
          baseScene = isolateLargestChild(baseScene);
        }

        baseScene.scale.setScalar(scaleCorrection);

        let result: THREE.Group = baseScene;

        if (recenter) {
          baseScene.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(baseScene);
          const center = new THREE.Vector3();
          box.getCenter(center);

          baseScene.position.x -= center.x;
          baseScene.position.z -= center.z;
          baseScene.position.y -= box.min.y;

          const wrapper = new THREE.Group();
          wrapper.add(baseScene);
          result = wrapper;
        }

        cache.set(path, result);
        animationsCache.set(path, gltf.animations ?? []);

        resolve(
          keepAnimations
            ? (SkeletonUtils.clone(result) as THREE.Group)
            : result.clone(true)
        );
      },
      undefined,
      (error) => {
        console.error(`Failed to load model: ${path}`, error);
        reject(error);
      }
    );
  });
}

export function getModelAnimations(path: string): THREE.AnimationClip[] {
  return animationsCache.get(path) ?? [];
}

export interface GameAssets {
  tree: THREE.Group;
  bush: THREE.Group;
  rock: THREE.Group;
}

export async function preloadAssets(): Promise<GameAssets> {
  const [tree, bush, rock] = await Promise.all([
    loadModel('/models/tree.glb', 0.87, true, true),
    loadModel('/models/bush.glb', 1, true, false),
    loadModel('/models/rock.glb', 0.70, true),
  ]);

  return { tree, bush, rock };
}