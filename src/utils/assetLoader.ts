import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();
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

function processLoadedModel(
  rawScene: THREE.Group,
  scaleCorrection: number,
  recenter: boolean,
  isolateLargest: boolean
): THREE.Group {
  let baseScene = rawScene;

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

  return result;
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

  const isFbx = path.toLowerCase().endsWith('.fbx');

  return new Promise((resolve, reject) => {
    if (isFbx) {
      fbxLoader.load(
        path,
        (fbxScene) => {
          const result = processLoadedModel(fbxScene, scaleCorrection, recenter, isolateLargest);
          cache.set(path, result);
          animationsCache.set(path, fbxScene.animations ?? []);
          resolve(
            keepAnimations
              ? (SkeletonUtils.clone(result) as THREE.Group)
              : result.clone(true)
          );
        },
        undefined,
        (error) => {
          console.error(`Failed to load FBX model: ${path}`, error);
          reject(error);
        }
      );
    } else {
      gltfLoader.load(
        path,
        (gltf) => {
          const result = processLoadedModel(gltf.scene, scaleCorrection, recenter, isolateLargest);
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
          console.error(`Failed to load GLTF model: ${path}`, error);
          reject(error);
        }
      );
    }
  });
}

export function getModelAnimations(path: string): THREE.AnimationClip[] {
  return animationsCache.get(path) ?? [];
}

export interface GameAssets {
  trees: THREE.Group[];
  bushes: THREE.Group[];
  rocks: THREE.Group[];
  grassVariants: THREE.Group[];
}

export async function preloadAssets(): Promise<GameAssets> {
  const [tree1, tree2, tree3, tree4, bush1, bush2, bush3, rock1, rock2, rock3, grassLarge, grassLargeExtruded, grassSmall] =
    await Promise.all([
      loadModel('/models/Tree1.fbx', 0.0146, true, false),
      loadModel('/models/Tree2.fbx', 0.0141, true, false),
      loadModel('/models/Tree3.fbx', 0.0147, true, false),
      loadModel('/models/Tree4.fbx', 0.0131, true, false),
      loadModel('/models/Bush1.fbx', 0.0067, true, false),
      loadModel('/models/Bush2.fbx', 0.0105, true, false),
      loadModel('/models/Bush3.fbx', 0.0080, true, false),
      loadModel('/models/Rock1.fbx', 0.0080, true, false),
      loadModel('/models/Rock2.fbx', 0.0112, true, false),
      loadModel('/models/Rock3.fbx', 0.0057, true, false),
      loadModel('/models/Grass_Large.fbx', 0.0103, true, false),
      loadModel('/models/Grass_Large_Extruded.fbx', 0.0108, true, false),
      loadModel('/models/Grass_Small.fbx', 0.0089, true, false),
    ]);

  return {
    trees: [tree1, tree2, tree3, tree4],
    bushes: [bush1, bush2, bush3],
    rocks: [rock1, rock2, rock3],
    grassVariants: [grassLarge, grassLargeExtruded, grassSmall],
  };
}