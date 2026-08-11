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

export interface AssetLoadProgress {
  loaded: number;
  total: number;
  label: string;
}

interface PreloadDefinition {
  path: string;
  scale: number;
  label: string;
}

const PRELOAD_DEFINITIONS: PreloadDefinition[] = [
  { path: '/models/Tree1.fbx', scale: 0.0146, label: 'Finding old-growth trees' },
  { path: '/models/Tree2.fbx', scale: 0.0141, label: 'Raising the forest canopy' },
  { path: '/models/Tree3.fbx', scale: 0.0147, label: 'Planting the distant treeline' },
  { path: '/models/Tree4.fbx', scale: 0.0131, label: 'Finishing the forest edge' },
  { path: '/models/Bush1.fbx', scale: 0.0067, label: 'Shaping the undergrowth' },
  { path: '/models/Bush2.fbx', scale: 0.0105, label: 'Filling woodland clearings' },
  { path: '/models/Bush3.fbx', scale: 0.008, label: 'Scattering wild shrubs' },
  { path: '/models/Rock1.fbx', scale: 0.008, label: 'Laying weathered stone' },
  { path: '/models/Rock2.fbx', scale: 0.0112, label: 'Marking the old trail' },
  { path: '/models/Rock3.fbx', scale: 0.0057, label: 'Finishing rocky outcrops' },
  { path: '/models/Grass_Large.fbx', scale: 0.0103, label: 'Growing meadow grass' },
  { path: '/models/Grass_Large_Extruded.fbx', scale: 0.0108, label: 'Letting the grass move' },
  { path: '/models/Grass_Small.fbx', scale: 0.0089, label: 'Opening the trail' },
];

export async function preloadAssets(
  onProgress?: (progress: AssetLoadProgress) => void
): Promise<GameAssets> {
  let loaded = 0;
  const total = PRELOAD_DEFINITIONS.length;
  onProgress?.({ loaded, total, label: 'Preparing the wilderness' });

  const models = await Promise.all(
    PRELOAD_DEFINITIONS.map(async ({ path, scale, label }) => {
      const model = await loadModel(path, scale, true, false);
      loaded += 1;
      onProgress?.({ loaded, total, label });
      return model;
    })
  );

  const [tree1, tree2, tree3, tree4, bush1, bush2, bush3, rock1, rock2, rock3, grassLarge, grassLargeExtruded, grassSmall] =
    models;

  return {
    trees: [tree1, tree2, tree3, tree4],
    bushes: [bush1, bush2, bush3],
    rocks: [rock1, rock2, rock3],
    grassVariants: [grassLarge, grassLargeExtruded, grassSmall],
  };
}
